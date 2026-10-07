namespace PlantWatch.Application.Dtos;

/// <summary>
/// OEE for one machine over one period, with the raw counters that produced it.
/// </summary>
/// <remarks>
/// The counters are returned alongside the ratios on purpose: a plant manager who cannot
/// see the inputs will not trust the output, and support cannot debug a disputed figure
/// without them.
/// </remarks>
public record OeeDto(
    string MachineCode,
    DateTimeOffset From,
    DateTimeOffset To,
    double Availability,
    double Performance,
    double Quality,
    double Oee,
    int TotalPieces,
    int RejectedPieces,
    double RunTimeMinutes,
    double PlannedTimeMinutes);
