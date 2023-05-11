---
date: 2023-05-06 18:40:35
layout: post
title: "Context propagation in distributed systems and cooperation with OpenTelemetry"
subtitle:
description: >-
  How to propagate context between distributed systems and take advantage of it using OpenTelemetry 
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1683401619/blog/context_propagation_vhvxcj.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/c_scale,w_380/v1683401619/blog/context_propagation_vhvxcj.jpg
category: blog
tags:
  - http
  - c#
  - communication
  - openTelemetry
  - tracing
author: bulatgrzegorz
paginate: false
---

# Tracing introduction

While building software systems sooner or later you will come across communication that happens between some separate components.
It could be front-end calling back-end, it could be distributed microservice architecture deployed over huge cluster.
Nevertheless we will end up with executions that are being handled by separate processes - and finally we would probably like to correlate them in order to investigate some problems, analyze performance bottlenecks or just read logs from those separate processes joint together.

![system](/assets/img/posts/contextpropagation/system_graph.png)

In past there we had multiple libraries, code circulate on stackoverflow that was supposed to handle those correlations for us. Problem, as usually was with such local solutions - no standardization.

This has changed with publication and popularization of [W3C Recommendation of TraceContext](https://www.w3.org/TR/trace-context/#trace-context-http-headers-format). It does defines HTTP headers and their value format that should be used in order to propagate context information across distributed systems. Later also other protocols was described (however for now only as internal documents - without official standing):
 * [MQTT](https://w3c.github.io/trace-context-mqtt/)
 * [AMQP](https://w3c.github.io/trace-context-amqp/)

About tracing in asynchronous communication in messaging systems I highly recommend OpenTelemetry [specification](https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/messaging/).

# Usage

Am not going to write another post explaining how to integrate OpenTelemetry with your C# project. There are already many materials explaining it in great details (starting with OpenTelemetry [site](https://opentelemetry.io/docs/instrumentation/net/getting-started/)), and this is also not topic of this post.

What I would like to introduce, is the ease in which you can integrate your communication library with tracing and allow users to use it in unified and simple way.
First, lets understand few constructs that we are going to be using.

## Activity

In .NET Activity is a representation of unit of work in trace. While whole trace is represented by tree of activities. Each activity could potentially took place in different processes. Other common name for such constructs you can find is "Span" - for example used in OpenTelemetry.  

![system](/assets/img/posts/contextpropagation/activity_trace.png)

Tree structure as shown above allowing us to track sub operations of root action and investigate them individually.
Activities contains information about operation name, identifiers, start time, duration, tags, events, baggage and others.

### Identifiers

To be able to build trace hierarchy, each activity records trace id, its own span id and parent span id. Trace id is an unchanging value for whole lifetime of trace, it is being generated as root level, and being passed to each span.
Span id is being generated for each new Activity and it is identifying it uniquely. Parent span id is just span id of parent activity (in context of tree).

![system](/assets/img/posts/contextpropagation/activity_id.png)

> Note: Above description is describing W3C standard of trace identifiers [TraceContext](https://www.w3.org/TR/trace-context/). It is being default scheme in .NET staring from version 5. Before that - "Hierarchical" scheme was used, that is not going to be described here. 

### Operation name

Operation name should identify work of action in human-readable form. It should be most general thing that is useful for grouping and filtering. For example it could be something like: `"GetAccount"`, `"CalculateProvision"`, `"/products/{productId}"` - but shouldn't be very specific, with high cardinality - like `"/products/51241"`.

### Time

Each started activity captures current time that is being used to calculate Duration when its stops. 

### Others
More details about Activity and its data can be found [here](https://learn.microsoft.com/en-us/dotnet/core/diagnostics/distributed-tracing-concepts).

## ActivitySource

Although activities can be created by them own (using constructor), it is highly recommended to use [ActivitySource](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.activitysource?view=net-7.0) for that. 

One of important reasons for it is that `ActivitySource` keeps track of `listeners`. Each `listener` can setup its own sampling conditions that enabling him to listen just the subset of created activities rather then all of them. This can have big impact to overall performance of application. 

Because of those mechanisms, when creating activity (and specifying their details) that no one is interested in, activity can not be created (`null` is returned).

Typically, an `ActivitySource` is created once per application, for example in static context:
```csharp
public static class ApplicationTracing
{
    public static readonly ActivitySource AppActivitySource = new("AppName");
}
```

Using this instance we can create our application activities by calling:
```csharp
var activity = ApplicationTracing.AppActivitySource.StartActivity("operation name");
```
That will create (taking sampling and filtering into account) and start activity.

## ActivityContext

Struct containing information about W3C TraceContext.

## DistributedContextPropagator

Abstract class that contains implementation of how distributed context should be encoded/decoded and propagated. It's transport agnostic, and can work over anything that supports string key-value pairs (like http headers). 

It's exposing methods to inject activity into carrier, extract activity id and trace state from carrier, and others.

We have three built in implementations:
* LegacyPropagator `(default one)`\
It will extract and inject headers with names of "tracestate" and "traceparent" identifier which are formatted according to W3C standard.
* PassThroughPropagator\
It will act transparently, using root activity as data source, ignoring all intermediate activities created while processing the request.
* NoOutputPropagator\
Will use `LegacyPropagator` for extraction, but will not inject anything.
  > Will not inject anything other then baggage - that is being handled by `DistributedContextPropagator` itself.
  
  It could be usefully when we just want to extend baggage collection, without interfering in propagated context itself.


# Sample code

We will implement two sample middleware's - one for outgoing message, one for incoming.

```csharp
public class OutgoingMiddleware
{
    public async Task Execute(MessageContext context, Func<Task> next)
    {
        var activity = StartActivity(context);

        try
        {
            await next();
        }
        catch (Exception e)
        {
            activity?.MarkAsFailed(e);
            throw;
        }
        finally
        {
            activity?.Dispose();
        }
    }

    private static Activity? StartActivity(MessageContext context)
    {
        var operationName = $"{context.Topic} publish";
        var activity = CustomActivitySource.StartActivity(operationName, ActivityKind.Producer);

        if (activity is null)
        {
            return null;
        }
            
        var propagator = DistributedContextPropagator.Current;
        propagator.Inject(activity, context, static (carrier, name, value) =>
        {
            var messageContext = (MessageContext)carrier!;
            messageContext.Headers.TryAdd(name, value);
        });

        return activity;
    }
}
```

Whole process is pretty straight forward. We starting activity with specific operation name and kind. If activity was created (it wasn't sampled out) we injecting distributed context to our `MessageContext`.

Incoming middleware is little bit more complex:

```csharp
public class IncomingMiddleware
{
    public async Task Execute(MessageContext context, Func<Task> next)
    {
        var activity = StartActivity(context);

        try
        {
            await next();
        }
        catch (Exception e)
        {
            activity?.MarkAsFailed(e);
            throw;
        }
        finally
        {
            activity?.Dispose();
        }
    }

    private static Activity? StartActivity(MessageContext context)
    {
        if (!CustomActivitySource.HasListeners())
        {
            return default;
        }
        
        var propagator = DistributedContextPropagator.Current;
        propagator.ExtractTraceIdAndState(context,
            static (object? carrier, string name, out string? value, out IEnumerable<string>? values) =>
            {
                values = default;
                var context = (MessageContext)carrier!;
                context.Headers.TryGetValue(name, out value);
            }, out var requestId, out var traceState);
        
        Activity? activity;
        
        var operationName = $"{context.Topic} process";
        if (ActivityContext.TryParse(requestId, traceState, true, out var activityContext))
        {
            activity = activitySource.CreateActivity(operationName, ActivityKind.Producer, activityContext);
        }
        else
        {
            activity = activitySource.CreateActivity(operationName, ActivityKind.Producer, string.IsNullOrEmpty(requestId) ? null : requestId);
        }

        if (activity is null)
        {
            return null;
        }
        
        if (!string.IsNullOrEmpty(requestId))
        {
            var baggage = propagator.ExtractBaggage(context, 
            static (object? carrier, string fieldName, out string? fieldValue, out IEnumerable<string>? fieldValues) =>
            {
                fieldValues = default;
                var context = (MessageContext)carrier!;
                context.Headers.TryGetValue(fieldName, out fieldValue);
            });

            if (baggage is not null)
            {
                foreach (var baggageItem in baggage)
                {
                    activity.AddBaggage(baggageItem.Key, baggageItem.Value);
                }
            }
        }
        
        return activity.Start();
    }
}
```

Using distributed propagator we trying to extract propagated context from our `MessageContext`. If one wasn't found, we will just create plain new `Activity`.
If we extracted data, and it was successfully parsed by `ActivityContext` we are using those to create activity with parent data.

Lastly we also propagate extracted baggage to newly `Activity`.

`MessageContext` class that we used in our sample it's just class that contains key/value pair collection that we are sending and collecting from some protocol: 
```csharp
public class MessageContext
{
    public string Topic { get; set; }
    
    public Dictionary<string, string> Headers { get; set; }
}
```

We also used little extension method, that was helpful in marking our `Activity` as failed if some exception occurred while processing next steps in middleware pipeline.  
```csharp
public static class ActivityExtensions
{
    public static void MarkAsFailed(this Activity activity, Exception exception)
    {
        activity.AddEvent(new ActivityEvent("exception", tags: new ActivityTagsCollection
        {
            ["exception.escaped"] = true,
            ["exception.message"] = exception.Message,
            ["exception.stacktrace"] = exception.StackTrace,
            ["exception.type"] = exception.GetType().FullName,
        }));
        
        activity.SetStatus(ActivityStatusCode.Error);
    }
}
```

Above implementations was highly inspired by one used in [AspNetCore](https://github.com/dotnet/aspnetcore/blob/55f7089461d58a38951762b57be32e0cda199d90/src/Hosting/Hosting/src/Internal/HostingApplicationDiagnostics.cs#L46), where activity is created when http request comes in.

Having all of this we can already integrate our communication library with tracing and propagate context. What's great about this implantation is that if nobody will listen for our activity source and activities it will cost us close to nothing.

Speaking about listeners, those days easiest way to integrate with tracing is `OpenTelemetry`. To make it easy for library clients, we can also prepare little extension method that will start listener:

```csharp
public static class OpenTelemetryTracingExtensions
{
    public static TracerProviderBuilder AddInstrumentation(this TracerProviderBuilder builder)
    {
        return builder.AddSource("AppName");
    }
}
```

What's important is to use same value in `AddSource` method, as we configured in our `ActivitySource` instance.