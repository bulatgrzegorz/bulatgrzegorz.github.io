---
date: 2025-02-05 16:15:01
layout: post
title: "Snapshot Testing with C# and WireMock:"
subtitle: "How to stop mocking APIs manually and start automating your tests like a wizard 🧙"
description: >-
  Learn how to simplify API testing in C# using snapshot recording and WireMock. No more manual mocks – just magic!
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1739218957/blog/snapshot.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/c_scale,w_380/v1/blog/snapshot
category: blog
tags:
  - c#
  - api
  - tests
  - wiremock
author: bulatgrzegorz
paginate: false
---

# What are we trying to solve

Picture this: Some time ago I had situation in which I had to test service that aggregated data from dozens of endpoints in multiple services (please don't judge me, life is not always like we would like it to be 😭). It looked something like:

![arch1](/assets/img/posts/snapshot/architecture.png)

Implementation is one thing, but then you are going to face another wall - how to integrate test it, without spending years on mocking data for each case and each service call.

I needed a way to:
1. Record real API interactions
2. Replay them in tests
3. Keep my sanity intact

Enter snapshot testing – the closest thing we have to a "time-turner" for API testing.

![time-turner](/assets/img/posts/snapshot/time-turner.png)

# Into the snapshot

Process I have came up with was as follow:
1. `Compatibility testing`: Find a good test scenario
2. `Recording mode`: Activate special mode in your service
3. `Record snapshots`: Capture real API interactions and save them
4. `Test run with snapshot data`: Replay recordings in tests using WireMock
5. `Compare results`: Validate outputs

Let's break down the magic:

## Compatibility Testing 🔮

*(We'll cover this in detail next time. For now, imagine we've stolen a good test case from production like proper coders do.)*

## Recording mode 🎥

In this part we need to somehow pass information to our service about executing context. We want to tell our service: *"Hey, do your normal thing, but also write down everything you see!".*\
Two ways (propositions) to do this:

A. `solution build configuration` Approach

We could create new configuration `Snapshot`, and use preprocessor as follow:
```csharp
//some code
#if SNAPSHOT
//code that will be executed only on Snapshot build configuration
#endif
```
*Pros:* It's very easy to be enabled in Rider/VS and rather hard to misconfigure service when not needed
![snapshot-setting](/assets/img/posts/snapshot/snapshot-conf.png)

*Cons:* More of a niche, and might make [Jon Skeet angry](https://youtu.be/JIlO_EebEQI?si=3pQSKQWiuUKkZWLN&t=1490).

---
B. Just configuration variable Approach:
```csharp
if (Configuration.GetValue<bool>("IsSnapshotMode"))
{
    // Special mode activated!
}
```
*Pros:* configuration value in .net apps that are using some kind of `IHost` builder may be pretty much anything, environment variable, setting file value, command line argument, etc. ([Asp.Net core configuration](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/?view=aspnetcore-9.0))

*Cons:* Requires actual adulting with configuration

## Record snapshots 📼

So what's our strategy is, we want to intercept each http client call and save information about it.

As interceptor we will implement custom [delegating handler](https://learn.microsoft.com/en-us/dotnet/api/system.net.http.delegatinghandler?view=net-8.0):
```csharp
public class RecorderDelegatingHandler : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = await base.SendAsync(request, cancellationToken);

        // Capture request/response details 
        var address = Uri.UnescapeDataString(request.RequestUri!.PathAndQuery);
        var method = request.Method.ToString();
        var responseStatusCode = (int)response.StatusCode;
        var requestContent = request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken);
        var responseContent = await response.Content.ReadAsStringAsync(cancellationToken);
        
        return response;
    }
}
```
**Key Notes**:
* This implementation is intended for one-time use; therefore, it prioritizes readability and ease of modification over optimization
* Doesn’t handle duplicate requests with different responses

So we do have data describing http call, but still, we need to save it somehow. Let's create something that will be responsible for that:

```csharp
public record Snapshot(string Address, string Method, string RequestBody, string ResponseBody, int StatusCode);

public class Recorder : IAsyncDisposable
{
    private readonly ConcurrentBag<Snapshot> _snapshots = [];

    public void AddSnapshot(Snapshot snapshot) => _snapshots.Add(snapshot);

    public async ValueTask DisposeAsync()
    {
        var json = JsonSerializer.Serialize(_snapshots.OrderBy(s => s.Address));
        await File.WriteAllTextAsync("snapshot.json", json);
    }
}
```

![pensieve](/assets/img/posts/snapshot/pensieve.jpg)

Having that we can simply use `IHttpContextAccessor` in our delegate and create instance of our 
`Recorder` class and store snapshots.

What's left is registration code:

```csharp
public static IServiceCollection AddSnapshot(this IServiceCollection services){
#if SNAPSHOT
  services.TryAddTransient<RecorderDelegatingHandler>();
  services.AddHttpContextAccessor();
  services.TryAddScoped<Recorder>();

  services.ConfigureAll<HttpClientFactoryOptions>(o => 
  o.HttpMessageHandlerBuilderActions.Add(b => b.AdditionalHandlers.Insert(b.AdditionalHandlers.Count, b.Services.GetRequiredService<RecorderDelegatingHandler>)));
#endif
  return services;
}
```

Beside registering our delegate and recorder to DI container, we are also configuring all `HttpClientFactoryOptions` that are present in application. This way, each `HttpClient` that is going to be used via `IHttpClientFactory` (so typed clients as well) are going to be supported by our add-on.

Let's test it, and make two calls in some endpoint:
```csharp
app.MapGet("/spellsAndIngredients", async (IHttpClientFactory httpClientFactory) =>
{
    var httpClient = httpClientFactory.CreateClient();
    httpClient.BaseAddress = new Uri("https://wizard-world-api.herokuapp.com/");

    var spells = await httpClient.GetFromJsonAsync<Spell[]>("Spells?Type=Spell");
    var ingredients = await httpClient.GetFromJsonAsync<Ingredient[]>("Ingredients?Name=Dragon");
    
    return new {spells, ingredients};
});
```

After it finishes we can examine our snapshot file:
```json
[
  {
    "Address": "/Ingredients?Name=Dragon",
    "Method": "GET",
    "RequestBody": "",
    "ResponseBody": "[/*...*/]",
    "StatusCode": 200
  },
  {
    "Address": "/Spells?Type=Spell",
    "Method": "GET",
    "RequestBody": "",
    "ResponseBody": "[/*...*/]",
    "StatusCode": 200
  }
]
```
and as we can see, all calls has been successfully saved into the file.

## Test run with snapshot data 🧪

Now for the fun part – replaying our recordings using [WireMock.NET](https://github.com/WireMock-Net/WireMock.Net). For testing we are going to use [WebApplicationFactory](https://learn.microsoft.com/en-us/aspnet/core/test/integration-tests?view=aspnetcore-9.0).

Our test look like follows:
```csharp
[Fact]
public async Task Should_Get_Snapshot_Spells()
{
    using var wireMock = WireMockServer.Start(port: 61656, useSSL: false);
    
    // Load our snapshot
    var snapshots = LoadSnapshots("snapshot.json");

    foreach (var snapshot in snapshots)
    {
        wireMock
            .Given(Request.Create()
                .WithRelativePath(snapshot!.Address)
                .WithRequestBody(snapshot.RequestBody)
                .WithMethod(snapshot.Method))
            .RespondWith(Response.Create()
                .WithStatusCode(snapshot.StatusCode)
                .WithBody(snapshot.ResponseBody));
    }

    var httpResponse = await _client.GetAsync("spellsAndIngredients");
    var contentResponse = await httpResponse.Content.ReadAsStringAsync();
    
    await Verify(contentResponse.ToIndentedJson()); // Using Verify library
}
```

We are starting our in process wire mock instance and create mocks based on our snapshot file.

After mappings/mocks are done, we can simply call our service endpoint - and just [Verify lib](https://github.com/VerifyTests/Verify) to test response.

# Conclusions 🏁

After implementing this snapshot sorcery, here's what we've learned:
* Testing Complex Services Doesn’t Have to Be Dark Magic\
By recording real API interactions once, we eliminate the need for manual mock setup in every test
* The Force Is Strong with This Approach\
  It might reduce time setup in some specific scenarios by A LOT 🚀
* Great Power Comes with Great Responsibility\
  Snapshots need occasional updates as APIs evolve. If your datasource change often, it might be messy!

Next Time: We’ll dive into compatibility testing – how to find perfect test scenarios without disturbing real users. Until then, may your tests be green and your mocks be ever-accurate!

Full code example can be found [here]([https://github.com/bulatgrzegorz/snapshot-testing]).