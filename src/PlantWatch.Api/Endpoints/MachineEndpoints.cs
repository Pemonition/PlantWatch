using PlantWatch.Application.Dtos;
using PlantWatch.Application.Machines;
using PlantWatch.Application.Oee;

namespace PlantWatch.Api.Endpoints;

/// <summary>
/// Minimal API route definitions for machines, readings and OEE.
/// </summary>
/// <remarks>
/// Endpoints are grouped in an extension method rather than written inline in
/// <c>Program.cs</c>: the host file stays a readable description of how the application is
/// assembled, and route changes are reviewed in a file that only contains routes.
/// </remarks>
public static class MachineEndpoints
{
    /// <summary>Default page size for the readings endpoint.</summary>
    private const int DefaultTake = 100;

    /// <summary>Maps every machine-related route onto the application.</summary>
    public static IEndpointRouteBuilder MapMachineEndpoints(this IEndpointRouteBuilder app)
    {
        RouteGroupBuilder group = app.MapGroup("/api/machines").WithTags("Machines");

        group.MapGet("/", async (MachineQueryService service, CancellationToken ct) =>
            {
                IReadOnlyList<MachineDto> machines = await service.GetMachinesAsync(ct);
                return Results.Ok(machines);
            })
            .WithName("GetMachines")
            .WithSummary("Lists every monitored machine.")
            .Produces<IReadOnlyList<MachineDto>>();

        group.MapGet("/{code}/oee", async (
                string code,
                DateTimeOffset? from,
                DateTimeOffset? to,
                OeeQueryService service,
                CancellationToken ct) =>
            {
                // Default to the last 8 hours: one shift, which is the window a supervisor
                // actually asks about when they open the dashboard without typing dates.
                DateTimeOffset end = to ?? DateTimeOffset.UtcNow;
                DateTimeOffset start = from ?? end.AddHours(-8);

                OeeDto? result = await service.GetForPeriodAsync(code, start, end, ct);

                return result is null
                    ? Results.NotFound(new { message = $"Unknown machine code '{code}'." })
                    : Results.Ok(result);
            })
            .WithName("GetMachineOee")
            .WithSummary("Computes availability, performance, quality and OEE for a period.")
            .Produces<OeeDto>()
            .Produces(StatusCodes.Status404NotFound);

        group.MapGet("/{code}/readings", async (
                string code,
                int? take,
                MachineQueryService service,
                CancellationToken ct) =>
            {
                IReadOnlyList<ReadingDto>? readings =
                    await service.GetLatestReadingsAsync(code, take ?? DefaultTake, ct);

                return readings is null
                    ? Results.NotFound(new { message = $"Unknown machine code '{code}'." })
                    : Results.Ok(readings);
            })
            .WithName("GetMachineReadings")
            .WithSummary("Returns the most recent telemetry samples, newest first.")
            .Produces<IReadOnlyList<ReadingDto>>()
            .Produces(StatusCodes.Status404NotFound);

        return app;
    }
}
