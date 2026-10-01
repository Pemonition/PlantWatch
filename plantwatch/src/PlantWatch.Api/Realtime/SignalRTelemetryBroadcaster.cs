using Microsoft.AspNetCore.SignalR;
using PlantWatch.Application.Abstractions;
using PlantWatch.Application.Dtos;

namespace PlantWatch.Api.Realtime;

/// <summary>
/// Implements <see cref="ITelemetryBroadcaster"/> over <see cref="TelemetryHub"/>.
/// </summary>
/// <remarks>
/// This adapter is the only place in the solution that knows the realtime transport is
/// SignalR. Ingestion depends on the interface, so replacing SignalR with server-sent events
/// or a WebSocket of our own is a change to this one class.
/// </remarks>
public class SignalRTelemetryBroadcaster : ITelemetryBroadcaster
{
    private readonly IHubContext<TelemetryHub> _hub;

    /// <summary>Creates the broadcaster over the hub context.</summary>
    public SignalRTelemetryBroadcaster(IHubContext<TelemetryHub> hub) => _hub = hub;

    /// <inheritdoc />
    public async Task BroadcastReadingAsync(ReadingDto reading, CancellationToken cancellationToken = default)
    {
        // Two disjoint audiences, one message each: connections watching the whole plant, and
        // connections that narrowed to this machine. Sending the first to Clients.All instead
        // would deliver the reading twice to everyone in the second — see TelemetryHub.
        await _hub.Clients
            .Group(TelemetryHub.AllGroup)
            .SendAsync(TelemetryHub.ReadingEvent, reading, cancellationToken);

        await _hub.Clients
            .Group(TelemetryHub.GroupFor(reading.MachineCode))
            .SendAsync(TelemetryHub.ReadingEvent, reading, cancellationToken);
    }
}
