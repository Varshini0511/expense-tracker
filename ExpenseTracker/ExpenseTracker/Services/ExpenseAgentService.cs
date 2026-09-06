using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using Pgvector;
using ExpenseManager.Models;

namespace ExpenseManager.Services;

public interface IExpenseAgentService
{
    Task<string> AskAsync(string question);
    Task<AgentExpenseResult> SubmitExpenseAsync(AddExpenseRequest request);
}

public class ExpenseAgentService : IExpenseAgentService
{
    private readonly string _groqKey;
    private readonly string _geminiKey;
    private readonly string _groqModel;
    private readonly string _connectionString;
    private readonly HttpClient _httpClient;
    private readonly ILogger<ExpenseAgentService> _logger;
    private readonly IExpenseService _expenseService;
    private NpgsqlDataSource? _dataSource;

    public ExpenseAgentService(
        IConfiguration config,
        HttpClient httpClient,
        ILogger<ExpenseAgentService> logger,
        IExpenseService expenseService)
    {
        _expenseService   = expenseService;
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

    public async Task<string> AskAsync(string question)
    {
        var url = "https://api.groq.com/openai/v1/chat/completions";

        var tools = new JsonArray
        {
            new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"]        = "GetExpenseSummary",
                    ["description"] = "Get total expenses grouped by category. Use when asked about spending amounts, totals, or expense summaries.",
                    ["parameters"]  = new JsonObject
                    {
                        ["type"]       = "object",
                        ["properties"] = new JsonObject()
                    }
                }
            },
            new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"]        = "GetRecentExpenses",
                    ["description"] = "Get the 10 most recent expenses. Use when asked about recent or latest expenses.",
                    ["parameters"]  = new JsonObject
                    {
                        ["type"]       = "object",
                        ["properties"] = new JsonObject()
                    }
                }
            },
            new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"]        = "SearchPolicies",
                    ["description"] = "Search company expense policies. Use when asked about what is allowed, policy rules, or reimbursement limits.",
                    ["parameters"]  = new JsonObject
                    {
                        ["type"]       = "object",
                        ["properties"] = new JsonObject
                        {
                            ["query"] = new JsonObject
                            {
                                ["type"]        = "string",
                                ["description"] = "The policy search query"
                            }
                        },
                        ["required"] = new JsonArray { "query" }
                    }
                }
            }
        };

        var messages = new JsonArray
        {
            new JsonObject
            {
                ["role"]    = "system",
                ["content"] = "You are an AI expense management assistant. Use the available tools to answer questions about expenses and company policies. Always use a tool to get real data — never guess."
            },
            new JsonObject
            {
                ["role"]    = "user",
                ["content"] = question
            }
        };

        // ReAct loop — max 5 iterations
        for (int i = 0; i < 5; i++)
        {
            var requestBody = new JsonObject
            {
                ["model"]       = _groqModel,
                ["messages"]    = JsonNode.Parse(messages.ToJsonString()),
                ["tools"]       = JsonNode.Parse(tools.ToJsonString()),
                ["tool_choice"] = "auto"
            };

            var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _groqKey);
            req.Content = new StringContent(
                requestBody.ToJsonString(), Encoding.UTF8, "application/json");

            var response     = await _httpClient.SendAsync(req);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
            {
                // Groq rejects malformed tool calls — try to salvage via fallback parser
                var fallback = await TryHandleFallbackToolCallAsync(responseText, messages, tools);
                if (fallback != null) return fallback;
                return $"Error: {responseText}";
            }

            using var doc     = JsonDocument.Parse(responseText);
            var choice        = doc.RootElement.GetProperty("choices")[0];
            var message       = choice.GetProperty("message");
            var finishReason  = choice.GetProperty("finish_reason").GetString();

            // No tool calls — return the text answer
            if (finishReason == "stop" || !message.TryGetProperty("tool_calls", out var toolCalls))
            {
                return message.TryGetProperty("content", out var content)
                    ? content.GetString() ?? "No response."
                    : "No response.";
            }

            // Add assistant message with tool_calls to history
            messages.Add(JsonNode.Parse(message.GetRawText())!);

            // Execute each tool call and append results
            foreach (var toolCall in toolCalls.EnumerateArray())
            {
                var toolCallId = toolCall.GetProperty("id").GetString()!;
                var funcName   = toolCall.GetProperty("function").GetProperty("name").GetString()!;
                var argsRaw    = toolCall.GetProperty("function").GetProperty("arguments").GetString() ?? "{}";

                _logger.LogInformation("Agent calling: {Tool}", funcName);

                using var argsDoc = JsonDocument.Parse(argsRaw);
                var args = argsDoc.RootElement;

                string toolResult = funcName switch
                {
                    "GetExpenseSummary" => await GetExpenseSummaryAsync(),
                    "GetRecentExpenses" => await GetRecentExpensesAsync(10),
                    "SearchPolicies"    => await SearchPoliciesAsync(
                        args.TryGetProperty("query", out var q) ? q.GetString()! : ""),
                    _                   => "Unknown tool."
                };

                messages.Add(new JsonObject
                {
                    ["role"]         = "tool",
                    ["tool_call_id"] = toolCallId,
                    ["content"]      = toolResult
                });
            }
        }

        return "5Could not complete the request.";
    }

    // ── Submit expense via agent ──────────────────────────────
    // The agent itself decides to call CheckExpensePolicy then SaveExpense.
    // The controller no longer hardcodes that order.
    public async Task<AgentExpenseResult> SubmitExpenseAsync(AddExpenseRequest request)
    {
        var url = "https://api.groq.com/openai/v1/chat/completions";

        var tools = new JsonArray
        {
            new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"]        = "CheckExpensePolicy",
                    ["description"] = "Check if the expense complies with company policy using RAG. Always call this FIRST before saving.",
                    ["parameters"]  = new JsonObject
                    {
                        ["type"]       = "object",
                        ["properties"] = new JsonObject
                        {
                            ["description"] = new JsonObject { ["type"] = "string",  ["description"] = "What the expense is for" },
                            ["amount"]      = new JsonObject { ["type"] = "number",  ["description"] = "Expense amount in rupees" },
                            ["category"]    = new JsonObject { ["type"] = "string",  ["description"] = "Expense category" },
                            ["vendor"]      = new JsonObject { ["type"] = "string",  ["description"] = "Vendor name" }
                        },
                        ["required"] = new JsonArray { "description", "amount" }
                    }
                }
            },
            new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"]        = "SaveExpense",
                    ["description"] = "Save the expense to the database. Call this AFTER CheckExpensePolicy.",
                    ["parameters"]  = new JsonObject
                    {
                        ["type"]       = "object",
                        ["properties"] = new JsonObject
                        {
                            ["description"] = new JsonObject { ["type"] = "string" },
                            ["amount"]      = new JsonObject { ["type"] = "number" },
                            ["category"]    = new JsonObject { ["type"] = "string" },
                            ["vendor"]      = new JsonObject { ["type"] = "string" },
                            ["expenseDate"] = new JsonObject { ["type"] = "string", ["description"] = "Date in YYYY-MM-DD format" }
                        },
                        ["required"] = new JsonArray { "description", "amount", "expenseDate" }
                    }
                }
            }
        };

        var expenseJson = $"description={request.Description}, amount={request.Amount}, " +
                          $"category={request.Category}, vendor={request.Vendor}, date={request.ExpenseDate}";

        var messages = new JsonArray
        {
            new JsonObject
            {
                ["role"]    = "system",
                ["content"] = """
                    You are an expense submission agent. When given an expense you MUST:
                    1. Call CheckExpensePolicy to check compliance
                    2. Call SaveExpense to save it to the database
                    3. After both tool calls complete, return ONLY this JSON — no other text:
                    {"isCompliant": true/false, "policyAdvice": "...", "relevantPolicy": "...", "status": "✅ Approved or ⚠️ Needs Review", "reasoning": "one sentence"}
                    """
            },
            new JsonObject
            {
                ["role"]    = "user",
                ["content"] = $"Submit this expense: {expenseJson}"
            }
        };

        // Track what came back from tools across the loop
        PolicyCheckResult? policyResult = null;
        int savedId = 0;

        for (int i = 0; i < 5; i++)
        {
            var body = new JsonObject
            {
                ["model"]    = _groqModel,
                ["messages"] = JsonNode.Parse(messages.ToJsonString()),
                ["tools"]    = JsonNode.Parse(tools.ToJsonString())
            };

            var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _groqKey);
            req.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

            var response     = await _httpClient.SendAsync(req);
            var responseText = await response.Content.ReadAsStringAsync();

            if (!response.IsSuccessStatusCode)
                return new AgentExpenseResult { Status = $"Error: {responseText}" };

            using var doc    = JsonDocument.Parse(responseText);
            var choice       = doc.RootElement.GetProperty("choices")[0];
            var message      = choice.GetProperty("message");
            var finishReason = choice.GetProperty("finish_reason").GetString();

            // Agent finished — parse the structured JSON it returned
            if (finishReason == "stop" || !message.TryGetProperty("tool_calls", out var toolCalls))
            {
                var text = message.TryGetProperty("content", out var c)
                    ? c.GetString() ?? "{}"
                    : "{}";

                text = text.Replace("```json", "").Replace("```", "").Trim();

                try
                {
                    using var resultDoc = JsonDocument.Parse(text);
                    var root = resultDoc.RootElement;
                    return new AgentExpenseResult
                    {
                        ExpenseId      = savedId,
                        IsCompliant    = root.TryGetProperty("isCompliant",    out var ic) && ic.GetBoolean(),
                        PolicyAdvice   = root.TryGetProperty("policyAdvice",   out var pa) ? pa.GetString() ?? "" : "",
                        RelevantPolicy = root.TryGetProperty("relevantPolicy", out var rp) ? rp.GetString() ?? "" : "",
                        Status         = root.TryGetProperty("status",         out var st) ? st.GetString() ?? "" : "",
                        AgentReasoning = root.TryGetProperty("reasoning",      out var rs) ? rs.GetString() ?? "" : "",
                    };
                }
                catch
                {
                    return new AgentExpenseResult
                    {
                        ExpenseId      = savedId,
                        IsCompliant    = policyResult?.IsCompliant ?? true,
                        PolicyAdvice   = policyResult?.PolicyAdvice   ?? "",
                        RelevantPolicy = policyResult?.RelevantPolicy ?? "",
                        Status         = policyResult?.IsCompliant == false ? "⚠️ Needs Review" : "✅ Approved",
                        AgentReasoning = text,
                    };
                }
            }

            // Execute tool calls
            messages.Add(JsonNode.Parse(message.GetRawText())!);

            foreach (var toolCall in toolCalls.EnumerateArray())
            {
                var toolCallId = toolCall.GetProperty("id").GetString()!;
                var funcName   = toolCall.GetProperty("function").GetProperty("name").GetString()!;
                var argsRaw    = toolCall.GetProperty("function").GetProperty("arguments").GetString() ?? "{}";

                _logger.LogInformation("SubmitAgent calling: {Tool}", funcName);

                using var argsDoc = JsonDocument.Parse(argsRaw);
                var args = argsDoc.RootElement;

                string toolResult;

                if (funcName == "CheckExpensePolicy")
                {
                    // Build request from model's args, fall back to original request values
                    var checkReq = new AddExpenseRequest
                    {
                        Description = args.TryGetProperty("description", out var d) ? d.GetString()! : request.Description,
                        Amount      = args.TryGetProperty("amount",      out var a) ? (decimal)a.GetDouble() : request.Amount,
                        Category    = args.TryGetProperty("category",    out var cat) ? cat.GetString() : request.Category,
                        Vendor      = args.TryGetProperty("vendor",      out var v)   ? v.GetString()   : request.Vendor,
                        ExpenseDate = request.ExpenseDate,
                    };
                    policyResult = await _expenseService.CheckPolicyAsync(checkReq);
                    toolResult   = JsonSerializer.Serialize(policyResult);
                }
                else if (funcName == "SaveExpense")
                {
                    var saveReq = new AddExpenseRequest
                    {
                        Description = args.TryGetProperty("description", out var d)   ? d.GetString()!  : request.Description,
                        Amount      = args.TryGetProperty("amount",      out var a)   ? (decimal)a.GetDouble() : request.Amount,
                        Category    = args.TryGetProperty("category",    out var cat) ? cat.GetString() : request.Category,
                        Vendor      = args.TryGetProperty("vendor",      out var v)   ? v.GetString()   : request.Vendor,
                        ExpenseDate = args.TryGetProperty("expenseDate", out var dt)
                            ? DateOnly.Parse(dt.GetString()!)
                            : request.ExpenseDate,
                    };
                    savedId    = await _expenseService.SaveExpenseAsync(saveReq);
                    toolResult = JsonSerializer.Serialize(new { expenseId = savedId, saved = true });
                }
                else
                {
                    toolResult = "Unknown tool.";
                }

                messages.Add(new JsonObject
                {
                    ["role"]         = "tool",
                    ["tool_call_id"] = toolCallId,
                    ["content"]      = toolResult
                });
            }
        }

        return new AgentExpenseResult { Status = "Could not complete submission." };
    }

    // ── Tool implementations ──────────────────────────────────

    private async Task<string> GetExpenseSummaryAsync()
    {
        try
        {
            await using var conn = await _dataSource!.OpenConnectionAsync();
            var sql = """
                SELECT
                    COALESCE(category, 'Uncategorised') as category,
                    COUNT(*) as count,
                    SUM(amount) as total
                FROM expenses
                GROUP BY category
                ORDER BY total DESC
                """;

            await using var cmd    = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            var lines = new List<string>();
            while (await reader.ReadAsync())
                lines.Add($"{reader.GetString(0)}: {reader.GetInt64(1)} expenses totalling ₹{reader.GetDecimal(2):F2}");

            return lines.Any()
                ? "Expense summary by category:\n" + string.Join("\n", lines)
                : "No expenses found in the database.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    private async Task<string> GetRecentExpensesAsync(int limit)
    {
        try
        {
            await using var conn = await _dataSource!.OpenConnectionAsync();
            var sql = $"""
                SELECT description, amount, category, vendor, expense_date
                FROM expenses
                ORDER BY created_at DESC
                LIMIT {limit}
                """;

            await using var cmd    = new NpgsqlCommand(sql, conn);
            await using var reader = await cmd.ExecuteReaderAsync();

            var lines = new List<string>();
            while (await reader.ReadAsync())
                lines.Add($"{reader.GetDateTime(4):dd MMM} — {reader.GetString(0)} — ₹{reader.GetDecimal(1):F2} ({reader.GetString(2) ?? "no category"})");

            return lines.Any()
                ? $"Recent {limit} expenses:\n" + string.Join("\n", lines)
                : "No expenses found.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    private async Task<string> SearchPoliciesAsync(string query)
    {
        try
        {
            var url  = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={_geminiKey}";
            var body = new
            {
                model                = "models/gemini-embedding-001",
                content              = new { parts = new[] { new { text = query } } },
                outputDimensionality = 768
            };

            var res = await _httpClient.PostAsync(url,
                new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, "application/json"));
            res.EnsureSuccessStatusCode();

            using var embDoc  = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            var embedding     = embDoc.RootElement
                .GetProperty("embedding")
                .GetProperty("values")
                .EnumerateArray()
                .Select(v => v.GetSingle())
                .ToArray();

            var vector = new Vector(embedding);
            var sql    = """
                SELECT policy_text
                FROM expense_policies
                WHERE embedding IS NOT NULL
                ORDER BY embedding <=> @q
                LIMIT 2
                """;

            await using var conn   = await _dataSource!.OpenConnectionAsync();
            await using var cmd    = new NpgsqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("q", vector);

            var results = new List<string>();
            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
                results.Add(reader.GetString(0));

            return results.Any()
                ? "Relevant policies:\n" + string.Join("\n\n", results)
                : "No relevant policy found.";
        }
        catch (Exception ex)
        {
            return $"Error: {ex.Message}";
        }
    }

    // Handles the old <function=Name>{args}</function> format that some model versions emit.
    // Parses the failed_generation field, executes the tool, injects the result into messages,
    // then re-runs the loop by returning null to continue or the final answer string.
    private async Task<string?> TryHandleFallbackToolCallAsync(
        string errorBody, JsonArray messages, JsonArray tools)
    {
        try
        {
            using var doc = JsonDocument.Parse(errorBody);
            if (!doc.RootElement.TryGetProperty("error", out var err)) return null;
            if (err.GetProperty("code").GetString() != "tool_use_failed") return null;

            var raw = err.GetProperty("failed_generation").GetString() ?? "";

            // Parse: <function=ToolName>{...}</function>
            var nameMatch = System.Text.RegularExpressions.Regex.Match(raw, @"<function=([^>}]+)>");
            if (!nameMatch.Success) return null;

            var funcName = nameMatch.Groups[1].Value.Trim().TrimEnd('}', ' ');
            var argsMatch = System.Text.RegularExpressions.Regex.Match(raw, @">(\{.*?\})<\/function>",
                System.Text.RegularExpressions.RegexOptions.Singleline);
            var argsRaw = argsMatch.Success ? argsMatch.Groups[1].Value : "{}";

            _logger.LogInformation("Fallback tool call: {Tool} args={Args}", funcName, argsRaw);

            using var argsDoc = JsonDocument.Parse(argsRaw);
            var args = argsDoc.RootElement;

            string toolResult = funcName switch
            {
                "GetExpenseSummary" => await GetExpenseSummaryAsync(),
                "GetRecentExpenses" => await GetRecentExpensesAsync(10),
                "SearchPolicies" => await SearchPoliciesAsync(
                    args.TryGetProperty("query", out var q) ? q.GetString()! : ""),
                _ => "Unknown tool."
            };

            // Inject a synthetic assistant + tool result pair and re-ask without tools
            var fakeId = Guid.NewGuid().ToString("N")[..8];
            messages.Add(new JsonObject
            {
                ["role"]       = "assistant",
                ["tool_calls"] = new JsonArray
                {
                    new JsonObject
                    {
                        ["id"]   = fakeId,
                        ["type"] = "function",
                        ["function"] = new JsonObject
                        {
                            ["name"]      = funcName,
                            ["arguments"] = argsRaw
                        }
                    }
                }
            });
            messages.Add(new JsonObject
            {
                ["role"]         = "tool",
                ["tool_call_id"] = fakeId,
                ["content"]      = toolResult
            });

            // Final pass: ask for a plain-text answer, no more tools
            var url = "https://api.groq.com/openai/v1/chat/completions";
            var finalBody = new JsonObject
            {
                ["model"]    = _groqModel,
                ["messages"] = JsonNode.Parse(messages.ToJsonString())
            };

            var req = new HttpRequestMessage(HttpMethod.Post, url);
            req.Headers.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _groqKey);
            req.Content = new StringContent(finalBody.ToJsonString(), System.Text.Encoding.UTF8, "application/json");

            var resp = await _httpClient.SendAsync(req);
            var respText = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode) return $"Error: {respText}";

            using var respDoc = JsonDocument.Parse(respText);
            return respDoc.RootElement
                .GetProperty("choices")[0]
                .GetProperty("message")
                .GetProperty("content")
                .GetString() ?? "No response.";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fallback tool call parser failed");
            return null;
        }
    }
}
