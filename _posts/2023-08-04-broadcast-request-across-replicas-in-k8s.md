---
date: 2023-08-04 16:15:01
layout: post
title: "Broadcast request across replicas in k8s"
subtitle:
description: >-
  Way to deliver message to each replica of deployment on the example of cache invalidation
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1691342934/blog/broadcast.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/c_scale,w_380/v1/blog/broadcast.jpg
category: blog
tags:
  - architecture
  - c#
  - k8s
author: bulatgrzegorz
paginate: false
---

Sometimes in our systems we do need to deploy multiple instances of a single service. We are doing this to for example increase traffic load that we can accept or to make it high available. Such architectures have many cons and pros, but today I would like to discuss very specific problem.

Let us imagine situation in which we would need to send message to each instance of our service. This could be process of cache invalidation for data that is being cashed in each instance locally ([MemoryCache](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.caching.memorycache) for example).

# Solutions

## Fixed instances

Solution can vary based on environment in which your system is deployed. If for example your service instances count is fixed, and their addresses are well known - it can be as easy as making call to each of them:
```csharp
await client.PostAsync("https://kown-host1:8889/cache-invalidation", default);
await client.PostAsync("https://kown-host2:8889/cache-invalidation", default);
await client.PostAsync("https://kown-host3:8889/cache-invalidation", default);
``` 

It becomes harder when we do not know exact host addresses or/and instances are being dynamically created and removed.

## Pub/sub

We could use some pub/sub platform to publish message to topic and listen for it in our services.

For needs of our example we will use [redis pub/sub](https://redis.io/docs/interact/pubsub/).
In order to test it locally you can run redis by easily executing:
```
docker run -p 6379:6379 -d redis
```

We will create producer and subscriber using [StackExchange.Redis](https://github.com/StackExchange/StackExchange.Redis) package.

Using that package, connecting to redis pub/sub is easy as: 
```csharp
var connection = await ConnectionMultiplexer.ConnectAsync("localhost:6379");
var pubSub = connection.GetSubscriber();
var channel = RedisChannel.Pattern("cache-invalidation");
```


In producer code, we will simply periodically push message to `cache-invalidation` channel:
```csharp
while (true)
{
    var message = DateTime.UtcNow.ToLongTimeString();
    await pubSub.PublishAsync(channel, new RedisValue(message));

    Console.WriteLine($"Message {message} sent...");
    
    await Task.Delay(1000);
}
```

and on the other side, subscriber will listen for upcoming messages:
```csharp
var channelQueue = await pubSub.SubscribeAsync(channel);
await foreach  (var message in channelQueue)
{
    Console.WriteLine($"Message received: {message.Message}...");
}
```

Running, it should behaive as expected:
![visualization](/assets/img/posts/broadcastrequest/pubsub.gif)
Each message will be consumed independently by each instance.  

> **_NOTE:_** Here we used redis pub/sub as example, but we virtually could use any other pub/sub or message broker system (Azure Service Bus, RabbitMq, ActiveMq, Kafka...). 
Solution in each of them will be little bit different, but at the end it will be possible to achieve same result.


## K8s

But what if we don't want to introduce another brick (pub/sub, broker) in our system but still need to send message to each of instance (replica).

### Headless service

When creating k8s service we have four different types we can choose from (ClusterIP, NodePort, LoadBalancer, ExternalName). In each of them (without going in much details - more can be found [here](https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services-service-types)) service would have some IP address assigned to it.
It can vary but at the end, when asking for service with tool like `nslookup` we will end up with result like:
```
# nslookup normal-service
Server:         10.43.0.10
Address:        10.43.0.10#53

Name:   normal-service.default.svc.cluster.local
Address: 10.43.95.82
```

It will be similar for each of above types - more about differences in great blog post [here](https://medium.com/swlh/kubernetes-services-simply-visually-explained-2d84e58d70e5).

But there is another way how we can create service, by explicitly setting `cluterIP` to `None`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: headless-service
spec:
  clusterIP: None
  selector:
    app: web
  ports:
    - protocol: TCP
      port: 80
```

This way we will create [headless service](https://kubernetes.io/docs/concepts/services-networking/service/#headless-services), that unlike previous one will not have any IP assigned to it, rather when asked for, will return each pod's IP (each pod that will be selected by tags given in selector):
```
# nslookup headless-service
Server:         10.43.0.10
Address:        10.43.0.10#53

Name:   headless-service.default.svc.cluster.local
Address: 10.42.0.224
Name:   headless-service.default.svc.cluster.local
Address: 10.42.0.229
``` 

### Broadcast

It's easy to notice that we can use headless service to simplify k8s case to one with fixed instances and known hosts:

```csharp
var podAddresses = Dns.GetHostAddresses("headless-service");
foreach(var podAddress in podAddresses)
{
  await client.PostAsync($"https://{podAddress}:8889/cache-invalidation", default);
}
```

But we can go with little bit more generic solution. What we could do is to create separate api - that would broadcast (fan-out) requests for each pod - when still hiding whole complexity from it's clients.

### Api

Let start with declaring endpoint signature:
```csharp
app.Map("/{serviceName}/{targetPort}/{*rest}", async (string serviceName, int targetPort, string? rest) => { });
```
This one will listen for each HTTP method. In URL we are expecting to be given name of headless service that should be use to execute request, and optional rest of URI ([route-template](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/routing?view=aspnetcore-7.0#route-templates)) that should be use for creating upstream URL.

It will match URL's like:
* `/headless-service/80`\
serviceName = `headless-service`, targetPort = 80
* `/service2/8888/api/v2/cache-invalidation`\
serviceName = `service2`, targetPort = 8888, rest = `api/v2/cache-invalidation`

Service name will be used as shown above to gather pods IP addresses. We are also expecting target port on which pods are listening for requests (unfortunately without using k8s API I could not find any other way to find info about pod's port).

---

We are going to read whole request body (if any) for future request building:
```csharp
public static async Task<byte[]?> GetRequestBodyBytesAsync(this HttpContext httpContext)
{
    if (httpContext.Request.ContentLength is null or 0 && !httpContext.Request.Headers.ContainsKey(HeaderNames.TransferEncoding))
    {
        return null;
    }

    var method = httpContext.Request.Method;

    if (HttpMethods.IsGet(method) || HttpMethods.IsHead(method) || HttpMethods.IsDelete(method) || HttpMethods.IsConnect(method) || HttpMethods.IsTrace(method))
    {
        return null;
    }

    while (!httpContext.RequestAborted.IsCancellationRequested)
    {
        var readResult = await httpContext.Request.BodyReader.ReadAsync(httpContext.RequestAborted);
        if (readResult.IsCompleted || readResult.IsCanceled)
        {
            return readResult.Buffer.ToArray();
        }

        httpContext.Request.BodyReader.AdvanceTo(readResult.Buffer.Start, readResult.Buffer.End);
    }

    httpContext.RequestAborted.ThrowIfCancellationRequested();

    return null;
}
```

Existing of request body is signaled by content length or transfer encoding header (according to [RFC 3.3](https://datatracker.ietf.org/doc/html/rfc7230#section-3.3)).

We should also not send body for methods Get/Head/Delete/Connect - it has no defined semantics and can cause some problems [RFC 4.3.1](https://datatracker.ietf.org/doc/html/rfc7231#section-4.3.1) [RFC 4.3.2](https://datatracker.ietf.org/doc/html/rfc7231#section-4.3.2), [RFC 4.3.5](https://datatracker.ietf.org/doc/html/rfc7231#section-4.3.5), [RFC 4.3.6](hhttps://datatracker.ietf.org/doc/html/rfc7231#section-4.3.6)). In case of Trace request - request must not contains body [RFC 4.3.8](https://datatracker.ietf.org/doc/html/rfc7231#section-4.3.8).

Having this we can move on to creating `HttpRequestMessage` for each request:
```csharp
private static HttpRequestMessage CreateProxyHttpRequest(this HttpRequest request, Uri uri, byte[]? requestBody)
{
    var requestMessage = new HttpRequestMessage()
    {
        RequestUri = uri,
        Headers = { Host = uri.Authority }
    };

    if (requestBody is not null)
    {
        requestMessage.Content = new ByteArrayContent(requestBody);
    }

    foreach (var header in request.Headers)
    {
        if (HeadersToExclude.Contains(header.Key))
        {
            continue;
        }
        
        if (header.Value.Count == 1)
        {
            string value = header.Value!;
            if (!requestMessage.Headers.TryAddWithoutValidation(header.Key, value))
            {
                requestMessage.Content?.Headers.TryAddWithoutValidation(header.Key, value);
            }
        }
        else
        {
            string[] values = header.Value!;
            if (!requestMessage.Headers.TryAddWithoutValidation(header.Key, values))
            {
                requestMessage.Content?.Headers.TryAddWithoutValidation(header.Key, values);
            }
        }
    }

    requestMessage.Method = new HttpMethod(request.Method);

    return requestMessage;
}
```

Everything above is straight forward. Only thing worth mentioning is collection of headers to be excluded, here we will be omitting header `Host` - as it is going to be different for every call. At the end we just need to return some single - packed result:

```csharp
var result = new
{
    Responses = calls.Select(x => new
    {
        x.Result.StatusCode,
        Address = x.Result.RequestMessage?.RequestUri
    })
};

var isSuccessFromAllCalls = calls.TrueForAll(x => x.Result.IsSuccessStatusCode);
return isSuccessFromAllCalls ? Results.Ok(result) : Results.BadRequest(result);
```

Full code can be found here: [k8s-request-broadcaster](https://github.com/bulatgrzegorz/k8s-request-broadcaster).