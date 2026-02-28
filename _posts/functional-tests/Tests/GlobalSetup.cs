using System.Diagnostics;
using OpenTelemetry;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Tests;

public static class GlobalHooks
{
    private static ActivityListener _activityListener = null!;
    private static readonly ActivitySource TestActivitySource = new("TestActivitySource");
    private static TracerProviderBuilder _tracingBuilder;
    private static TracerProvider _tracerProvider;

    public static void SetupOtlpExporter(string address)
    {
        _tracerProvider = _tracingBuilder.AddOtlpExporter(opt =>
        {
            opt.Endpoint = new Uri(address);
            opt.Protocol = OpenTelemetry.Exporter.OtlpExportProtocol.Grpc;
        }).Build();
    }
    
    [Before(TestSession)]
    public static void BeforeTestSession()
    {
        _tracingBuilder = Sdk.CreateTracerProviderBuilder()
            .ConfigureResource(r => r.AddService("functional-tests")) //helpful in aspire
            .AddHttpClientInstrumentation()
            .AddSource(TestActivitySource.Name);
        
        _activityListener = new ActivityListener
        {
            ShouldListenTo = _ => true,
            Sample = (ref _) => ActivitySamplingResult.AllDataAndRecorded
        };
        
        ActivitySource.AddActivityListener(_activityListener);
    }

    [After(TestSession)]
    public static void AfterTestSession()
    {
        _tracerProvider.ForceFlush();
        _tracerProvider.Dispose();
    }

    [BeforeEvery(Test)]
    public static void BeforeEveryTest()
    {
        _ = TestActivitySource.StartActivity(TestContext.Current!.Metadata.TestName);
        TestContext.Current.AddAsyncLocalValues();
    }

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
                TestState.Failed or TestState.Timeout or TestState.Cancelled => ActivityStatusCode.Error,
                TestState.Skipped => ActivityStatusCode.Unset,
                _ => throw new ArgumentOutOfRangeException()
            };
            
            currentActivity.SetStatus(activityStatus, currentContext.Execution.Result?.State.ToString());

            if (currentContext.Execution.Result?.OriginalException is { } originalException)
            {
                currentActivity.AddException(originalException);
            }
            else if (currentContext.Execution.Result?.Exception is { } exception)
            {
                currentActivity.AddException(exception);
            }
        }
        
        Activity.Current?.Dispose();
    }
}
