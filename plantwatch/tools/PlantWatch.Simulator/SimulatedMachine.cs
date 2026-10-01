namespace PlantWatch.Simulator;

/// <summary>One sample of the MQTT telemetry contract.</summary>
/// <remarks>
/// Deliberately duplicated here instead of referencing the Application project: the simulator
/// stands in for third-party hardware, and hardware does not get to share types with the
/// server. If this record and the server's contract drift apart, the integration is broken in
/// reality too — which is exactly what the simulator should reveal.
/// </remarks>
public record TelemetrySample(
    string MachineCode,
    DateTimeOffset Timestamp,
    int PiecesProduced,
    int RejectedPieces,
    bool IsRunning);

/// <summary>
/// A machine with a plausible duty cycle: it runs, occasionally stops for a few samples,
/// and produces a small share of rejects.
/// </summary>
public class SimulatedMachine
{
    private readonly double _idealCycleSeconds;
    private readonly double _stopProbability;
    private readonly double _rejectRate;
    private readonly Random _random;

    private int _remainingStopSamples;
    private double _pieceCarry;

    /// <summary>Creates a simulated machine.</summary>
    /// <param name="code">Shop-floor code used in the topic.</param>
    /// <param name="idealCycleSeconds">Specification cycle time, in seconds per piece.</param>
    /// <param name="stopProbability">Chance per sample that a running machine stops.</param>
    /// <param name="rejectRate">Average share of produced pieces that are rejected.</param>
    /// <param name="random">Shared RNG, so a seed makes the whole run reproducible.</param>
    public SimulatedMachine(
        string code,
        double idealCycleSeconds,
        double stopProbability,
        double rejectRate,
        Random random)
    {
        Code = code;
        _idealCycleSeconds = idealCycleSeconds;
        _stopProbability = stopProbability;
        _rejectRate = rejectRate;
        _random = random;
    }

    /// <summary>Shop-floor code.</summary>
    public string Code { get; }

    /// <summary>
    /// Advances the machine by one sampling interval and returns what it would publish.
    /// </summary>
    public TelemetrySample NextSample(DateTimeOffset now, TimeSpan interval)
    {
        if (_remainingStopSamples > 0)
        {
            _remainingStopSamples--;
            return new TelemetrySample(Code, now, 0, 0, IsRunning: false);
        }

        if (_random.NextDouble() < _stopProbability)
        {
            // A stop lasts one to four intervals, so availability losses show up as runs of
            // consecutive idle samples rather than isolated blips.
            _remainingStopSamples = _random.Next(1, 5);
            return new TelemetrySample(Code, now, 0, 0, IsRunning: false);
        }

        // Real machines rarely hit the specification cycle exactly; 85-100% of nominal speed
        // keeps the performance factor realistic instead of a flat 100%.
        double efficiency = 0.85 + (_random.NextDouble() * 0.15);
        double theoreticalPieces = interval.TotalSeconds / _idealCycleSeconds;

        // A machine slower than the sampling interval produces a fraction of a piece per
        // sample. Rounding that fraction away would report a permanent zero — a 30-second
        // lathe sampled every 5 seconds would never produce anything — and the resulting
        // performance and quality factors would be zero for reasons that have nothing to do
        // with the machine. The remainder is carried instead, so a piece is reported on the
        // sample where it would really have come off.
        _pieceCarry += theoreticalPieces * efficiency;

        int pieces = (int)Math.Floor(_pieceCarry);
        _pieceCarry -= pieces;

        int rejects = 0;
        for (int i = 0; i < pieces; i++)
        {
            if (_random.NextDouble() < _rejectRate)
            {
                rejects++;
            }
        }

        return new TelemetrySample(Code, now, pieces, rejects, IsRunning: true);
    }
}
