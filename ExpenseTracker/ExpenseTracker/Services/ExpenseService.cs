using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using Pgvector;
using ExpenseManager.Models;

namespace ExpenseManager.Services;

public interface IExpenseService
{
    Task<PolicyCheckResult> CheckPolicyAsync(AddExpenseRequest expense);
    Task<int> SaveExpenseAsync(AddExpenseRequest expense);
    Task<List<Expense>> GetExpensesAsync();
    Task EmbedPoliciesAsync();
    Task<List<PolicyRow>> GetPoliciesAsync();
    Task<bool> DeleteExpenseAsync(int id);
    Task<bool> UpdateExpenseAsync(int id, AddExpenseRequest request);
    Task<int> AddPolicyAsync(string policyText);
    Task<bool> UpdatePolicyAsync(int id, string policyText);
}

public class PolicyRow
{
    public int     Id         { get; set; }
    public string  PolicyText { get; set; } = string.Empty;
    public string? Category   { get; set; }
    public bool    Embedded   { get; set; }
}

public class ExpenseService : IExpenseService
{
    private readonly string _groqKey;
    private readonly string _geminiKey;
    private readonly string _groqModel;
    private readonly string _connectionString;
    private readonly HttpClient _httpClient;
    private readonly ILogger<ExpenseService> _logger;
    private NpgsqlDataSource? _dataSource;

    public ExpenseService(
        IConfiguration config,
        HttpClient httpClient,
        ILogger<ExpenseService> logger)
    {
        _groqKey          = config["Groq:ApiKey"]!;
        _groqModel        = config["Groq:Model"] ?? "openai/gpt-oss-120b";
        _geminiKey        = config["Gemini:ApiKey"]!;
        _connectionString = config["ConnectionStrings:DefaultConnection"]
            ?? "Host=localhost;Port=5433;Database=postgres;Username=postgres;Password=postgres123";
        _httpClient       = httpClient;
        _logger           = logger;

        var dsBuilder = new NpgsqlDataSourceBuilder(_connectionString);
        dsBuilder.UseVector();
        _dataSource = dsBuilder.Build();
    }

    public async Task<PolicyCheckResult> CheckPolicyAsync(AddExpenseRequest expense)
    {
        _logger.LogInformation("Checking policy for: {Description} amount: {Amount}",
            expense.Description, expense.Amount);

        var expenseText = $"{expense.Description} {expense.Category} amount {expense.Amount}";
        var embedding   = await GenerateEmbeddingAsync(expenseText);

        if (embedding == null)
            return new PolicyCheckResult
            {
                IsCompliant  = true,
                PolicyAdvice = "Could not check policy — please review manually."
            };

        var relevantPolicy = await FindRelevantPolicyAsync(embedding);

        if (string.IsNullOrEmpty(relevantPolicy))
            return new PolicyCheckResult
            {
                IsCompliant  = true,
                PolicyAdvice = "No specific policy found for this expense type."
            };

        var result = await AskGroqAboutPolicyAsync(expense, relevantPolicy);
        result.RelevantPolicy = relevantPolicy;
        return result;
    }

    public async Task<int> SaveExpenseAsync(AddExpenseRequest request)
    {
        await using var conn = await _dataSource!.OpenConnectionAsync();
        var sql = """
            INSERT INTO expenses (description, amount, category, vendor, expense_date)
            VALUES (@description, @amount, @category, @vendor, @date)
            RETURNING id
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("description", request.Description);
        cmd.Parameters.AddWithValue("amount",      request.Amount);
        cmd.Parameters.AddWithValue("category",    (object?)request.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("vendor",      (object?)request.Vendor   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("date",        request.ExpenseDate);

        var id = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(id);
    }

    public async Task<List<Expense>> GetExpensesAsync()
    {
        var expenses = new List<Expense>();
        await using var conn = await _dataSource!.OpenConnectionAsync();

        var sql = "SELECT id, description, amount, category, vendor, expense_date, created_at FROM expenses ORDER BY created_at DESC";
        await using var cmd    = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            expenses.Add(new Expense
            {
                Id          = reader.GetInt32(0),
                Description = reader.GetString(1),
                Amount      = reader.GetDecimal(2),
                Category    = reader.IsDBNull(3) ? null : reader.GetString(3),
                Vendor      = reader.IsDBNull(4) ? null : reader.GetString(4),
                ExpenseDate = DateOnly.FromDateTime(reader.GetDateTime(5)),
                CreatedAt   = reader.GetDateTime(6)
            });
        }

        return expenses;
    }

    public async Task EmbedPoliciesAsync()
    {
        await using var conn = await _dataSource!.OpenConnectionAsync();

        var getPolicies = "SELECT id, policy_text FROM expense_policies WHERE embedding IS NULL";
        await using var cmd    = new NpgsqlCommand(getPolicies, conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        var policies = new List<(int Id, string Text)>();
        while (await reader.ReadAsync())
            policies.Add((reader.GetInt32(0), reader.GetString(1)));

        await reader.CloseAsync();

        _logger.LogInformation("Embedding {Count} policies", policies.Count);

        foreach (var (id, text) in policies)
        {
            var embedding = await GenerateEmbeddingAsync(text);
            if (embedding == null) continue;

            var vector     = new Vector(embedding);
            var updateSql  = "UPDATE expense_policies SET embedding = @embedding WHERE id = @id";
            await using var updateCmd = new NpgsqlCommand(updateSql, conn);
            updateCmd.Parameters.AddWithValue("embedding", vector);
            updateCmd.Parameters.AddWithValue("id",        id);
            await updateCmd.ExecuteNonQueryAsync();

            _logger.LogInformation("Embedded policy {Id}", id);
        }
    }

    public async Task<bool> DeleteExpenseAsync(int id)
    {
        await using var conn = await _dataSource!.OpenConnectionAsync();
        await using var cmd  = new NpgsqlCommand("DELETE FROM expenses WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<bool> UpdateExpenseAsync(int id, AddExpenseRequest request)
    {
        await using var conn = await _dataSource!.OpenConnectionAsync();
        var sql = """
            UPDATE expenses
            SET description  = @description,
                amount       = @amount,
                category     = @category,
                vendor       = @vendor,
                expense_date = @date
            WHERE id = @id
            """;
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("id",          id);
        cmd.Parameters.AddWithValue("description", request.Description);
        cmd.Parameters.AddWithValue("amount",      request.Amount);
        cmd.Parameters.AddWithValue("category",    (object?)request.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("vendor",      (object?)request.Vendor   ?? DBNull.Value);
        cmd.Parameters.AddWithValue("date",        request.ExpenseDate);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<int> AddPolicyAsync(AddPolicyRequest request)
    {
        await using var conn = await _dataSource!.OpenConnectionAsync();
        var sql = "INSERT INTO expense_policies (policy_text, category) VALUES (@text, @category) RETURNING id";
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("text",     request.PolicyText);
        cmd.Parameters.AddWithValue("category", (object?)request.Category ?? DBNull.Value);
        var id = await cmd.ExecuteScalarAsync();
        return Convert.ToInt32(id);
    }

    public async Task<bool> UpdatePolicyAsync(int id, AddPolicyRequest request)
    {
        await using var conn = await _dataSource!.OpenConnectionAsync();
        var sql = "UPDATE expense_policies SET policy_text = @text, category = @category, embedding = NULL WHERE id = @id";
        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("text",     request.PolicyText);
        cmd.Parameters.AddWithValue("category", (object?)request.Category ?? DBNull.Value);
        cmd.Parameters.AddWithValue("id",       id);
        return await cmd.ExecuteNonQueryAsync() > 0;
    }

    public async Task<List<PolicyRow>> GetPoliciesAsync()
    {
        var rows = new List<PolicyRow>();
        await using var conn = await _dataSource!.OpenConnectionAsync();
        var sql = "SELECT id, policy_text, category, embedding IS NOT NULL FROM expense_policies ORDER BY id";
        await using var cmd    = new NpgsqlCommand(sql, conn);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            rows.Add(new PolicyRow
            {
                Id         = reader.GetInt32(0),
                PolicyText = reader.GetString(1),
                Category   = reader.IsDBNull(2) ? null : reader.GetString(2),
                Embedded   = reader.GetBoolean(3),
            });
        return rows;
    }

    // ── Private helpers ───────────────────────────────────────

    private async Task<string?> FindRelevantPolicyAsync(float[] embedding, string? category)
    {
        try
        {
            var vector = new Vector(embedding);

            string sql;
            NpgsqlCommand cmd;
            await using var conn = await _dataSource!.OpenConnectionAsync();

            if (!string.IsNullOrEmpty(category))
            {
                sql = """
                    SELECT policy_text, embedding <=> @q AS distance
                    FROM expense_policies
                    WHERE embedding IS NOT NULL AND (category ILIKE @category OR category IS NULL)
                    ORDER BY (category ILIKE @category) DESC, distance
                    LIMIT 1
                    """;
                cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("q", vector);
                cmd.Parameters.AddWithValue("category", category);
            }
            else
            {
                sql = """
                    SELECT policy_text, embedding <=> @q AS distance
                    FROM expense_policies
                    WHERE embedding IS NOT NULL
                    ORDER BY distance
                    LIMIT 1
                    """;
                cmd = new NpgsqlCommand(sql, conn);
                cmd.Parameters.AddWithValue("q", vector);
            }

            await using (cmd)
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync()) return null;

                var policyText = reader.GetString(0);
                var distance   = reader.GetDouble(1);

                _logger.LogInformation("Nearest policy distance: {Distance:F4}", distance);

                return distance < 0.36 ? policyText : null;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error finding relevant policy");
            return null;
        }
    }

    private async Task<PolicyCheckResult> AskGroqAboutPolicyAsync(
        AddExpenseRequest expense, string policy)
    {
        var url    = "https://api.groq.com/openai/v1/chat/completions";
        var prompt = $$"""
            You are an expense policy compliance checker.

            Company Policy:
            {{policy}}

            Expense to check:
            - Description: {{expense.Description}}
            - Amount: {{expense.Amount}} rupees
            - Category: {{expense.Category}}
            - Vendor: {{expense.Vendor}}

            Reply with ONLY valid JSON, no markdown, no extra text:
            {"isCompliant": true, "advice": "brief explanation"}
            """;

        var requestBody = new
        {
            model       = _groqModel,
            temperature = 0,
            messages    = new[]
            {
                new { role = "user", content = prompt }
            }
        };

        var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _groqKey);
        request.Content = new StringContent(
            JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request);
        response.EnsureSuccessStatusCode();

        using var doc  = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var text = doc.RootElement
            .GetProperty("choices")[0]
            .GetProperty("message")
            .GetProperty("content")
            .GetString() ?? "{}";

        text = text.Replace("```json", "").Replace("```", "").Trim();

        using var resultDoc = JsonDocument.Parse(text);
        return new PolicyCheckResult
        {
            IsCompliant  = resultDoc.RootElement.GetProperty("isCompliant").GetBoolean(),
            PolicyAdvice = resultDoc.RootElement.GetProperty("advice").GetString() ?? ""
        };
    }

    // Embeddings stay on Gemini (separate quota from generateContent)
    private async Task<float[]?> GenerateEmbeddingAsync(string text)
    {
        try
        {
            var url  = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={_geminiKey}";
            var body = new
            {
                model                = "models/gemini-embedding-001",
                content              = new { parts = new[] { new { text } } },
                outputDimensionality = 768
            };

            var res = await _httpClient.PostAsync(url,
                new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
            res.EnsureSuccessStatusCode();

            using var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            return doc.RootElement
                .GetProperty("embedding")
                .GetProperty("values")
                .EnumerateArray()
                .Select(v => v.GetSingle())
                .ToArray();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Embedding error");
            return null;
        }
    }
}
