# Stage 1: build the app with the full SDK
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY *.csproj .
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app --no-restore

# Stage 2: run it with just the lightweight runtime image
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app .

# Render sets $PORT at runtime; Program.cs reads it and binds Kestrel to it.
ENTRYPOINT ["dotnet", "ExpenseTracker.dll"]
