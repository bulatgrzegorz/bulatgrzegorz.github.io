---
date: 2023-08-04 16:15:01
layout: post
title: "Broadcast request across replicas in k8s"
subtitle:
description: >-
  Way to deliver message to each relica of deployment on the example of cache invalidation
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

# WIP

Sometimes in our systems we do need to deploy multiple instances of a single service. We doing this to for example increase traffic load that we are capable of acceping or to make it high available. Such architectures have many cons and prons, but today I would like to discuss very specific problem. 

Let's imagine situation in which we would need to send message to each instance of our service. This could be process of cache invalidation for data that is being cashed in each instance locally ([MemoryCache](https://learn.microsoft.com/en-us/dotnet/api/system.runtime.caching.memorycache) for example).

# Solutions

## Fixed instances

Solution can vary based on environment in which your system is deployed. If for example your service instances count is fixed and their addresses are well known - it can be as easy as making call to each of them:
```csharp
await client.PostAsync("https://kown-host1:8889/cache-invalidation", default);
await client.PostAsync("https://kown-host2:8889/cache-invalidation", default);
await client.PostAsync("https://kown-host3:8889/cache-invalidation", default);
``` 

It becomes harder when we do not know exact host addresses or/and instances are being dynamicly created and removed.

## Pub/sub

We could use some pub/sub platform in order to publish message to topic and listen for it in our services. Armed with such system we would sent message to topic and subscribe for it in each instance.

For needs of our example we will use [redis pub/sub](https://redis.io/docs/interact/pubsub/).
In order to run redis in local environment you can easly:
```
docker run -p 6379:6379 -d redis
```

then we need our publisher:
```csharp
using StackExchange.Redis;

var connection = await ConnectionMultiplexer.ConnectAsync("localhost:6379");
var pubSub = connection.GetSubscriber();

while (true)
{
    var message = DateTime.UtcNow.ToLongTimeString();
    await pubSub.PublishAsync(RedisChannel.Pattern("cache-invalidation"), new RedisValue(message));

    Console.WriteLine($"Message {message} sent...");
    
    await Task.Delay(1000);
}
```

and subscriber:
```csharp
using StackExchange.Redis;

var connection = await ConnectionMultiplexer.ConnectAsync("localhost:6379");
var pubSub = connection.GetSubscriber();

var channelQueue = await pubSub.SubscribeAsync(RedisChannel.Pattern("cache-invalidation"));
await foreach  (var message in channelQueue)
{
    Console.WriteLine($"Message received: {message.Message}...");
}
```

Running them, will behaive as expected:
![visualization](/assets/img/posts/broadcastrequest/pubsub.gif)
Each message will be consmued independently by each instance. 

In place of redis we could use any other popular pub sub system like: 
Azure Service Bus Topics, Kafka, Amazon SNS, ...

TODO:
We can also use message broker that allows for different consumers for a message.

## K8s

But what if we don't want to introduce another brick (pub/sub, broker) in our system but still need to sent message to each of instance (replica).


### Headless servicve

When creating k8s service we have four different types we can choose from (ClusterIP, NodePort, LoadBalancer, ExternalName). In each of them (without going in much details - more can be found [here](https://kubernetes.io/docs/concepts/services-networking/service/#publishing-services-service-types)) service would have some IP address assigned to it.
It can vary but at the end, when asking about service with tool like `nslookup` we will end up with single result like:
```
# nslookup normal-service
Server:         10.43.0.10
Address:        10.43.0.10#53

Name:   normal-service.default.svc.cluster.local
Address: 10.43.95.82
```

It will be simillar for each of above types - more about differences in great blog post [here](https://medium.com/swlh/kubernetes-services-simply-visually-explained-2d84e58d70e5).

But there is another way how we can create service, but explicitly setting cluter IP to `None`:
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
      targetPort: 8080
```

This way we will create [headless service](https://kubernetes.io/docs/concepts/services-networking/service/#headless-services), that unlike previous one will not have any IP assigned to it, rather when asked for, will return each pod's IP:
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

It's easy to see that we can use headless service to simplify k8s case to one with fixed instances and known hosts:

```csharp
var podAddresses = Dns.GetHostAddresses("headless-service");
foreach(var podAddress in podAddresses)
{
  await client.PostAsync($"https://{podAddress}:8889/cache-invalidation", default);
}
```

But we can go with little bit more generic solution. What we could do is to create separate api - that would broadcast requests for each pod - when still hiding whole complexity for it's clients.

Example code with use .NET 8.
```csharp
app.Map("/{serviceName}/{*rest}", async (string serviceName, string? rest) => { });
```

This will expose HTTP endpoint.