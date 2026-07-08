"use client";
import { useState } from "react";
import { addExpense, type AddExpenseResponse } from "@/lib/api";

const CATEGORIES = ["Meals", "Travel", "Education", "Office supplies", "Accommodation"];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: "block", fontSize: 12, color: "var(--text-3)",
      textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
      {children}
    </label>
  );
}

export default function AddExpense() {
  const [form, setForm] = useState({
    description: "", amount: "", category: "", vendor: "", expenseDate: "",
  });
  const [result, setResult]   = useState<AddExpenseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description || !form.amount || !form.expenseDate) {
      setError("Description, amount and date are required.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await addExpense({
        description: form.description,
        amount:      parseFloat(form.amount),
        category:    form.category || undefined,
        vendor:      form.vendor   || undefined,
        expenseDate: form.expenseDate,
      });
      setResult(res);
      setForm({ description: "", amount: "", category: "", vendor: "", expenseDate: "" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add expense.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: 24,
      }}>
        <p style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase",
          letterSpacing: ".06em", marginBottom: 20 }}>Expense details</p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Description</Label>
            <input placeholder="e.g. Team lunch at Pizza Hut"
              value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Amount (₹)</Label>
              <input type="number" min="0" placeholder="0"
                value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            </div>
            <div>
              <Label>Date</Label>
              <input type="date"
                value={form.expenseDate} onChange={(e) => set("expenseDate", e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Label>Category</Label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                <option value="">Select…</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label>Vendor</Label>
              <input placeholder="e.g. Pizza Hut"
                value={form.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "var(--red)",
              background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 10, padding: "10px 14px", margin: 0 }}>
              {error}
            </p>
          )}

          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            <button type="submit" disabled={loading} style={{
              background: loading ? "var(--surface-2)" :
                "linear-gradient(135deg, #7c3aed, #a855f7)",
              color: "white", border: "none", padding: "11px 22px",
              borderRadius: 10, fontSize: 14, fontWeight: 500,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? .6 : 1, transition: "opacity .15s",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              {loading ? (
                <>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span>
                  Checking policy…
                </>
              ) : "Submit expense →"}
            </button>
            <button type="button"
              onClick={() => { setForm({ description:"",amount:"",category:"",vendor:"",expenseDate:"" }); setResult(null); setError(""); }}
              style={{
                background: "var(--surface-2)", border: "1px solid var(--border-2)",
                color: "var(--text-2)", padding: "11px 18px", borderRadius: 10,
                fontSize: 14, cursor: "pointer",
              }}>
              Clear
            </button>
          </div>
        </form>
      </div>

      {result && (
        <div style={{
          borderRadius: 16, padding: 20,
          background: result.isCompliant ? "rgba(34,197,94,0.06)" : "rgba(245,158,11,0.06)",
          border: `1px solid ${result.isCompliant ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-1)" }}>Policy check result</span>
            <span style={{
              fontSize: 12, padding: "4px 12px", borderRadius: 99,
              fontWeight: 500,
              background: result.isCompliant ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
              color:      result.isCompliant ? "#22c55e"               : "#f59e0b",
            }}>
              {result.status}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {([
              ["Expense ID", `#${result.expenseId}`],
              ["Amount",     `₹${result.amount.toLocaleString("en-IN")}`],
              ...(result.relevantPolicy ? [["Matched policy", result.relevantPolicy]] : []),
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--text-3)" }}>{label}</span>
                <span style={{ color: "var(--text-1)", fontWeight: 500,
                  maxWidth: "60%", textAlign: "right" }}>{value}</span>
              </div>
            ))}
          </div>

          {result.policyAdvice && (
            <p style={{
              marginTop: 14, paddingTop: 14, fontSize: 13, lineHeight: 1.6,
              borderTop: "1px solid rgba(255,255,255,0.06)",
              color: "var(--text-2)", margin: "14px 0 0",
            }}>
              {result.policyAdvice}
            </p>
          )}

          {result.agentReasoning && (
            <details style={{ marginTop: 12 }}>
              <summary style={{
                fontSize: 11, color: "var(--text-3)", cursor: "pointer",
                userSelect: "none", letterSpacing: ".04em",
              }}>
                Agent reasoning
              </summary>
              <p style={{
                fontSize: 12, lineHeight: 1.7, color: "var(--text-3)",
                margin: "8px 0 0", whiteSpace: "pre-wrap",
              }}>
                {result.agentReasoning}
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
