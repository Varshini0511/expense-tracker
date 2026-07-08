-- ExpenseTracker database schema.
-- Run this once against a fresh Postgres database (e.g. a new Supabase project)
-- via its SQL Editor, before pointing the backend's connection string at it.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS expenses (
    id            SERIAL PRIMARY KEY,
    description   TEXT NOT NULL,
    amount        NUMERIC(12, 2) NOT NULL,
    category      TEXT,
    vendor        TEXT,
    expense_date  DATE NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_policies (
    id           SERIAL PRIMARY KEY,
    policy_text  TEXT NOT NULL,
    embedding    VECTOR(768)
);
