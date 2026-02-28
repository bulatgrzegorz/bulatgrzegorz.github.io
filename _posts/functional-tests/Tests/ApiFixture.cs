using OpenTelemetry.Trace;
using Tests.Stubs;
using TUnit.Core.Interfaces;

namespace Tests;

public class ApiFixture : IAsyncInitializer, IAsyncDisposable
{
  public ApiClient ApiClient() => new(_httpClientFactory());
  // public DatabaseClient DatabaseClient() => new(_dbConnectionString!);

  public ExampleServiceStub Stub { get; private set; } = null!;

  private IAsyncDisposable? _app;

  private Func<HttpClient> _httpClientFactory = null!;
  private string? _dbConnectionString;
  
  // Stored separately for ordered disposal (network must be disposed last)
  private DockerNetworkFixture _network = null!;
  private List<IAsyncDisposable> _disposables = [];

  public async Task InitializeAsync()
  {
    _network = new DockerNetworkFixture();
    await _network.InitializeAsync();

    var wiremock = new WireMockFixture() { DockerNetwork = _network };
    var kafka = new KafkaFixture() { DockerNetwork = _network };
    var postgresql = new PostgresqlFixture() { DockerNetwork = _network };

    _disposables.AddRange([wiremock, kafka, postgresql]);
    
    AspireDashboardFixture dashboard = null!;
    if(TestsConfiguration.UseAspire){
      dashboard = new AspireDashboardFixture() { DockerNetwork = _network };

      _disposables.Add(dashboard);
      await Task.WhenAll(wiremock.InitializeAsync(), kafka.InitializeAsync(), postgresql.InitializeAsync(), dashboard.InitializeAsync());

      GlobalHooks.SetupOtlpExporter(dashboard.OtlpEndpointForHost);
    }
    else
    {
      await Task.WhenAll(wiremock.InitializeAsync(), kafka.InitializeAsync(), postgresql.InitializeAsync());
    }

    var variables = new Dictionary<string, string>()
    {
      ["ConnectionStrings__Database"] = postgresql.ConnectionString,
      ["Kafka__ConnectionString"] = kafka.ConnectionString,
      ["SomeService__BaseUrl"] = wiremock.Url
    };

    if(TestsConfiguration.UseAspire){
      variables["OTEL_EXPORTER_OTLP_ENDPOINT"] = dashboard.ConnectionString;
      variables["OTEL_EXPORTER_OTLP_PROTOCOL"] = "grpc";
    }

    if(TestsConfiguration.LocalMode)
    {
      var app = new TestWebAppFactory(variables);
      
      _httpClientFactory = () => app.CreateClient();

      _app = app;
    }
    else
    {
      var app = new ApiContainerFixture(variables);
      await app.InitializeAsync(_network);

      _httpClientFactory = () => app.CreateClient();

      _app = app;
    }

    _disposables.Add(_app);
    _dbConnectionString = postgresql.ConnectionString;
    Stub = new ExampleServiceStub(wiremock);
  }

  public async ValueTask DisposeAsync()
  {
      // Dispose containers before network
      foreach(var disposable in _disposables) await disposable.DisposeAsync();
      
      // Network must be disposed last (after all containers are detached)
      await _network.DisposeAsync();
  }
}