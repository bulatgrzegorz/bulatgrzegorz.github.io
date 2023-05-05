---
date: 2023-05-04 21:13:33
layout: post
title: "HttpContext BodyReader and incremental json parser"
subtitle:
description: >-
  Other light way to read http request body using PipeReader and use it to incremental parse json content 
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1683233375/blog/pipes.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/c_scale,w_380/v1683233375/blog/pipes.jpg
category: blog
tags:
  - http
  - c#
  - json
  - pipes
  - span
  - allocation
  - performance
  - optimization
author: bulatgrzegorz
paginate: false
---

Prior to AspNetCore 3.0 our main way to reach http body of [request](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httprequest?view=aspnetcore-2.2) and [response](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httpresponse?view=aspnetcore-2.2) in `HttpContext` was to use `Body` property of type `Stream`. It has changed, and world of .NET pipelines was introduce into http, and we got access to new `BodyReader` and `BodyWriter` (about it some other time) constructs.

About pipelines in more details you can read [here](https://learn.microsoft.com/en-us/dotnet/standard/io/pipelines).

## BodyReader

It's read side of pipe with type [System.IO.Pipelines.PipeReader](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httprequest.bodyreader?view=aspnetcore-6.0#microsoft-aspnetcore-http-httprequest-bodyreader).

Among many interesting methods, I would like to focus at two we will use:

### AdvanceTo

Method moves forward underlying pipeline cursor. We have two overloads of this method:

>AdvanceTo(SequencePosition consumed)

>AdvanceTo(SequencePosition consumed, SequencePosition examined)

First parameter `consumed` simply marks place of the data that has been already consumed. Which mean that we already consumed data to this position and we expecting to get new one when asked next time.

Second parameter examined allow us to mark data as already seen. This enabled us to avoid reading if nothing new is available. For example in order to read whole pipe body at once we could:

```csharp
while (true)
{
    var result = await pipeReader.ReadAsync();

    if (result.IsCompleted)
    {
        return result.Buffer.ToArray();
    }

    // Consume nothing, just wait for everything
    pipeReader.AdvanceTo(result.Buffer.Start, result.Buffer.End);
}
```

Above code will read more data each time we `advance`, to point where pipe reader result is completed (all data were returned). 

![visualization](/assets/img/posts/bodyreader/pipe_full_forward.gif)

But above solution is no much different (in result) from gathering whole data using stream. What pipes allow us to do, is to consume data piece by piece - incrementally. 

Imagine situation, where we would like to parse all available messages from given stream of data. In example we will be using some `ParseMessage` method, that accepts `ReadOnlySequence<byte>` and parse it returning messages while moving buffer to trim parsed message out of it. 

```csharp
while (true)
{
    var result = await reader.ReadAsync();
    var buffer = result.Buffer;

    // Parse messages from buffer one by one, modifying the input buffer on each iteration.
    while (ParseMessage(ref buffer, out Message message))
    {
        await ProcessMessage(message);
    }

    // There's no more data to be processed.
    if (result.IsCompleted)
    {
        break;
    }

    // Since all messages in the buffer are being processed, you can use the
    // remaining buffer's Start and End position to determine consumed and examined.
    reader.AdvanceTo(buffer.Start, buffer.End);
}
```

After each read from pipe we are parsing and processing all messages that we found there. After no more messages in particular buffer slice we are moving forward, gathering new data to buffer.

Each call to `ParseMessage` will move buffer forward, setting `consumed` value at end of parsed message while `examined` will stay at the end of buffer allowing us to move forward with further reading. 

>Note `consumed` and `examined` aren't necessary same - end of message could have place earlier then end of given buffer slice that we examined.

![visualization](/assets/img/posts/bodyreader/pipe_messages_incremental.gif)

## ReadAsync

Methods reads sequence of bytes from given `PipeReader`. Result of this call is a type: [ReadResult](https://learn.microsoft.com/en-us/dotnet/api/system.io.pipelines.readresult). 

Sequence of bytes is being kept in property `Buffer` of type `ReadOnlySequence<T>`.
> ReadOnlySequence is a construct for representation of memory that doesn't exists in one piece - continuos chunk of memory like Span.

It does also contains properties `IsCanceled` and `IsCompleted`. We already used second one in previous examples to indicate whether end of data stream has been reached.

---

Having that we can move into clue of this post. Incrementally parsing json data read from pipeline. Let's write code that will try to find some specific property by name in json body, and will return it's value.

First we will read data, and pass buffer into our parsing method:
```csharp
while(true)
{
    var readResult = await pipeReader.ReadAsync();
    var buffer = readResult.Buffer;

    var result = TryParseFromJson(ref buffer);
    if(result.HasValue)
    {
        return result.Value;
    }

    pipeReader.AdvanceTo(buffer.Start, buffer.End);

    if(readResult.IsCompleted)
    {
        break;
    }
}

return null;
```

Nothing new here, we just call parsing method each time after reading data. Parsing method is responsible for slicing buffer in specific way, making our job to just call `AdvanceTo`.

Let's examine parsing method:
```csharp
private static readonly byte[] PropertyNameBytes = Encoding.UTF8.GetBytes("propertyNameToSearchFor");

static bool TryParseFromJson(ref ReadOnlySequence<byte> buffer, out string? value)
{
    var utf8JsonReader = new Utf8JsonReader(buffer);
    while(utf8JsonReader.Read())
    {
        if(utf8JsonReader.TokenType != JsonTokenType.PropertyName)
        {
            continue;
        }

        if(!utf8JsonReader.ValueTextEquals(PropertyNameBytes))
        {
            continue;
        }

        //Not enough data to read our token value 
        if(!utf8JsonReader.Read())
        {
            value = null;
            return false;
        }

        if(utf8JsonReader.TokenType != JsonTokenType.String)
        {
            continue;
        }

        value = utf8JsonReader.GetString();

        return true;
    }

    value = null;
    buffer = buffer.Slice(utf8JsonReader.Position);

    return false;
}
```

Moving step by step, first what are we doing is creating instance of new `Utf8JsonReader`.
This is high-performance, low allocation, forward-only reader that can parse UTF-8 encoded text from span's and sequences. More about it [here](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/use-dom-utf8jsonreader-utf8jsonwriter?pivots=dotnet-7-0#use-utf8jsonreader).

We can pass whole buffer to it's constructor, and ask reader for parsing our json into separate tokens, one by one. We are looking for token of type `PropertyName` which text value will match our property we are looking for (here precalculated as byte array in static field `PropertyNameBytes`). If we found one, we asking reader for new token - where should be value we are looking for.

If after examine every token in given buffer we didn't found our property, we slicing our buffer to position of last examined token. This way, next time we won't read same json data.

So far so good. But our implementation have few problems.
Our `Utf8JsonReader` is not prepared to start reading json somewhere in middle - this will happen if we would need to load more data to buffer before founding property.
Also, if we found property, but there are no enough data to read its value, next time with more data we will need to parse all this data again.

Fortunately, `Utf8JsonReader` here for help. We can use different constructor overload, that allow us to pass ReaderState and inform that our data it's not nesesery final json block.

> public Utf8JsonReader (System.Buffers.ReadOnlySequence<byte> jsonData, bool isFinalBlock, System.Text.Json.JsonReaderState state);

```csharp
var utf8JsonReader = new Utf8JsonReader(buffer, false, readerState);
```

To fix problem with redundant reads, we will just slice our buffer in right place - just before last examined token.

```csharp
//Not enough data to read our token value 
if(!utf8JsonReader.Read())
{
    value = null;
    buffer.Slice(lastKnownPositionBeforeOurProperty)
    return false;
}
```

To sum up, we should be dealing with something like:
```csharp
static bool TryParseFromJson(ref ReadOnlySequence<byte> buffer, ref JsonReaderState readerState, out string? value)
{
    SequencePosition? previousTokenSequencePosition = default;
    JsonReaderState previousTokenReaderState = default;

    var utf8JsonReader = new Utf8JsonReader(buffer, isFinalBlock: false, readerState);
    while(utf8JsonReader.Read())
    {
        if(utf8JsonReader.TokenType != JsonTokenType.PropertyName)
        {
            previousTokenSequencePosition = utf8JsonReader.Position;
            previousTokenReaderState = utf8JsonReader.CurrentState;
            continue;
        }

        if(!utf8JsonReader.ValueTextEquals(PropertyNameBytes))
        {
            previousTokenSequencePosition = utf8JsonReader.Position;
            previousTokenReaderState = utf8JsonReader.CurrentState;
            continue;
        }

        //Not enough data to read our token value 
        if(!utf8JsonReader.Read())
        {
            if(previousTokenSequencePosition is not null)
            {
                buffer = buffer.Slice(previousTokenSequencePosition.Value);
            }

            readerState = previousTokenReaderState;

            value = null;
            return false;
        }

        if(utf8JsonReader.TokenType != JsonTokenType.String)
        {
            continue;
        }

        value = utf8JsonReader.GetString();

        return true;
    }

    buffer = buffer.Slice(utf8JsonReader.Position);
    readerState = utf8JsonReader.CurrentState;

    value = null;

    return false;
}
```