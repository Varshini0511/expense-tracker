# ExpenseTracker — Technical Learnings

A full-stack **AI agent application**: a Next.js dark-themed UI talking to an
ASP.NET Core REST API, backed by PostgreSQL + pgvector running in Docker. The
intelligence is a **tool-calling LLM agent** (Groq) that runs a **ReAct loop** to
autonomously **check policy (via RAG with Gemini embeddings + vector search)** and
then **save expenses (a real side-effect)**, returning **structured JSON** the UI renders.

---

## 🤖 AI / Agent concepts

| Technique | What I implemented | Where |
|---|---|---|
| **Tool / Function calling** | Gave the LLM a menu of tools (JSON schema); it picks which to call | `AskAsync`, `SubmitExpenseAsync` |
| **The agent loop (ReAct)** | `for (i<5)` loop: model → tool → result → model → answer | both agent methods |
| **Acting vs Answering (side-effects)** | Agent autonomously calls `SaveExpense` to write to the DB, not just reply | `SubmitExpenseAsync` |
| **Structured output** | Forced the LLM to return strict JSON, parsed into typed C# objects | `AskGroqAboutPolicyAsync` → `PolicyCheckResult`, `AgentExpenseResult` |
| **Autonomous tool sequencing** | Model decides order (check policy → then save), driven by system prompt + `finish_reason` | system prompt in `SubmitExpenseAsync` |
| **Fallback tool parsing** | Salvages malformed XML-style tool calls some models emit | `TryHandleFallbackToolCallAsync` |

### Key mental model
- The model only **writes text**. "Call SaveExpense" is just a *message*, not the actual save.
- My C# code does the **real work** (the DB INSERT). The model is the brain, the code is the hands.
- `finish_reason` is the steering wheel: `"tool_calls"` = act again, `"stop"` = done.
- Variables declared **outside** the loop (`policyResult`, `savedId`) carry state across turns.

---

## 🔍 RAG / Retrieval

| Technique | What I implemented |
|---|---|
| **Embeddings** | Convert text → 768-dim vector via Gemini `gemini-embedding-001` |
| **Vector search** | pgvector cosine distance (`embedding <=> @q`) to find nearest policy |
| **Similarity threshold** | Reject weak matches (`distance < 0.36`) so unrelated expenses don't match wrong policies |
| **RAG pattern** | Retrieve relevant policy → feed to LLM → check compliance (LLM reads real policy, doesn't guess) |
| **Stale-embedding handling** | Editing a policy clears its embedding → forces re-embed |

---

## 🗄️ Backend (ASP.NET Core 8 + C#)

| Area | What I implemented |
|---|---|
| **REST API** | Full CRUD: GET/POST/PUT/DELETE for expenses + policies |
| **Dependency Injection** | `IExpenseService`, `IExpenseAgentService` registered & injected (agent depends on service) |
| **PostgreSQL + Npgsql** | Raw SQL with parameterized queries, `NpgsqlDataSource` with pgvector enabled |
| **Service layer separation** | `ExpenseService` (DB+RAG) vs `ExpenseAgentService` (AI logic) vs `Controller` (thin HTTP) |
| **HTTP client integration** | Calling Groq (LLM) and Gemini (embeddings) external APIs |
| **Config management** | `appsettings.json` for API keys, connection string, model name |
| **CORS** | `AllowAll` policy so the browser frontend can call the API |

---

## 🎨 Frontend (Next.js 16 + TypeScript)

| Area | What I implemented |
|---|---|
| **App Router + client components** | 4-tab SPA: Dashboard, Add Expense, AI Agent, Policies |
| **Typed API layer** | `lib/api.ts` with typed fetch functions + interfaces |
| **Dark theme** | CSS variables design system |
| **Live data** | Real DB-driven lists, stat cards (not hardcoded) |
| **Interactive CRUD UI** | Inline edit/delete for expenses; inline edit + add + embed for policies |
| **Async state handling** | Loading spinners, error states, optimistic updates |

---

## 🐳 Infrastructure / DevOps

| Area | What I implemented |
|---|---|
| **Docker** | PostgreSQL + pgvector running in `pgvector-db` container |
| **Multi-service orchestration** | Running DB + backend + frontend together, fixed ports |
| **Debugging skills** | Diagnosing "failed to fetch" (CORS, ports, DB down), reading logs, tracing 500s |

---

## 🚀 How to run the project

Three layers must run, **in this order**:

| # | What | How |
|---|------|-----|
| 1 | **Database** (Docker) | Launch Docker Desktop, then `docker start pgvector-db`. Listens on port **5433**. |
| 2 | **Backend** (.NET) | `cd ExpenseTracker/ExpenseTracker; dotnet run --urls http://localhost:5085` |
| 3 | **Frontend** (Next.js) | `cd expense-ui; npm run dev` → opens `http://localhost:3000` |

> ⚠️ Always start the backend with `--urls http://localhost:5085` so the port stays
> fixed. The HTTPS launch profile picks a *random* port, which breaks `lib/api.ts`
> (its `BASE` URL must match the backend port: `http://localhost:5085/api/expenses`).

**"failed to fetch" debug order:** Is Docker running? → Is the backend on 5085? →
Does `api.ts` point to 5085? → Hard-refresh the browser (Ctrl+Shift+R).

---

## ⚠️ Known gaps / things NOT handled yet

These are intentional learning edges, not bugs:

- **Non-compliant expenses are still saved** (flagged "Needs Review", not blocked).
  A real guardrail would refuse the `SaveExpense` side-effect when `policyResult.IsCompliant == false`.
- **No idempotency** — if the model calls `SaveExpense` twice, you get duplicate rows.
- **No transaction/rollback** around the agent's side-effects.
- **Agent is stateless** — each request starts fresh; no memory across questions.
- **Vector search only** — no keyword (BM25) search or reranking.

---

## 📚 Next topics (roadmap)

| Topic | Status | Future project |
|---|---|---|
| Tool calling, agent loop, structured output, side-effects | ✅ Done here | (CRM Lead Qualifier = re-practice) |
| Basic RAG (vector search) | ✅ Done here | — |
| **Hybrid search + reranking** | ⏭️ Next | Hybrid Product Search |
| Production concerns (eval, guardrails, observability) | ❌ | Fintech |
| Memory / multi-turn state | ❌ | Real Estate Sim |
| Orchestration / multi-agent | ❌ | Travel Planner onward |
