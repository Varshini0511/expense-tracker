using Microsoft.AspNetCore.Mvc;
using ExpenseManager.Models;
using ExpenseManager.Services;

namespace ExpenseManager.Controllers;

// ============================================================
// EXPENSE CONTROLLER
// All endpoints for the expense manager
//
// TEST IN THIS ORDER:
// 1. POST /api/expenses/embed-policies  — embed policies first
// 2. POST /api/expenses                 — add an expense
// 3. GET  /api/expenses                 — view all expenses
// 4. POST /api/expenses/agent/ask       — ask AI questions
// ============================================================

[ApiController]
[Route("api/expenses")]
public class ExpenseController : ControllerBase
{
    private readonly IExpenseService      _expenseService;
    private readonly IExpenseAgentService _agentService;
    private readonly ILogger<ExpenseController> _logger;

    public ExpenseController(
        IExpenseService expenseService,
        IExpenseAgentService agentService,
        ILogger<ExpenseController> logger)
    {
        _expenseService = expenseService;
        _agentService   = agentService;
        _logger         = logger;
    }

    // ----------------------------------------------------------
    // STEP 1: Embed all policies (run once)
    // POST /api/expenses/embed-policies
    // ----------------------------------------------------------
    [HttpPost("embed-policies")]
    public async Task<IActionResult> EmbedPolicies()
    {
        await _expenseService.EmbedPoliciesAsync();
        return Ok(new { message = "All policies embedded successfully" });
    }

    // ----------------------------------------------------------
    // GET /api/expenses/policies
    // ----------------------------------------------------------
    [HttpGet("policies")]
    public async Task<IActionResult> GetPolicies()
    {
        var policies = await _expenseService.GetPoliciesAsync();
        return Ok(policies);
    }

    // ----------------------------------------------------------
    // POST /api/expenses/policies  — add a new policy text
    // ----------------------------------------------------------
    [HttpPost("policies")]
    public async Task<IActionResult> AddPolicy([FromBody] AddPolicyRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.PolicyText))
            return BadRequest(new { error = "Policy text is required" });

        var id = await _expenseService.AddPolicyAsync(request);
        return Ok(new { id, message = "Policy added. Call embed-policies to generate its embedding." });
    }

    // ----------------------------------------------------------
    // PUT /api/expenses/policies/{id}  — edit a policy's text
    // (clears its embedding — re-embed to reactivate it)
    // ----------------------------------------------------------
    [HttpPut("policies/{id}")]
    public async Task<IActionResult> UpdatePolicy(int id, [FromBody] AddPolicyRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.PolicyText))
            return BadRequest(new { error = "Policy text is required" });

        var updated = await _expenseService.UpdatePolicyAsync(id, request);
        return updated
            ? Ok(new { message = "Policy updated. Call embed-policies to regenerate its embedding." })
            : NotFound(new { error = "Policy not found" });
    }

    // ----------------------------------------------------------
    // STEP 2: Add an expense with AI policy check
    // POST /api/expenses
    // Body: { "description": "Team lunch", "amount": 2500, "category": "Meals", "vendor": "Pizza Hut", "expenseDate": "2024-01-15" }
    // ----------------------------------------------------------
    [HttpPost]
    public async Task<IActionResult> AddExpense([FromBody] AddExpenseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { error = "Description is required" });

        // Agent decides the order: CheckExpensePolicy → SaveExpense
        var result = await _agentService.SubmitExpenseAsync(request);

        return Ok(new
        {
            expenseId      = result.ExpenseId,
            description    = request.Description,
            amount         = request.Amount,
            isCompliant    = result.IsCompliant,
            policyAdvice   = result.PolicyAdvice,
            relevantPolicy = result.RelevantPolicy,
            status         = result.Status,
            agentReasoning = result.AgentReasoning,
        });
    }

    // ----------------------------------------------------------
    // STEP 3: Get all expenses
    // GET /api/expenses
    // ----------------------------------------------------------
    [HttpGet]
    public async Task<IActionResult> GetExpenses()
    {
        var expenses = await _expenseService.GetExpensesAsync();
        return Ok(new
        {
            totalCount = expenses.Count,
            totalAmount = expenses.Sum(e => e.Amount),
            expenses
        });
    }

    // ----------------------------------------------------------
    // DELETE /api/expenses/{id}
    // ----------------------------------------------------------
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteExpense(int id)
    {
        var deleted = await _expenseService.DeleteExpenseAsync(id);
        return deleted ? Ok(new { message = "Deleted" }) : NotFound(new { error = "Expense not found" });
    }

    // ----------------------------------------------------------
    // PUT /api/expenses/{id}
    // ----------------------------------------------------------
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateExpense(int id, [FromBody] AddExpenseRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { error = "Description is required" });

        var updated = await _expenseService.UpdateExpenseAsync(id, request);
        return updated ? Ok(new { message = "Updated" }) : NotFound(new { error = "Expense not found" });
    }

    // ----------------------------------------------------------
    // STEP 4: Ask the AI agent questions
    // POST /api/expenses/agent/ask
    // Body: { "question": "What did I spend on meals?" }
    //
    // Try these questions:
    // "What is my total spend by category?"
    // "Show me my recent expenses"
    // "What is the meal expense policy?"
    // "Am I within budget for travel?"
    // ----------------------------------------------------------
    [HttpPost("agent/ask")]
    public async Task<IActionResult> AskAgent([FromBody] AgentRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
            return BadRequest(new { error = "Question is required" });

        var answer = await _agentService.AskAsync(request.Question);

        return Ok(new
        {
            question = request.Question,
            answer
        });
    }
}
