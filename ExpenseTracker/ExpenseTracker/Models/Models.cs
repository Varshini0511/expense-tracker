// ============================================================
// EXPENSE MANAGER — Complete AI-powered expense system
// 
// Features:
// 1. Add expenses to database
// 2. AI checks expense against company policy (RAG)
// 3. Agent answers questions about expenses
// 4. All powered by Gemini API
// ============================================================

// ── Models ───────────────────────────────────────────────────

namespace ExpenseManager.Models;

public class Expense
{
    public int     Id          { get; set; }
    public string  Description { get; set; } = string.Empty;
    public decimal Amount      { get; set; }
    public string? Category    { get; set; }
    public string? Vendor      { get; set; }
    public DateOnly ExpenseDate { get; set; }
    public DateTime CreatedAt  { get; set; }
}

public class AddExpenseRequest
{
    public string  Description { get; set; } = string.Empty;
    public decimal Amount      { get; set; }
    public string? Category    { get; set; }
    public string? Vendor      { get; set; }
    public DateOnly ExpenseDate { get; set; }
}

public class PolicyCheckResult
{
    public bool   IsCompliant    { get; set; }
    public string PolicyAdvice   { get; set; } = string.Empty;
    public string RelevantPolicy { get; set; } = string.Empty;
}

public class AgentRequest
{
    public string Question { get; set; } = string.Empty;
}

public class AddPolicyRequest
{
    public string PolicyText { get; set; } = string.Empty;
}

// Returned by the agent after it checks policy AND saves the expense itself
public class AgentExpenseResult
{
    public int    ExpenseId      { get; set; }
    public bool   IsCompliant    { get; set; }
    public string PolicyAdvice   { get; set; } = string.Empty;
    public string RelevantPolicy { get; set; } = string.Empty;
    public string Status         { get; set; } = string.Empty;
    public string AgentReasoning { get; set; } = string.Empty;
}
