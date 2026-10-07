namespace PlantWatch.Application.Dtos;

/// <summary>One telemetry sample as exposed over the API and the realtime hub.</summary>
public record ReadingDto(
    string MachineCode,
    DateTimeOffset Timestamp,
    int PiecesProduced,
    int RejectedPieces,
    bool IsRunning);
