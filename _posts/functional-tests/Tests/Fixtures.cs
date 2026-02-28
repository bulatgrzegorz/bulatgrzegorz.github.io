using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Networks;
using Testcontainers.PostgreSql;
using Testcontainers.Kafka;
using WireMock.Net.Testcontainers;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net.Http.Json;
using System.Diagnostics;
using System.Net.Http.Headers;
using System.Text.Json;
using DotNet.Testcontainers.Containers;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Hosting;
using WireMock.Admin.Mappings;

namespace Tests;

public class DockerNetworkFixture : IAsyncDisposable
{
    public INetwork Network { get; private set; } = null!;
    public async Task InitializeAsync()
    {
        Network = new NetworkBuilder().Build();
        await Network.CreateAsync();
    }
    public async ValueTask DisposeAsync()
    {
        await Network.DeleteAsync();
        await Network.DisposeAsync();
    }
}

public class WireMockFixture : IAsyncDisposable
{
    public required DockerNetworkFixture DockerNetwork { get; init; }
    private WireMockContainer _container = null!;
    public string Url => TestsConfiguration.LocalMode ? _container.GetPublicUrl().TrimEnd('/') : $"http://wiremock:80";
    public async Task InitializeAsync()
    {
        _container = new WireMockContainerBuilder()
            .WithNetwork(DockerNetwork.Network)
            .WithNetworkAliases("wiremock")
            .Build();
        await _container.StartAsync();
    }
    public async ValueTask DisposeAsync() => await _container.DisposeAsync();

    public async Task DefineMock(MockedRequest request, MockedResponse response)
    {
        var adminClient = _container.CreateWireMockAdminClient();

        var mappingModel = new MappingModelBuilder()
            .WithRequest(r =>
                r.WithAddress(request.Path)
                    .WithMethod(request.Method)
                    .WithBody(request.Body, request.BodyMatcher)
                    .WithHeaders(request.Headers)
                    .WithConfiguration(request.Configure)
                    .Build())
            .WithResponse(r =>
                r.WithBody(response.Body)
                    .WithStatusCode(response.StatusCode)
                    .WithHeaders(response.Headers.ToDictionary(x => x.Key, x => (object)x.Value))
                    .WithConfiguration(response.Configure)
                    .Build())
            .Build();
        
        var mappingResponse = await adminClient.PostMappingAsync(mappingModel);
        if(!string.IsNullOrWhiteSpace(mappingResponse.Error)) throw new Exception(mappingResponse.Error);
    }
    
    public class MockedRequest
    {
        public required Method Method { get; init; } = Method.Get;
        public string Path { get; init; } = string.Empty;
        public object? Body { get; init; }
        public BodyMatcher BodyMatcher { get; init; } = BodyMatcher.Exact;
        public List<(string Key, string Value)> Headers { get; init; } = [];
        public Func<RequestModelBuilder, RequestModelBuilder>? Configure { get; init; } = null;
    }

    public class MockedResponse
    {
        public required int StatusCode { get; init; }
        public List<(string Key, string Value)> Headers { get; init; } = [];
        public object? Body { get; init; }
        public Func<ResponseModelBuilder, ResponseModelBuilder>? Configure { get; init; } = null;
    }
    
    public enum Method{Get, Post, Delete, Put, Patch, Head, Options, Trace}
    public enum BodyMatcher{Exact, JsonPartialWildcard, Regex}


}

public static class MockBuilderExtensions
{
    extension(ResponseModelBuilder responseModelBuilder)
    {
        public ResponseModelBuilder WithConfiguration(Func<ResponseModelBuilder, ResponseModelBuilder>? configure)
        {
            return configure is null ? responseModelBuilder : configure.Invoke(responseModelBuilder);
        }
        
        public ResponseModelBuilder WithBody(object? body)
        {
            if(body is null) return responseModelBuilder;

            var bodyPattern = body switch
            {
                string value => value,
                _ => JsonSerializer.Serialize(body)
            };
            
            responseModelBuilder = responseModelBuilder.WithBody(bodyPattern);
            
            return responseModelBuilder;
        }
    }

    extension(RequestModelBuilder requestModelBuilder)
    {
        public RequestModelBuilder WithConfiguration(Func<RequestModelBuilder, RequestModelBuilder>? configure)
        {
            return configure is null ? requestModelBuilder : configure.Invoke(requestModelBuilder);
        }

        public RequestModelBuilder WithMethod(WireMockFixture.Method method)
        {
            return method switch
            {
                WireMockFixture.Method.Get => requestModelBuilder.UsingGet(),
                WireMockFixture.Method.Post => requestModelBuilder.UsingPost(),
                WireMockFixture.Method.Delete => requestModelBuilder.UsingDelete(),
                WireMockFixture.Method.Put => requestModelBuilder.UsingPut(),
                WireMockFixture.Method.Patch => requestModelBuilder.UsingPatch(),
                WireMockFixture.Method.Head => requestModelBuilder.UsingHead(),
                WireMockFixture.Method.Options => requestModelBuilder.UsingOptions(),
                WireMockFixture.Method.Trace => requestModelBuilder.UsingTrace(),
                _ => throw new ArgumentOutOfRangeException(nameof(method), method, null)
            };
        }

        public RequestModelBuilder WithAddress(string url)
        {
            ArgumentNullException.ThrowIfNull(url);
            
            var pathParts = url.Split('?', 2,  StringSplitOptions.RemoveEmptyEntries);
            
            requestModelBuilder = requestModelBuilder.WithPath(pathParts[0]);
            if(pathParts.Length <= 1 || string.IsNullOrWhiteSpace(pathParts[1])) return requestModelBuilder;
            
            var @params = QueryHelpers.ParseQuery(pathParts[1]).Select(x =>
            {
                return new ParamModel()
                {
                    IgnoreCase = true,
                    Name = x.Key,
                    Matchers = x.Value.Select(v => new MatcherModel()
                    {
                        IgnoreCase = true,
                        Name = "WildcardMatcher",
                        Pattern = v
                    }).ToArray()
                };
            });
            
            requestModelBuilder = requestModelBuilder.WithParams(@params.ToList);
            
            return requestModelBuilder;
        }

        public RequestModelBuilder WithHeaders(List<(string Key, string Value)> headers)
        {
            List<HeaderModel> headerModels = [];

            if (Activity.Current is not null)
            {
                var traceId = Activity.Current.TraceId.ToString();
                headerModels.Add(new HeaderModel()
                {
                    Name = "traceparent",
                    IgnoreCase = true,
                    Matchers = [
                    new MatcherModel()
                    {
                        IgnoreCase = true,
                        Name = "WildcardMatcher",
                        Pattern = $"*{traceId}*"
                    }]
                });
            }

            if (headers is { Count: > 0 })
            {
                headerModels.AddRange(headers.Select(x => new HeaderModel()
                {
                    Name = x.Key,
                    IgnoreCase = true,
                    Matchers = [
                        new MatcherModel()
                        {
                            IgnoreCase = true,
                            Name = "WildcardMatcher",
                            Pattern = x.Value
                        }
                    ]
                }));
            }
            
            if(headerModels.Count == 0) return requestModelBuilder;
            
            requestModelBuilder = requestModelBuilder.WithHeaders(headerModels);
            
            return requestModelBuilder;
        }

        public RequestModelBuilder WithBody(object? body, WireMockFixture.BodyMatcher bodyMatcher)
        {
            if(body is null) return requestModelBuilder;

            var matcherName = bodyMatcher switch
            {
                WireMockFixture.BodyMatcher.Exact => "ExactMatcher",
                WireMockFixture.BodyMatcher.JsonPartialWildcard => "JsonPartialWildcardMatcher",
                WireMockFixture.BodyMatcher.Regex => "RegexMatcher",
                _ => throw new ArgumentOutOfRangeException(nameof(bodyMatcher), bodyMatcher, null)
            };

            var bodyPattern = body switch
            {
                string value => value,
                _ => JsonSerializer.Serialize(body)
            };

            requestModelBuilder = requestModelBuilder.WithBody(x =>
            {
                x.WithMatcher(mb => mb
                    .WithName(matcherName)
                    .WithPattern(bodyPattern)
                    .WithIgnoreCase(true));
            });

            return requestModelBuilder;
        }
    }
}

public class KafkaFixture : IAsyncDisposable
{
    public required DockerNetworkFixture DockerNetwork { get; init; }
    private KafkaContainer _container = null!;
    public string ConnectionString => TestsConfiguration.LocalMode ? _container.GetBootstrapAddress() : $"{_container.Name.TrimStart('/')}:{KafkaBuilder.BrokerPort}";
    public async Task InitializeAsync()
    {
        _container = new KafkaBuilder("confluentinc/cp-kafka:7.8.0")
            .WithNetwork(DockerNetwork.Network)
            .WithNetworkAliases("kafka")
            .Build();
        await _container.StartAsync();

        var config = new Confluent.Kafka.AdminClientConfig { BootstrapServers = _container.GetBootstrapAddress() };
        using var adminClient = new Confluent.Kafka.AdminClientBuilder(config).Build();
        
        await adminClient.CreateTopicsAsync([
            new Confluent.Kafka.Admin.TopicSpecification { Name = "orders-topic", NumPartitions = 1, ReplicationFactor = 1 }
        ]);
    }
    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}

public class PostgresqlFixture : IAsyncDisposable
{
    public required DockerNetworkFixture DockerNetwork { get; init; }
    private PostgreSqlContainer _container = null!;
    public string ConnectionString => TestsConfiguration.LocalMode ? _container.GetConnectionString() : $"Host={AliasName};Port={PostgreSqlBuilder.PostgreSqlPort};Database=postgres;Username=postgres;Password=postgres";

    private const string AliasName = "postgres";
    
    public async Task InitializeAsync()
    {
        _container = new PostgreSqlBuilder("postgres:17")
            .WithNetwork(DockerNetwork.Network)
            .WithNetworkAliases("postgres")
            .Build();
        await _container.StartAsync();

        await using var connection = new Npgsql.NpgsqlConnection(_container.GetConnectionString());
        await connection.OpenAsync();
        await using var cmd = new Npgsql.NpgsqlCommand("CREATE TABLE IF NOT EXISTS orders (sku VARCHAR(50), quantity INT);", connection);
        await cmd.ExecuteNonQueryAsync();
    }
    public async ValueTask DisposeAsync() => await _container.DisposeAsync();
}

public class AspireDashboardFixture : IAsyncDisposable
{
    private const int DashboardPort = 18888;
    private const int OtlpGrpcPort = 18889;
    private const string AliasName = "aspire_dashboard";
    
    public required DockerNetworkFixture DockerNetwork { get; init; }
    private IContainer _container = null!;
    
    public string OtlpEndpointForContainer => $"http://{AliasName}:{OtlpGrpcPort}";
    public string OtlpEndpointForHost => $"http://localhost:{_container.GetMappedPublicPort(OtlpGrpcPort)}";
    public string ConnectionString => TestsConfiguration.LocalMode ? OtlpEndpointForHost : OtlpEndpointForContainer; 

    public async Task InitializeAsync()
    {
        var builder = new ContainerBuilder("mcr.microsoft.com/dotnet/aspire-dashboard:latest")
            .WithNetworkAliases(AliasName)
            .WithNetwork(DockerNetwork.Network)
            .WithPortBinding(DashboardPort, true)
            .WithPortBinding(OtlpGrpcPort, true)
            .WithEnvironment("DOTNET_DASHBOARD_UNSECURED_ALLOW_ANONYMOUS", "true");

        if (TestsConfiguration.LocalMode)
        {
            builder = builder.WithCleanUp(false).WithReuse(true);
        }
            
        _container = builder.Build();
        await _container.StartAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if(TestsConfiguration.LocalMode) return; // if local mode, we reuse aspire dashboard, so no disposal

        await _container.DisposeAsync();
    }
}

public class TestWebAppFactory(Dictionary<string, string> variables) : WebApplicationFactory<Program>
{
    protected override IHost CreateHost(IHostBuilder builder)
    {
        foreach (var variable in variables) Environment.SetEnvironmentVariable(variable.Key, variable.Value);
        
        return base.CreateHost(builder);
    }

    public new HttpClient CreateClient()
    {
        return CreateDefaultClient(new TelemetryHandler());
    }

    private class TelemetryHandler : DelegatingHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            DistributedContextPropagator.Current.Inject(Activity.Current, request.Headers, (r, key, value) =>
            {
                if (r is not HttpRequestHeaders headers) return;

                headers.TryAddWithoutValidation(key, value);
            });
            
            return base.SendAsync(request, cancellationToken);
        }
    }
}

public class ApiContainerFixture(Dictionary<string, string> variables) : IAsyncDisposable
{
    private IContainer _container = null!;

    public async Task InitializeAsync(DockerNetworkFixture network)
    {
        var rootDirectory = CommonDirectoryPath.GetSolutionDirectory();
        var projectPath = Path.Combine(rootDirectory.DirectoryPath, "Api", "Api.csproj");
        
        var startInfo = new ProcessStartInfo("dotnet", $"publish {projectPath} -t:PublishContainer -c Release")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        
        using var process = Process.Start(startInfo);
        if (process is not null)
        {
            await process.WaitForExitAsync();
            if (process.ExitCode != 0)
            {
                var error = await process.StandardError.ReadToEndAsync();
                throw new Exception($"Failed to build container: {error}");
            }
        }
        
        var builder = new ContainerBuilder("api:latest")
            .WithNetwork(network.Network)
            .WithPortBinding(8080, true)
            .WithEnvironment("ASPNETCORE_URLS", "http://+:8080")
            .WithEnvironment(variables);
        //TODO: health check

        _container = builder.Build();
        await _container.StartAsync();
    }

    public HttpClient CreateClient() 
    {
        return new HttpClient
        {
            BaseAddress = new Uri($"http://{_container.Hostname}:{_container.GetMappedPublicPort(8080)}")
        };
    }

    public async ValueTask DisposeAsync()
    {
        await _container.DisposeAsync();
    }
}

public static class TestsConfiguration
{
    public static bool UseAspire => true;
    public static bool LocalMode => true;
}

public class ApiClient(HttpClient client)
{
    public Task<HttpResponseMessage> PostOrder(string sku, int quantity) => client.PostAsJsonAsync("/api/orders", new { Sku = sku, Quantity = quantity });
}