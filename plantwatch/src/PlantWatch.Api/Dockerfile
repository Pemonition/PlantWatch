# Multi-stage build for the PlantWatch API.
#
# The build context is the repository root (see docker-compose.yml), because the API
# project references three sibling projects. Restore runs on the .csproj files alone so
# that a source-only change does not invalidate the cached NuGet layer.

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY Directory.Build.props ./
COPY PlantWatch.sln ./
COPY src/PlantWatch.Domain/PlantWatch.Domain.csproj src/PlantWatch.Domain/
COPY src/PlantWatch.Application/PlantWatch.Application.csproj src/PlantWatch.Application/
COPY src/PlantWatch.Infrastructure/PlantWatch.Infrastructure.csproj src/PlantWatch.Infrastructure/
COPY src/PlantWatch.Api/PlantWatch.Api.csproj src/PlantWatch.Api/

RUN dotnet restore src/PlantWatch.Api/PlantWatch.Api.csproj

COPY src/ src/

RUN dotnet publish src/PlantWatch.Api/PlantWatch.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# The ASP.NET runtime image ships no HTTP client at all — no curl, no wget — so a container
# health check has nothing to call /health with. curl is the smallest thing that fixes that.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Run as the non-root user the base image provides.
USER $APP_UID

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

COPY --from=build /app/publish ./

ENTRYPOINT ["dotnet", "PlantWatch.Api.dll"]
