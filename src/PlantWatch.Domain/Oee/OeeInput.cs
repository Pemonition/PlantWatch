namespace PlantWatch.Domain.Oee;

/// <summary>
/// Aggregated inputs for one OEE calculation over a single period and a single machine.
/// </summary>
/// <remarks>
/// This is a value object on purpose: the calculator must be callable from a unit test
/// without a database, a clock, or a machine. Aggregating readings into these five numbers
/// is the job of the application layer.
/// </remarks>
/// <param name="PlannedProductionTime">
/// Time the machine was *supposed* to produce. Planned maintenance, breaks and
/// unscheduled shifts are already excluded — including them would hide real losses
/// behind an artificially large denominator.
/// </param>
/// <param name="RunTime">Time the machine actually produced. Always less than or equal to planned time.</param>
/// <param name="IdealCycleSeconds">Specification cycle time, in seconds per piece.</param>
/// <param name="TotalPieces">All pieces produced in the period, good and rejected.</param>
/// <param name="RejectedPieces">Pieces that failed quality checks, a subset of <paramref name="TotalPieces"/>.</param>
public readonly record struct OeeInput(
    TimeSpan PlannedProductionTime,
    TimeSpan RunTime,
    double IdealCycleSeconds,
    int TotalPieces,
    int RejectedPieces)
{
    /// <summary>Pieces that passed quality checks, never negative.</summary>
    public int GoodPieces => Math.Max(0, TotalPieces - RejectedPieces);
}
