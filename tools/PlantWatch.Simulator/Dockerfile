# Multi-stage build for the telemetry simulator.
#
# The simulator has no project references, so its restore layer is small and it builds
# independently of the API — a change to the domain does not force a simulator rebuild.

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY Directory.Build.props ./
COPY tools/PlantWatch.Simulator/PlantWatch.Simulator.csproj tools/PlantWatch.Simulator/

RUN dotnet restore tools/PlantWatch.Simulator/PlantWatch.Simulator.csproj

COPY tools/PlantWatch.Simulator/ tools/PlantWatch.Simulator/

RUN dotnet publish tools/PlantWatch.Simulator/PlantWatch.Simulator.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/runtime:9.0 AS runtime
WORKDIR /app

USER $APP_UID

COPY --from=build /app/publish ./

ENTRYPOINT ["dotnet", "PlantWatch.Simulator.dll"]
