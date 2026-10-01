using PlantWatch.Application.Abstractions;
using PlantWatch.Application.Dtos;
using PlantWatch.Domain.Machines;
using PlantWatch.Domain.Oee;

namespace PlantWatch.Application.Oee;

/// <summary>
/// Use case: compute OEE for one machine over one period from stored telemetry.
/// </summary>
/// <remarks>
/// This is where raw samples become the five numbers <see cref="OeeCalculator"/> needs.
/// The split matters: aggregation involves judgement calls about imperfect field data
/// (missing samples, clock skew, a gateway that went offline), while the calculation itself
/// is arithmetic that must stay provably correct. Keeping them in separate types means the
/// arithmetic can be tested exhaustively and the judgement calls can be revised without
/// touching it.
/// </remarks>
public class OeeQueryService
{
    /// <summary>
    /// Largest gap between consecutive samples that is still credited to the earlier
    /// sample's state. Beyond this the gateway is assumed to have been offline, and the
    /// gap counts as neither run time nor a stop — guessing would inflate availability.
    /// </summary>
    private static readonly TimeSpan MaxCreditedSampleGap = TimeSpan.FromMinutes(5);

    private readonly IMachineRepository _machines;
    private readonly IReadingRepository _readings;

    /// <summary>Creates the service over its two repositories.</summary>
    public OeeQueryService(IMachineRepository machines, IReadingRepository readings)
    {
        _machines = machines;
        _readings = readings;
    }

    /// <summary>
    /// Computes OEE for the machine identified by <paramref name="machineCode"/> over
    /// the half-open period [<paramref name="from"/>, <paramref name="to"/>).
    /// </summary>
    /// <returns>The OEE figures, or null when the machine code is unknown.</returns>
    public async Task<OeeDto?> GetForPeriodAsync(
        string machineCode,
        DateTimeOffset from,
        DateTimeOffset to,
        CancellationToken cancellationToken = default)
    {
        Machine? machine = await _machines.GetByCodeAsync(machineCode, cancellationToken);
        if (machine is null)
        {
            return null;
        }

        if (to <= from)
        {
            // An empty or inverted window is a caller error we can answer honestly with zeros
            // rather than an exception: the dashboard polls this endpoint constantly.
            return Empty(machine.Code, from, to);
        }

        IReadOnlyList<SensorReading> readings =
            await _readings.GetForPeriodAsync(machine.Id, from, to, cancellationToken);

        if (readings.Count == 0)
        {
            return Empty(machine.Code, from, to);
        }

        List<SensorReading> ordered = readings.OrderBy(r => r.Timestamp).ToList();

        TimeSpan runTime = EstimateRunTime(ordered, to);
        int totalPieces = ordered.Sum(r => r.PiecesProduced);
        int rejectedPieces = ordered.Sum(r => r.RejectedPieces);
        TimeSpan plannedTime = to - from;

        OeeInput input = new(
            PlannedProductionTime: plannedTime,
            RunTime: runTime,
            IdealCycleSeconds: machine.IdealCycleSeconds,
            TotalPieces: totalPieces,
            RejectedPieces: rejectedPieces);

        OeeResult result = OeeCalculator.Calculate(input);

        return new OeeDto(
            MachineCode: machine.Code,
            From: from,
            To: to,
            Availability: result.Availability,
            Performance: result.Performance,
            Quality: result.Quality,
            Oee: result.Oee,
            TotalPieces: totalPieces,
            RejectedPieces: rejectedPieces,
            RunTimeMinutes: runTime.TotalMinutes,
            PlannedTimeMinutes: plannedTime.TotalMinutes);
    }

    /// <summary>
    /// Sums the intervals during which the machine reported itself running.
    /// </summary>
    /// <remarks>
    /// Each sample's state is credited forward to the next sample (or to the end of the
    /// window for the last one), capped by <see cref="MaxCreditedSampleGap"/> so that a
    /// gateway outage is not mistaken for production.
    /// </remarks>
    private static TimeSpan EstimateRunTime(List<SensorReading> ordered, DateTimeOffset windowEnd)
    {
        TimeSpan runTime = TimeSpan.Zero;

        for (int i = 0; i < ordered.Count; i++)
        {
            if (!ordered[i].IsRunning)
            {
                continue;
            }

            DateTimeOffset next = i + 1 < ordered.Count ? ordered[i + 1].Timestamp : windowEnd;
            TimeSpan gap = next - ordered[i].Timestamp;

            if (gap <= TimeSpan.Zero)
            {
                continue;
            }

            runTime += gap > MaxCreditedSampleGap ? MaxCreditedSampleGap : gap;
        }

        return runTime;
    }

    private static OeeDto Empty(string code, DateTimeOffset from, DateTimeOffset to) =>
        new(code, from, to, 0d, 0d, 0d, 0d, 0, 0, 0d, Math.Max(0d, (to - from).TotalMinutes));
}
