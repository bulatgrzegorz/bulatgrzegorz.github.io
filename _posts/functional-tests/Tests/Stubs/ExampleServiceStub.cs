using System.Net;

namespace Tests.Stubs;

public class ExampleServiceStub(WireMockFixture wireMock)
{
    public Task SetupInventory(string sku, InventoryResponse response)
    {
        return wireMock.DefineMock(new WireMockFixture.MockedRequest()
            {
                Method = WireMockFixture.Method.Get,
                Path = $"/inventory/{sku}",
            },
            new WireMockFixture.MockedResponse()
            {
                StatusCode = (int)HttpStatusCode.OK,
                Body = response
            });
    }
}