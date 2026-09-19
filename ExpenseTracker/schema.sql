-- ExpenseTracker database schema.
-- Lives in its own Postgres schema (namespace) called "expense_tracker" so it
-- doesn't collide with other tables/apps in the same Supabase project.
-- Run this once via the Supabase SQL Editor, then point the backend's
-- connection string at this project with "Search Path=expense_tracker" set
-- (see DEPLOYMENT.md) so unqualified table names resolve here automatically.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS expense_tracker;

CREATE TABLE IF NOT EXISTS expense_tracker.expenses (
    id            SERIAL PRIMARY KEY,
    description   TEXT NOT NULL,
    amount        NUMERIC(12, 2) NOT NULL,
    category      TEXT,
    vendor        TEXT,
    expense_date  DATE NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_tracker.expense_policies (
    id            SERIAL PRIMARY KEY,
    policy_text   TEXT NOT NULL,
    category      TEXT,
    embedding     VECTOR(768)
);
