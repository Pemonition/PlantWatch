using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;

namespace PlantWatch.Api.Realtime;

/// <summary>
/// SignalR hub dashboards connect to for live telemetry.
/// </summary>
/// <remarks>
/// <para>
/// Traffic flows one way, from ingestion to browsers; the only server-callable methods are the
/// two that choose what a connection wants to receive.
/// </para>
/// <para>
/// A connection is in exactly one of two modes. By default it joins <see cref="AllGroup"/> and
/// receives every machine's readings — what a plant overview wants. Calling
/// <see cref="SubscribeToMachine"/> moves it out of that group and into one group per machine it
/// asked for, so a dashboard watching one press is not sent the whole plant's firehose.
/// Unsubscribing from the last machine returns the connection to <see cref="AllGroup"/>.
/// </para>
/// <para>
/// The mode matters because <c>Clients.All</c> is a superset of every group: broadcasting to
/// both would deliver each reading twice to any connection that had subscribed. An explicit
/// group for "everything" is what makes the two audiences actually disjoint.
/// </para>
/// </remarks>
public class TelemetryHub : Hub
{
    /// <summary>Client-side method name invoked when a new reading arrives.</summary>
    public const string ReadingEvent = "reading";

    /// <summary>Group holding every connection that has not narrowed its subscription.</summary>
    public const string AllGroup = "machines:all";

    /// <summary>
    /// Machine codes each connection has subscribed to.
    /// </summary>
    /// <remarks>
    /// SignalR offers no way to ask which groups a connection belongs to, and the hub instance
    /// itself is created per invocation, so the mode has to be tracked here. Entries are removed
    /// in <see cref="OnDisconnectedAsync"/>, which SignalR always runs.
    /// </remarks>
    private static readonly ConcurrentDictionary<string, HashSet<string>> Subscriptions = new();

    /// <inheritdoc />
    public override async Task OnConnectedAsync()
    {
        Subscriptions[Context.ConnectionId] = [];
        await Groups.AddToGroupAsync(Context.ConnectionId, AllGroup);
        await base.OnConnectedAsync();
    }

    /// <inheritdoc />
    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        Subscriptions.TryRemove(Context.ConnectionId, out _);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>Joins the caller to the group for one machine, leaving the plant-wide stream.</summary>
    public async Task SubscribeToMachine(string machineCode)
    {
        HashSet<string> codes = Subscriptions.GetOrAdd(Context.ConnectionId, _ => []);

        bool wasWatchingEverything;
        lock (codes)
        {
            wasWatchingEverything = codes.Count == 0;
            codes.Add(machineCode);
        }

        if (wasWatchingEverything)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, AllGroup);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupFor(machineCode));
    }

    /// <summary>
    /// Removes the caller from the group for one machine, returning it to the plant-wide
    /// stream once it is no longer subscribed to any machine.
    /// </summary>
    public async Task UnsubscribeFromMachine(string machineCode)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, GroupFor(machineCode));

        if (!Subscriptions.TryGetValue(Context.ConnectionId, out HashSet<string>? codes))
        {
            return;
        }

        bool nowWatchingNothing;
        lock (codes)
        {
            codes.Remove(machineCode);
            nowWatchingNothing = codes.Count == 0;
        }

        if (nowWatchingNothing)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, AllGroup);
        }
    }

    /// <summary>Group name convention shared with the broadcaster.</summary>
    public static string GroupFor(string machineCode) => $"machine:{machineCode}";
}
