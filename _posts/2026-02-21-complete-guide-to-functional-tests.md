---
date: 2026-02-21 10:00:00
layout: post
title: "Complete Guide to Functional Tests"
subtitle: "Why functional tests might be the most valuable thing in your codebase"
description: >-
  Why functional tests are the most durable investment you can make — from AI-proof guardrails and living documentation to debugging superpowers and QA collaboration.
image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/v1771705365/blog/integration_tests.jpg
optimized_image: >-
  https://res.cloudinary.com/dljcybafb/image/upload/t_To43/v1771705365/blog/integration_tests.jpg
category: blog
tags:
  - c#
  - tests
  - functional-tests
  - testcontainers
  - tunit
  - aspire
author: bulatgrzegorz
paginate: false
---

# The AI era shifts testing priorities

In today's world when AI agents might produce huge amounts of code good tests are getting more important than ever. Without them we can't really progress fast, as checking if everything is fine will become our new bottleneck.

In traditional types of tests, we are usually verifying units of code - in isolation or in integration with each other.   
But here's the problem: those types of tests are tightly coupled to implementation. When an AI rewrites a method, changes a signature, or reshuffles internal logic, your tests may break. And as of course AI can change your tests as well, you will end up in the same place - verifying if behavior you are testing is still valid.

What should remain stable across all those rewrites? Business scenarios and contracts. *"When a user places an order with insufficient inventory, the order should be rejected."* \
That doesn't change no matter how many times the internals get refactored. Such tests verify exactly this — the database query still returns the right data, the Kafka message still gets published, the API still responds correctly — regardless of how the internals were reshuffled. For sake of this post I will call them: **functional tests** — tests that verify business function, not code structure.

This makes functional tests a much more durable investment in an AI-assisted workflow. They act as guardrails that let you confidently accept AI-generated changes. If the functional tests pass, the system still behaves correctly. The implementation details? Those are just an implementation detail.

![pyramid](/assets/img/posts/functionaltests/pyramid.jpg)

# Functional tests as living documentation

There is another benefit worth mentioning — those tests also become documentation. They describe **why** something exists and **how** it should behave — not in terms of method calls and mock setups, but in terms of business intent.

A well named test tells you quite a bit about behaviors in your system:

```csharp
[Test]
[Story("PROJ-4521")]
[Description("Orders with insufficient inventory should be rejected with appropriate error")]
public async Task Should_RejectOrder_When_InventoryIsInsufficient()
```

And unlike traditional documentations, it doesn't get stale as easily — it runs on every build, and it screams when the described behavior breaks.

Functional tests linked with bug or feature story allow anyone to take a look at and understand exactly what scenario it covers and *why* it was added. You get a traceable history of business decisions, encoded in executable code.

# A debugging superpower

They're also surprisingly useful for debugging. Modern services rarely live in isolation. Your application talks to a database, publishes to Kafka, stores files in Blob Storage, calls external APIs — the list goes on. And when something goes wrong, you need to debug it.

The traditional approach? Start docker-compose, attach a debugger, make sure connection strings are configured, then dig through your `.http` files or Postman collections to craft the right request. By the time you've reproduced the issue, you've lost half your morning.

With a well-structured functional test, all of this collapses into a single action: click Run on a test. The test spins up the infrastructure, seeds the necessary data, executes the exact scenario you care about — and you can place a breakpoint anywhere in the actual service code. No Postman, no manual setup.

![craft](/assets/img/posts/functionaltests/craft.jpg)

# QA and dev, side by side

The QA role is shifting as well. More and more teams expect QA engineers to write automated tests and be part of the creation process rather than rely purely on manual testing. But where do those tests live? Often in a separate repository, a separate framework, sometimes even a separate language — creating a gap between development and QA that's hard to bridge.

With a solid functional test project in the main repository, that gap disappears. QA engineers work alongside developers — same codebase, same pull requests, same CI pipeline.

This removes the handoff wall. QA doesn't wait for a deployed environment to start testing. Developers get immediate feedback from QA-authored scenarios. And everyone shares ownership of quality.

![sidebyside](/assets/img/posts/functionaltests/sidebyside.jpg)

# Dogfooding your own API

Working this way has one more side effect — you end up using your own API same way as you are serving it to your clients. You experience the same friction your clients will — clunky request models, confusing error responses, missing validation, inconsistent naming. 

You discover these problems immediately, not after someone else complains.

The test code itself becomes a practical usage example: how to authenticate, how to construct a request, what to expect in response. This can serve as a guide for other teams or external consumers — real, working code is always more trustworthy than hand-written API documentation.

# Why TUnit

For the examples in this post, I'll be using [TUnit](https://tunit.dev/) — a relatively new testing framework for .NET. If you've been using xUnit or NUnit for years, you might wonder why bother switching.

The biggest difference is architectural: TUnit uses source generation instead of runtime reflection to discover tests. Tests are resolved at compile time, which makes discovery faster and enables things like Native AOT compilation — something xUnit and NUnit can't do today.

A few things that make it a good fit for functional testing specifically:

- **Parallel by default** — all tests run in parallel, even within the same class. That's important is it does reflects real world usage and allows to quickly discover many problems.
- **Simple API** — one `[Test]` attribute for everything. No `[Fact]` vs `[Theory]` distinction, no cognitive overhead.
- **Clean lifecycle hooks** — `[Before(Test)]`, `[After(Class)]`, `[Before(Assembly)]` etc. No more juggling `IAsyncLifetime` and constructor injection for async setup.
- **Shared infrastructure via `ClassDataSource`** — this one is particularly useful for functional tests. You can inject expensive resources like Docker containers or networks into test classes and control their lifetime with `SharedType`.

# Testcontainers — real infrastructure in your tests

So we have a testing framework. But functional tests need actual infrastructure — a database, a message broker, blob storage. You can't fake those with in-memory substitutes and expect realistic results.

[Testcontainers](https://dotnet.testcontainers.org/) solves this by providing easy abstraction over provisioning containers. When tests finish, containers are destroyed. Clean slate every time.

The library provides a fluent API for configuring containers. Here's a PostgreSQL example using TUnit's `ClassDataSource`:

```csharp
public class PostgresContainer : IAsyncInitializer, IAsyncDisposable
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder("postgres:17").Build();

    public string ConnectionString => _container.GetConnectionString();

    public async Task InitializeAsync() => await _container.StartAsync();

    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}
```

With the `ClassDataSource<PostgresContainer>(Shared = SharedType.PerTestSession)` attribute we saw earlier, this container starts once for the entire test run. Every test class that needs Postgres just declares the property — no manual wiring.

Now we need to tie it all together. A `TestFixture` that owns all the infrastructure, builds a `WebApplicationFactory` with the real connection strings, and exposes an `HttpClient` ready to go:

```csharp
public class TestFixture : IAsyncInitializer
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder("postgres:17").Build();
    // Kafka and WireMock builders omitted for brevity

    private WebApplicationFactory<Program> _factory = null!;
    public HttpClient Client { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_postgres.StartAsync() /* , _kafka.StartAsync(), etc. */);

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Database", _postgres.GetConnectionString());
            // Inject Kafka and WireMock URLs here
        });

        Client = _factory.CreateClient();
    }
}
```

All containers start in parallel via `Task.WhenAll`, then the application boots with their connection strings. A test class just needs the fixture:

```csharp
[ClassDataSource<TestFixture>(Shared = SharedType.PerTestSession)]
public class OrderTests(TestFixture fixture)
{
    [Test]
    public async Task Should_RejectOrder_When_InventoryIsInsufficient()
    {
        var order = new CreateOrderRequest("SKU-001", Quantity: 100);

        var response = await fixture.Client.PostAsJsonAsync("/api/orders", order);

        await response.ShouldHaveStatusCode(HttpStatusCode.UnprocessableEntity);
    }
}
```

Infrastructure starts once, the application boots with real dependencies, and each test is just a scenario.

## The parallel context trap

But there is a catch when running tests in parallel. Because we share a single instance of WireMock and Kafka across all concurrent tests, the context becomes messy. If Test A and Test B both expect WireMock to return a specific response, or both publish a message to the same Kafka topic at the exact same time, they will step on each other's toes. Test A might accidentally consume Test B's message, or WireMock might return Test B's mock to Test A. 

Without careful isolation, our tests will become flaky. To solve this, we need a way to pass a unique context — usually a correlation ID — through our HTTP headers and message properties to ensure each test only interacts with its own data.

![sidebyside](/assets/img/posts/functionaltests/wiremock-conflict.png)

# Keeping context with OpenTelemetry

The solution is surprisingly elegant if you're already using OpenTelemetry — and you probably should be. The idea: **give each test its own trace, and let standard W3C trace propagation do the isolation for you**.

.NET's `Activity` API (which backs OpenTelemetry traces) already propagates context through async calls automatically. If we start an `Activity` before each test, every request that test makes will carry a unique `traceparent` header — and that header flows all the way through to the WebApi to any outbound calls (WireMock, Kafka, etc.).

## One activity per test

TUnit's lifecycle hooks make this trivial:

```csharp
private static readonly ActivitySource TestActivitySource = new("TestActivitySource");

[BeforeEvery(Test)]
public static void BeforeEveryTest()
{
    _ = TestActivitySource.StartActivity(TestContext.Current!.Metadata.TestName);
}

[AfterEvery(Test)]
public static void AfterEveryTest()
{
    Activity.Current?.Dispose();
}
```

Each test gets its own `Activity` with a unique `TraceId`.

## Scoping WireMock stubs to a trace

Here's where it pays off. When we register a WireMock stub, we can add a header matcher that requires the `traceparent` to contain our test's trace ID:

```csharp
new MatcherModel()
{
    Name = "WildcardMatcher",
    Pattern = $"*{Activity.Current.TraceId}*"
}
```

Now when Test A and Test B both set up a stub for `/inventory/SKU-001`, they don't collide. Test A's stub only matches requests carrying Test A's trace ID, and vice versa. The `traceparent` header acts as a natural isolation key — and we didn't have to invent any custom correlation mechanism.

**What's important** — this works because our API propagates trace context on its outbound HTTP calls by default (that's what `AddHttpClientInstrumentation()` does). We're just piggybacking on standard OpenTelemetry behavior.

## Marking test results on the trace

Since we already have an `Activity` per test, we can also record the test outcome on it. This becomes very useful when we add observability tooling later:

```csharp
[AfterEvery(Test)]
public static void AfterEveryTest()
{
    var currentContext = TestContext.Current!;
    var currentActivity = Activity.Current;

    if (currentActivity is not null)
    {
        var activityStatus = currentContext.Execution.Result?.State switch
        {
            TestState.Passed => ActivityStatusCode.Ok,
            TestState.Failed => ActivityStatusCode.Error,
            TestState.Skipped => ActivityStatusCode.Unset,
            _ => ActivityStatusCode.Unset
        };

        currentActivity.SetStatus(activityStatus);

        if (currentContext.Execution.Result?.Exception is { } exception)
            currentActivity.AddException(exception);
    }

    Activity.Current?.Dispose();
}
```

Every test now carries its pass/fail status and any exception as part of its trace. When a test fails, you won't just see "assertion failed" — you'll see the full trace of what happened, including every HTTP call the API made, every database query, every Kafka publish. But we need somewhere to actually *see* those traces — which brings us to Aspire.

<!-- TODO: Observability with Aspire — visibility into logs and root cause analysis -->