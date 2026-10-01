using PlantWatch.Application.Dtos;

namespace PlantWatch.Application.Abstractions;

/// <summary>
/// Pushes freshly ingested telemetry to connected dashboards.
/// </summary>
/// <remarks>
/// The MQTT ingestion service lives in Infrastructure and must not know that the
/// realtime transport happens to be SignalR. This abstraction is the seam: the API
/// project implements it over a SignalR hub, and a test can implement it with a list.
/// </remarks>
public interface ITelemetryBroadcaster
{
    /// <summary>Broadcasts a reading that has just been persisted.</summary>
    Task BroadcastReadingAsync(ReadingDto reading, CancellationToken cancellationToken = default);
}
