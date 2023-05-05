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

Prior to AspNetCore 3.0 our main way to reach body in [request](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httprequest?view=aspnetcore-2.2) and [response](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.http.httpresponse?view=aspnetcore-2.2) of `HttpContext` was to use `Body` property of type `Stream`. It has changed, and world of .NET pipelines was introduce into http, we get access to new `BodyReader` and `BodyWriter` (about it some other time) constructs.

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

After each read from pipe we are parsing and processing all messages that we found there. After no more messages in particural buffer slice we are moving forward, gathering new data to buffer.

Each call to `ParseMessage` will move buffer forward, setting `consumed` value at end of parsed message while `examined` will stay at the end of buffer allowing us to move forward with futher reading. 

>Note `consumed` and `examined` aren't nessesary same - end of message could have place ealier then end of given buffer slice that we examined.

![visualization](/assets/img/posts/bodyreader/pipe_messages_incremental.gif)