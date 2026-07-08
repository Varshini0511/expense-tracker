using ExpenseManager.Services;

var builder = WebApplication.CreateBuilder(args);

// Render (and most PaaS hosts) inject a PORT env var and expect Kestrel to bind to it.
// Locally this is unset, so Kestrel falls back to launchSettings/the --urls flag.
var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register services
builder.Services.AddHttpClient<IExpenseService, ExpenseService>();
builder.Services.AddScoped<IExpenseService, ExpenseService>();

builder.Services.AddHttpClient<IExpenseAgentService, ExpenseAgentService>();
builder.Services.AddScoped<IExpenseAgentService, ExpenseAgentService>();

// AllowedOrigins: comma-separated list from config/env (e.g. your deployed Vercel URL).
// Falls back to "*" (any origin) so local dev keeps working without extra setup.
var allowedOrigins = builder.Configuration["AllowedOrigins"];
var origins = string.IsNullOrWhiteSpace(allowedOrigins)
    ? null
    : allowedOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AppCors", policy =>
    {
        if (origins is { Length: > 0 })
            policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
        else
            policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors("AppCors");
app.UseAuthorization();
app.MapControllers();

app.Run();
