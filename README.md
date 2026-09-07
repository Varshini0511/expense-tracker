# ExpenseTracker

An AI-powered expense manager. Submit an expense and an LLM agent decides —
on its own — to check it against company policy (via semantic search over a
vector database) and then save it. Ask it questions in plain English and it
picks the right tools to answer them.

**Live demo:** https://expense-tracker-chi-five-45.vercel.app

> Hosted on free tiers — the API sleeps after ~15 minutes idle, so the first
> request may take 30–60 seconds to wake up. That's expected, not a bug.

---

## What it does

- **Add an expense** → an agent checks it against policy, then saves it, and
  explains its reasoning
- **Ask questions** → "What did I spend on meals?", "What's the travel policy?"
  — the agent picks the right tool and answers from real data
- **Manage policies** → add/edit policy text, then embed it so it becomes
  searchable

---

## How it works

```
Browser (Next.js)
      │  HTTP + CORS
      ▼
ASP.NET Core API ──► Groq        (LLM: reasoning + tool calling)
      │          └─► Gemini      (embeddings: text → 768-dim vector)
      ▼
PostgreSQL + pgvector            (expenses, policies, vector search)
```

### The agent loop

The API doesn't hardcode "check policy, then save." It hands the model a menu
of tools and lets it decide:

```
Turn 1: model → "call CheckExpensePolicy"  → C# runs it, returns result
Turn 2: model → "call SaveExpense"         → C# runs it, returns new ID
Turn 3: model → final JSON answer          → done
```

The model only ever *writes text*; the C# code is what actually touches the
database. `finish_reason` (`tool_calls` vs `stop`) drives the loop.

### Policy checking (RAG)

1. The expense description is embedded into a 768-dimension vector (Gemini)
2. pgvector finds the nearest policy by cosine distance (`<=>`)
3. If the distance is under `0.36`, that policy is considered relevant —
   otherwise no policy is matched (this threshold stops a dress purchase from
   matching a school-fees policy)
4. The matched policy text and the expense are sent to the LLM, which returns
   structured JSON: `{"isCompliant": bool, "advice": "..."}`

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, App Router |
| Backend | ASP.NET Core 8, C# |
| Database | PostgreSQL + pgvector (Supabase) |
| LLM | Groq (`openai/gpt-oss-120b`) — tool calling, structured output |
| Embeddings | Google Gemini (`gemini-embedding-001`, 768 dims) |
| Hosting | Vercel (frontend), Render (API), Supabase (database) |

---

## Running locally

You need **.NET 8 SDK**, **Node.js 18+**, and a **PostgreSQL database with the
pgvector extension** (Docker or a hosted one like Supabase).

### 1. Database

Run [`ExpenseTracker/schema.sql`](ExpenseTracker/schema.sql) against your
database. It creates the `vector` extension and an `expense_tracker` schema
holding the two tables.

To run Postgres locally with pgvector via Docker:

```bash
docker run -d --name pgvector-db -p 5433:5432 -e POSTGRES_PASSWORD=postgres123 pgvector/pgvector:pg16
```

### 2. Backend config

Create `ExpenseTracker/ExpenseTracker/appsettings.Development.json`
(git-ignored — never commit real keys):

```json
{
  "Gemini": { "ApiKey": "YOUR_GEMINI_KEY" },
  "Groq":   { "ApiKey": "YOUR_GROQ_KEY", "Model": "openai/gpt-oss-120b" },
  "ConnectionStrings": {
    "DefaultConnection": "Host=localhost;Port=5433;Database=postgres;Username=postgres;Password=postgres123;Search Path=expense_tracker,public"
  }
}
```

> **`Search Path` must include `public`.** pgvector's `<=>` operator lives in
> `public`; listing only `expense_tracker` hides it and every vector query
> fails with `operator does not exist: public.vector <=> public.vector`.

Get free API keys from [console.groq.com](https://console.groq.com) and
[aistudio.google.com](https://aistudio.google.com/app/apikey).

### 3. Run

```bash
cd ExpenseTracker/ExpenseTracker && dotnet run --urls http://localhost:5085
```

```bash
cd ExpenseTracker/expense-ui && npm install && npm run dev
```

Open http://localhost:3000. The frontend reads `NEXT_PUBLIC_API_URL` and falls
back to `http://localhost:5085`.

---

## API

Base path: `/api/expenses`

| Method | Route | Description |
|---|---|---|
| `GET` | `/` | List all expenses with totals |
| `POST` | `/` | Submit an expense — the agent checks policy, then saves |
| `PUT` | `/{id}` | Update an expense |
| `DELETE` | `/{id}` | Delete an expense |
| `GET` | `/policies` | List policies and whether each is embedded |
| `POST` | `/policies` | Add a policy (starts unembedded) |
| `PUT` | `/policies/{id}` | Edit a policy — clears its embedding |
| `POST` | `/embed-policies` | Generate embeddings for unembedded policies |
| `POST` | `/agent/ask` | Ask the agent a question |

Swagger UI is available at `/swagger`.

Editing a policy deliberately clears its embedding: the old vector encodes the
*old* wording, so it must be regenerated before the policy is searchable again.

---

## Project layout

```
ExpenseTracker/
├── ExpenseTracker/              # ASP.NET Core API
│   ├── Controllers/             # HTTP endpoints (thin)
│   ├── Services/
│   │   ├── ExpenseService.cs        # database + embeddings + RAG policy check
│   │   └── ExpenseAgentService.cs   # agent loops, tool definitions & dispatch
│   ├── Models/                  # request/response types
│   └── Dockerfile               # multi-stage build used by Render
├── expense-ui/                  # Next.js frontend
│   ├── app/                     # pages, layout, global styles
│   ├── components/              # Dashboard, AddExpense, Agent, Policies
│   └── lib/api.ts               # typed API client
└── schema.sql                   # database schema
```

---

## Known limitations

Deliberate scope cuts, documented rather than hidden:

- **Non-compliant expenses are still saved**, flagged "Needs Review" rather
  than blocked. Enforcing it would mean guarding the `SaveExpense` tool.
- **No idempotency** — if the model called `SaveExpense` twice, you'd get
  duplicate rows.
- **The agent is stateless** — each question starts fresh with no memory of
  previous turns.
- **Vector search only** — no keyword/BM25 search or reranking, so exact-term
  queries (product codes, IDs) retrieve poorly.
- **No automated tests or evals** measuring agent accuracy.

---

## Further reading

- [DEPLOYMENT.md](DEPLOYMENT.md) — deploying to Supabase + Render + Vercel
- [ExpenseTracker/LEARNINGS.md](ExpenseTracker/LEARNINGS.md) — the concepts
  behind the implementation
