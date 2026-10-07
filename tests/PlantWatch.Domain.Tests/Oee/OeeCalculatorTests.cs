using PlantWatch.Domain.Oee;
using Xunit;

namespace PlantWatch.Domain.Tests.Oee;

/// <summary>
/// Tests for <see cref="OeeCalculator"/>.
/// </summary>
/// <remarks>
/// The calculator is the one part of PlantWatch where a wrong answer is worse than no answer:
/// a plant manager will make staffing and capex decisions on these numbers. So the suite
/// covers the arithmetic, every division-by-zero path, the clamping guards, and one worked
/// example whose expected value was computed by hand.
/// </remarks>
public class OeeCalculatorTests
{
    private const double Tolerance = 1e-9;

    [Fact]
    public void Calculate_HappyPath_ReturnsEachFactorAndTheirProduct()
    {
        // 10 hours planned, 8 hours running, 60s ideal cycle, 400 pieces, 40 rejected.
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(10),
            RunTime: TimeSpan.FromHours(8),
            IdealCycleSeconds: 60,
            TotalPieces: 400,
            RejectedPieces: 40);

        OeeResult result = OeeCalculator.Calculate(input);

        // availability = 8h / 10h
        Assert.Equal(0.8d, result.Availability, Tolerance);

        // performance = (60s * 400) / 8h = 24000s / 28800s
        Assert.Equal(24000d / 28800d, result.Performance, Tolerance);

        // quality = 360 good / 400 total
        Assert.Equal(0.9d, result.Quality, Tolerance);

        // oee is the product, not the average
        Assert.Equal(result.Availability * result.Performance * result.Quality, result.Oee, Tolerance);
    }

    [Fact]
    public void Calculate_RealisticShift_MatchesHandCalculatedValue()
    {
        // One 8-hour shift: 7 hours producing, 60s ideal cycle, 400 pieces, 8 scrapped.
        //   availability = 420/480            = 0.875
        //   performance  = (60*400)/(420*60)  = 24000/25200 = 0.952380952...
        //   quality      = 392/400            = 0.98
        //   oee          = 0.875 * 0.952380952 * 0.98 = 0.816666666...
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromMinutes(480),
            RunTime: TimeSpan.FromMinutes(420),
            IdealCycleSeconds: 60,
            TotalPieces: 400,
            RejectedPieces: 8);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(0.875d, result.Availability, 1e-6);
        Assert.Equal(0.952380952d, result.Performance, 1e-6);
        Assert.Equal(0.98d, result.Quality, 1e-6);
        Assert.Equal(0.816666666d, result.Oee, 1e-6);
    }

    [Fact]
    public void Calculate_ZeroPlannedTime_ReturnsZeroAvailabilityWithoutThrowing()
    {
        // A shift that was never scheduled is a reporting gap, not an exception.
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.Zero,
            RunTime: TimeSpan.FromHours(1),
            IdealCycleSeconds: 60,
            TotalPieces: 50,
            RejectedPieces: 0);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(0d, result.Availability);
        Assert.Equal(0d, result.Oee);
        Assert.False(double.IsNaN(result.Oee));
        Assert.False(double.IsInfinity(result.Oee));
    }

    [Fact]
    public void Calculate_ZeroRunTime_ReturnsZeroPerformanceWithoutThrowing()
    {
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(8),
            RunTime: TimeSpan.Zero,
            IdealCycleSeconds: 60,
            TotalPieces: 0,
            RejectedPieces: 0);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(0d, result.Availability);
        Assert.Equal(0d, result.Performance);
        Assert.Equal(0d, result.Quality);
        Assert.Equal(0d, result.Oee);
    }

    [Fact]
    public void Calculate_ZeroPieces_ReturnsZeroQualityAndPerformance()
    {
        // The machine was up and scheduled but produced nothing: availability is real,
        // the other two factors have no basis, and OEE collapses to zero.
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(8),
            RunTime: TimeSpan.FromHours(4),
            IdealCycleSeconds: 60,
            TotalPieces: 0,
            RejectedPieces: 0);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(0.5d, result.Availability, Tolerance);
        Assert.Equal(0d, result.Performance);
        Assert.Equal(0d, result.Quality);
        Assert.Equal(0d, result.Oee);
    }

    [Fact]
    public void Calculate_AllPiecesRejected_ReturnsZeroQualityAndZeroOee()
    {
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(8),
            RunTime: TimeSpan.FromHours(8),
            IdealCycleSeconds: 60,
            TotalPieces: 200,
            RejectedPieces: 200);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(1d, result.Availability, Tolerance);
        Assert.True(result.Performance > 0d);
        Assert.Equal(0d, result.Quality);

        // Multiplicative OEE is the point: perfect uptime with nothing sellable is a zero.
        Assert.Equal(0d, result.Oee);
    }

    [Fact]
    public void Calculate_RunTimeExceedingPlannedTime_ClampsAvailabilityToOne()
    {
        // Overtime recorded against an unchanged plan: real data, must not read as 125%.
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(8),
            RunTime: TimeSpan.FromHours(10),
            IdealCycleSeconds: 60,
            TotalPieces: 100,
            RejectedPieces: 0);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(1d, result.Availability);
        Assert.InRange(result.Oee, 0d, 1d);
    }

    [Fact]
    public void Calculate_FasterThanIdealCycle_ClampsPerformanceToOne()
    {
        // The machine beat its stated specification, which means the specification is wrong.
        // Clamping keeps the dashboard honest instead of showing 300% performance.
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(1),
            RunTime: TimeSpan.FromHours(1),
            IdealCycleSeconds: 60,
            TotalPieces: 180,
            RejectedPieces: 0);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(1d, result.Performance);
        Assert.Equal(1d, result.Quality);
        Assert.Equal(1d, result.Oee);
    }

    [Fact]
    public void Calculate_RejectsAboveTotal_DoesNotProduceNegativeQuality()
    {
        // Defensive: a miscounting device must not push quality below zero.
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(1),
            RunTime: TimeSpan.FromHours(1),
            IdealCycleSeconds: 60,
            TotalPieces: 10,
            RejectedPieces: 25);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.Equal(0, input.GoodPieces);
        Assert.Equal(0d, result.Quality);
        Assert.InRange(result.Oee, 0d, 1d);
    }

    [Theory]
    [InlineData(-1, 60, 100, 0)]
    [InlineData(1, -60, 100, 0)]
    [InlineData(1, 60, -100, 0)]
    public void Calculate_NegativeInputs_StayWithinBounds(
        int plannedHours,
        double idealCycleSeconds,
        int totalPieces,
        int rejectedPieces)
    {
        OeeInput input = new(
            PlannedProductionTime: TimeSpan.FromHours(plannedHours),
            RunTime: TimeSpan.FromHours(1),
            IdealCycleSeconds: idealCycleSeconds,
            TotalPieces: totalPieces,
            RejectedPieces: rejectedPieces);

        OeeResult result = OeeCalculator.Calculate(input);

        Assert.InRange(result.Availability, 0d, 1d);
        Assert.InRange(result.Performance, 0d, 1d);
        Assert.InRange(result.Quality, 0d, 1d);
        Assert.InRange(result.Oee, 0d, 1d);
    }

    [Fact]
    public void Empty_IsAllZeros()
    {
        OeeResult empty = OeeResult.Empty;

        Assert.Equal(0d, empty.Availability);
        Assert.Equal(0d, empty.Performance);
        Assert.Equal(0d, empty.Quality);
        Assert.Equal(0d, empty.Oee);
    }
}
