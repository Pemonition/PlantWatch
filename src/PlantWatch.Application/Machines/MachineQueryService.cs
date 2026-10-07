using PlantWatch.Application.Abstractions;
using PlantWatch.Application.Dtos;
using PlantWatch.Domain.Machines;

namespace PlantWatch.Application.Machines;

/// <summary>
/// Use cases for listing machines and reading back their recent telemetry.
/// </summary>
public class MachineQueryService
{
    private const int MaxTake = 500;

    private readonly IMachineRepository _machines;
    private readonly IReadingRepository _readings;

    /// <summary>Creates the service over its two repositories.</summary>
    public MachineQueryService(IMachineRepository machines, IReadingRepository readings)
    {
        _machines = machines;
        _readings = readings;
    }

    /// <summary>Lists every monitored machine.</summary>
    public async Task<IReadOnlyList<MachineDto>> GetMachinesAsync(CancellationToken cancellationToken = default)
    {
        IReadOnlyList<Machine> machines = await _machines.GetAllAsync(cancellationToken);

        return machines
            .Select(m => new MachineDto(m.Code, m.Name, m.IdealCycleSeconds))
            .ToList();
    }

    /// <summary>
    /// Returns the most recent readings for a machine, newest first.
    /// </summary>
    /// <remarks>
    /// <paramref name="take"/> is clamped to <see cref="MaxTake"/>: an unbounded page size on
    /// a time-series table is how a dashboard refresh turns into an outage.
    /// </remarks>
    /// <returns>The readings, or null when the machine code is unknown.</returns>
    public async Task<IReadOnlyList<ReadingDto>?> GetLatestReadingsAsync(
        string machineCode,
        int take,
        CancellationToken cancellationToken = default)
    {
        Machine? machine = await _machines.GetByCodeAsync(machineCode, cancellationToken);
        if (machine is null)
        {
            return null;
        }

        int safeTake = Math.Clamp(take, 1, MaxTake);

        IReadOnlyList<SensorReading> readings =
            await _readings.GetLatestAsync(machine.Id, safeTake, cancellationToken);

        return readings
            .Select(r => new ReadingDto(
                machine.Code,
                r.Timestamp,
                r.PiecesProduced,
                r.RejectedPieces,
                r.IsRunning))
            .ToList();
    }
}
