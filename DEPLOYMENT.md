# Deploying ExpenseTracker — a learning walkthrough

Three separate free-tier services, each teaching a different piece of real
deployment:

| Piece | Service | Why this one |
|---|---|---|
| Database | **Supabase** | Free, permanent Postgres with pgvector built in — no Docker needed in prod |
| Backend API | **Render** | Free Docker web hosting, reads your `Dockerfile` directly |
| Frontend | **Vercel** | Built by the Next.js team, zero-config for Next.js apps |

Do them in this order — each step needs the previous one's output.

---

## 1. Database — Supabase

1. Go to [supabase.com](https://supabase.com) → sign up (GitHub login is easiest) → **New project**.
2. Pick a name, a strong database password (**save it**, you'll need it below), and a region close to you.
3. Wait ~2 min for provisioning, then open **SQL Editor** (left sidebar) → **New query**.
4. Paste the contents of [`schema.sql`](schema.sql) from this repo and click **Run**.
   This creates the `vector` extension and your two tables.
5. Go to **Project Settings → Database → Connection string** → copy the **URI** format, e.g.:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Convert it to the Npgsql key=value format your app expects:
   ```
   Host=db.xxxxxxxxxxxx.supabase.co;Port=5432;Database=postgres;Username=postgres;Password=YOUR-PASSWORD
   ```
   Keep this — it's your `ConnectionStrings__DefaultConnection` value for Render.

---

## 2. Backend — Render

1. Push this repo to GitHub first (see step 0 below if you haven't).
2. Go to [render.com](https://render.com) → sign up → **New → Web Service**.
3. Connect your GitHub repo.
4. Configure:
   - **Root Directory**: `ExpenseTracker/ExpenseTracker`
   - **Runtime**: Docker (Render auto-detects the `Dockerfile`)
   - **Instance type**: Free
5. Under **Environment**, add these variables (values from your own accounts —
   the double-underscore `__` is how .NET reads nested config keys from env vars):

   | Key | Value |
   |---|---|
   | `ConnectionStrings__DefaultConnection` | the Supabase string from step 1.6 |
   | `Gemini__ApiKey` | your Gemini API key |
   | `Groq__ApiKey` | your Groq API key |
   | `Groq__Model` | `llama-3.3-70b-versatile` |
   | `AllowedOrigins` | *(fill in after step 3 — your Vercel URL)* |

6. Click **Create Web Service**. Render builds the Docker image and deploys it.
   Note the URL it gives you, e.g. `https://expensetracker-api.onrender.com`.
7. Test it: open `https://expensetracker-api.onrender.com/api/expenses` in a
   browser — you should get `{"totalCount":0,"totalAmount":0,"expenses":[]}`.

> **Free tier note:** Render's free web services spin down after 15 minutes of
> inactivity and take ~30-60s to wake back up on the next request. That's
> normal — not a bug.

---

## 3. Frontend — Vercel

1. Go to [vercel.com](https://vercel.com) → sign up → **Add New → Project**.
2. Import the same GitHub repo.
3. Set **Root Directory** to `ExpenseTracker/expense-ui`.
4. Under **Environment Variables**, add:

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | your Render URL from step 2.6 (no trailing slash) |

5. Click **Deploy**. Vercel builds and gives you a URL like
   `https://expense-tracker-yourname.vercel.app`.

---

## 4. Close the loop — lock down CORS

Right now the backend's `AllowedOrigins` env var is still empty, so it allows
any origin (fine for testing, sloppy for anything real). Go back to Render:

1. Set `AllowedOrigins` = your Vercel URL from step 3.5 (e.g.
   `https://expense-tracker-yourname.vercel.app`).
2. Render redeploys automatically when you save an env var.

Now only your deployed frontend can call your API.

---

## Step 0 — if you haven't pushed to GitHub yet

The repo is already git-initialized locally with secrets excluded via
`.gitignore` (verified: `appsettings.Development.json` is NOT tracked). To push:

```bash
git remote add origin https://github.com/<your-username>/expense-tracker.git
git branch -M main
git push -u origin main
```

Create the empty GitHub repo first via github.com/new (don't initialize it
with a README — you already have commits locally).

---

## What you just learned

- **12-factor config**: secrets and environment differences live in env vars,
  never in committed files. Your code reads `IConfiguration` the same way
  whether the value comes from `appsettings.json`, `appsettings.Development.json`,
  or a Render env var — .NET merges them by precedence.
- **Containerizing an app**: the `Dockerfile` is a recipe — "install the SDK,
  restore, publish, then run with just the lightweight runtime." Multi-stage
  builds keep the final image small (no SDK bloat in production).
- **Split deployment**: frontend and backend are deployed to *different*
  specialized platforms, each doing what it's best at, talking over plain
  HTTP + CORS — exactly how most real production apps are structured.
- **The free-tier trade-off**: cold starts (Render sleeping) are the price of
  $0/month — production apps pay for always-on instances instead.
