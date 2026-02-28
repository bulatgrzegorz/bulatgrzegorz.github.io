using Npgsql;
using Confluent.Kafka;
using Confluent.Kafka.Extensions.Diagnostics;
using Confluent.Kafka.Extensions.OpenTelemetry;
using OpenTelemetry.Trace;
using OpenTelemetry.Resources;
using OpenTelemetry.Logs;
using Microsoft.AspNetCore.Mvc;

var builder = WebApplication.CreateBuilder(args);

// Add OpenTelemetry
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("Api"))
    .WithTracing(tracing =>
    {
        tracing.AddAspNetCoreInstrumentation();
        tracing.AddHttpClientInstrumentation();
        tracing.AddConfluentKafkaInstrumentation();
        tracing.AddNpgsql();
        
        var otlpEndpoint = builder.Configuration.GetValue<string>("OTEL_EXPORTER_OTLP_ENDPOINT");
        if (!string.IsNullOrEmpty(otlpEndpoint))
        {
            tracing.AddOtlpExporter(opt => 
            {
                opt.Endpoint = new Uri(otlpEndpoint);
                opt.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.Grpc;
            });
        }
    })
    .WithLogging(logging =>
    {
        var otlpEndpoint = builder.Configuration.GetValue<string>("OTEL_EXPORTER_OTLP_ENDPOINT");
        if (!string.IsNullOrEmpty(otlpEndpoint))
        {
            logging.AddOtlpExporter(opt => 
            {
                opt.Endpoint = new Uri(otlpEndpoint);
                opt.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.Grpc;
            });
        }
    });

// Postgres
var dbConnectionString = builder.Configuration.GetConnectionString("Database");
builder.Services.AddTransient<NpgsqlConnection>(_ => new NpgsqlConnection(dbConnectionString));

// Kafka
var kafkaConnectionString = builder.Configuration.GetValue<string>("Kafka:ConnectionString");
var producerConfig = new ProducerConfig { BootstrapServers = kafkaConnectionString };
builder.Services.AddSingleton(new ProducerBuilder<Null, string>(producerConfig).BuildWithInstrumentation());

// Configure HttpClient for SomeService
var someServiceUrl = builder.Configuration.GetValue<string>("SomeService:BaseUrl")!;
builder.Services.AddHttpClient("SomeService", client => { client.BaseAddress = new Uri(someServiceUrl); });

var app = builder.Build();

app.Lifetime.ApplicationStopping.Register(() =>
{
    app.Services.GetService<TracerProvider>()?.Dispose();
});

app.MapPost("/api/orders", async (
    [FromBody] CreateOrderRequest request,
    [FromServices] NpgsqlConnection db,
    [FromServices] IProducer<Null, string> kafka,
    [FromServices] IHttpClientFactory httpClientFactory) =>
{
    var client = httpClientFactory.CreateClient("SomeService");
    var response = await client.GetFromJsonAsync<InventoryResponse>($"/inventory/{request.Sku}");
    if (response.Inventory > request.Quantity) 
    {
        return Results.UnprocessableEntity(new { Error = "Insufficient inventory" });
    }

    await db.OpenAsync();
    await using var cmd = new NpgsqlCommand("INSERT INTO orders (sku, quantity) VALUES (@sku, @qty)", db);
    cmd.Parameters.AddWithValue("sku", request.Sku);
    cmd.Parameters.AddWithValue("qty", request.Quantity);
    await cmd.ExecuteNonQueryAsync();
    
    await kafka.ProduceAsync("orders-topic", new Message<Null, string>
    {
        Value = $"Order created for {request.Sku}"
    });

    return Results.Ok(new CreateOrderResponse("Order created"));
});

app.Run();

public record CreateOrderRequest(string Sku, int Quantity);
public record CreateOrderResponse(string Message);
public record InventoryResponse(int Inventory);

public partial class Program { }
