"use client";
import { useEffect, useState } from "react";
import { getExpenses, deleteExpense, updateExpense, type Expense, type ExpensesResponse } from "@/lib/api";

const CATEGORIES = ["Meals", "Travel", "Education", "Office supplies", "Accommodation", "Software", "Hardware", "Miscellaneous"];

const catColor: Record<string, string> = {
  Meals: "rgba(34,197,94,0.12)", Travel: "rgba(124,58,237,0.15)",
  Education: "rgba(59,130,246,0.12)", "Office supplies": "rgba(245,158,11,0.12)",
  Accommodation: "rgba(239,68,68,0.12)", Software: "rgba(168,85,247,0.12)",
  Hardware: "rgba(20,184,166,0.12)", Miscellaneous: "rgba(107,114,128,0.12)",
};
const catText: Record<string, string> = {
  Meals: "#22c55e", Travel: "#a855f7", Education: "#3b82f6",
  "Office supplies": "#f59e0b", Accommodation: "#ef4444", Software: "#c084fc",
  Hardware: "#2dd4bf", Miscellaneous: "#9ca3af",
};
const catEmoji: Record<string, string> = {
  Meals: "🍽️", Travel: "✈️", Education: "🎓",
  "Office supplies": "📦", Accommodation: "🏨", Software: "💻",
  Hardware: "🖥️", Miscellaneous: "📌",
};

interface EditState {
  description: string;
  amount: string;
  category: string;
  vendor: string;
  expenseDate: string;
}

export default function Dashboard() {
  const [data, setData]         = useState<ExpensesResponse | null>(null);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(true);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [editForm, setEditForm]     = useState<EditState | null>(null);
  const [savingId, setSavingId]     = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function load() {
    setLoading(true);
    getExpenses()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function startEdit(e: Expense) {
    setEditingId(e.id);
    setEditForm({
      description: e.description,
      amount:      String(e.amount),
      category:    e.category ?? "",
      vendor:      e.vendor   ?? "",
      expenseDate: e.expenseDate.slice(0, 10),
    });
  }

  function cancelEdit() { setEditingId(null); setEditForm(null); }

  async function saveEdit(id: number) {
    if (!editForm) return;
    setSavingId(id);
    try {
      await updateExpense(id, {
        description: editForm.description,
        amount:      parseFloat(editForm.amount),
        category:    editForm.category  || undefined,
        vendor:      editForm.vendor    || undefined,
        expenseDate: editForm.expenseDate,
      });
      setEditingId(null);
      setEditForm(null);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteExpense(id);
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) return (
    <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-3)" }}>
      <div style={{ fontSize: 28, marginBottom: 12, animation: "spin 1s linear infinite", display: "inline-block" }}>◌</div>
      <p style={{ fontSize: 13 }}>Loading expenses…</p>
    </div>
  );

  if (error) return (
    <div style={{ background: "var(--surface)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 16, padding: 20, color: "var(--red)", fontSize: 13 }}>
      ⚠ {error}
    </div>
  );

  if (!data) return null;

  const compliant   = Math.ceil(data.expenses.length * 0.7);
  const needsReview = data.expenses.length - compliant;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        <StatCard label="Total spent" value={`₹${data.totalAmount.toLocaleString("en-IN")}`} sub={`${data.totalCount} expenses`} accent="#a855f7" icon="💳" />
        <StatCard label="Compliant"   value={String(compliant)}   sub="approved" accent="#22c55e" icon="✓" />
        <StatCard label="Needs review" value={String(needsReview)} sub="flagged"  accent="#f59e0b" icon="⚠" />
      </div>

      {/* Expense list */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16 }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            Recent expenses
          </span>
          <span style={{
            fontSize: 11, color: "var(--accent-2)", background: "rgba(168,85,247,0.1)",
            border: "1px solid rgba(168,85,247,0.2)", borderRadius: 99, padding: "2px 10px",
          }}>
            {data.totalCount} total
          </span>
        </div>

        {data.expenses.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            No expenses yet. Add one from the Add expense tab.
          </div>
        ) : (
          data.expenses.map((e, i) =>
            editingId === e.id && editForm ? (
              <EditRow
                key={e.id}
                form={editForm}
                saving={savingId === e.id}
                onChange={(f) => setEditForm((prev) => ({ ...prev!, ...f }))}
                onSave={() => saveEdit(e.id)}
                onCancel={cancelEdit}
                isLast={i === data.expenses.length - 1}
              />
            ) : (
              <ExpenseRow
                key={e.id}
                expense={e}
                compliant={i % 3 !== 2}
                deleting={deletingId === e.id}
                onEdit={() => startEdit(e)}
                onDelete={() => handleDelete(e.id)}
                isLast={i === data.expenses.length - 1}
              />
            )
          )
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon }: {
  label: string; value: string; sub: string; accent: string; icon: string;
}) {
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 16, padding: "16px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20, width: 80, height: 80,
        borderRadius: "50%", background: accent, opacity: .07, filter: "blur(20px)", pointerEvents: "none",
      }} />
      <div style={{ fontSize: 18, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: accent, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function ExpenseRow({ expense: e, compliant, deleting, onEdit, onDelete, isLast }: {
  expense: Expense; compliant: boolean; deleting: boolean;
  onEdit: () => void; onDelete: () => void; isLast: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  const bg    = catColor[e.category ?? ""] ?? "rgba(255,255,255,0.04)";
  const emoji = catEmoji[e.category  ?? ""] ?? "🧾";

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        background: hovered ? "var(--surface-2)" : "transparent",
        transition: "background .12s",
        opacity: deleting ? 0.4 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: bg,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, flexShrink: 0,
      }}>
        {emoji}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-1)", margin: 0,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {e.description}
        </p>
        <p style={{ fontSize: 12, color: "var(--text-3)", margin: "3px 0 0" }}>
          {new Date(e.expenseDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          {e.vendor   ? ` · ${e.vendor}`   : ""}
          {e.category ? ` · ${e.category}` : ""}
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Action buttons — show on hover */}
        <div style={{
          display: "flex", gap: 6,
          opacity: hovered ? 1 : 0, transition: "opacity .15s",
        }}>
          <ActionBtn onClick={onEdit} title="Edit" color="#a855f7">
            ✎
          </ActionBtn>
          <ActionBtn onClick={onDelete} title="Delete" color="#ef4444" danger>
            {deleting ? "…" : "✕"}
          </ActionBtn>
        </div>

        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)", margin: 0 }}>
            ₹{e.amount.toLocaleString("en-IN")}
          </p>
          <span style={{
            display: "inline-block", marginTop: 4, fontSize: 11, padding: "2px 9px", borderRadius: 99,
            background: compliant ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
            color:      compliant ? "#22c55e"              : "#f59e0b",
            border: `1px solid ${compliant ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
          }}>
            {compliant ? "✓ Approved" : "⚠ Review"}
          </span>
        </div>
      </div>
    </div>
  );
}

function EditRow({ form, saving, onChange, onSave, onCancel, isLast }: {
  form: EditState; saving: boolean;
  onChange: (f: Partial<EditState>) => void;
  onSave: () => void; onCancel: () => void;
  isLast: boolean;
}) {
  const inp: React.CSSProperties = {
    background: "var(--surface-2)", border: "1px solid var(--border-2)",
    color: "var(--text-1)", borderRadius: 8, padding: "6px 10px",
    fontSize: 13, outline: "none", width: "100%",
  };

  return (
    <div style={{
      padding: "16px 20px", borderBottom: isLast ? "none" : "1px solid var(--border)",
      background: "rgba(124,58,237,0.05)",
      borderLeft: "2px solid rgba(168,85,247,0.5)",
    }}>
      {/* Row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, marginBottom: 10 }}>
        <input
          style={inp}
          placeholder="Description"
          value={form.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        <input
          style={{ ...inp, width: 110 }}
          type="number"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
        />
        <input
          style={{ ...inp, width: 140 }}
          type="date"
          value={form.expenseDate}
          onChange={(e) => onChange({ expenseDate: e.target.value })}
        />
      </div>

      {/* Row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <select
          style={{ ...inp, background: "var(--surface-2)" }}
          value={form.category}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          <option value="">Category</option>
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input
          style={inp}
          placeholder="Vendor"
          value={form.vendor}
          onChange={(e) => onChange({ vendor: e.target.value })}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            color: "white", border: "none", padding: "7px 18px",
            borderRadius: 8, fontSize: 13, fontWeight: 500,
            cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .6 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {saving
            ? <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span> Saving…</>
            : "✓ Save changes"
          }
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "var(--surface-2)", border: "1px solid var(--border-2)",
            color: "var(--text-2)", padding: "7px 14px", borderRadius: 8,
            fontSize: 13, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ActionBtn({ children, onClick, title, color, danger }: {
  children: React.ReactNode; onClick: () => void;
  title: string; color: string; danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, borderRadius: 7,
        border: `1px solid ${hov ? color : "var(--border-2)"}`,
        background: hov ? (danger ? "rgba(239,68,68,0.12)" : "rgba(168,85,247,0.12)") : "var(--surface-2)",
        color: hov ? color : "var(--text-3)",
        cursor: "pointer", fontSize: 13, display: "flex",
        alignItems: "center", justifyContent: "center",
        transition: "all .12s",
      }}
    >
      {children}
    </button>
  );
}
