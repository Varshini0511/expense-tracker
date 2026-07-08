"use client";
import { useEffect, useState } from "react";
import { getPolicies, addPolicy, updatePolicy, embedPolicies, type PolicyRow } from "@/lib/api";

export default function Policies() {
  const [policies, setPolicies]   = useState<PolicyRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [newText, setNewText]     = useState("");
  const [adding, setAdding]       = useState(false);
  const [addError, setAddError]   = useState("");
  const [embedding, setEmbedding] = useState(false);
  const [embedMsg, setEmbedMsg]   = useState("");
  const [editId, setEditId]       = useState<number | null>(null);
  const [editText, setEditText]   = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  function load() {
    setLoading(true);
    getPolicies()
      .then(setPolicies)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newText.trim()) return;
    setAdding(true);
    setAddError("");
    try {
      const row = await addPolicy(newText.trim());
      setPolicies((p) => [...p, row]);
      setNewText("");
      setEmbedMsg("");
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Failed to add policy.");
    } finally {
      setAdding(false);
    }
  }

  async function handleEmbed() {
    setEmbedding(true);
    setEmbedMsg("");
    setError("");
    try {
      await embedPolicies();
      // Re-fetch so embedded flags come from the DB (source of truth)
      await getPolicies().then(setPolicies);
      setEmbedMsg("All policies embedded successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Embedding failed.");
    } finally {
      setEmbedding(false);
    }
  }

  function startEdit(p: PolicyRow) {
    setEditId(p.id);
    setEditText(p.policyText);
    setEditError("");
  }

  function cancelEdit() {
    setEditId(null);
    setEditText("");
    setEditError("");
  }

  async function saveEdit(id: number) {
    if (!editText.trim()) return;
    setSavingEdit(true);
    setEditError("");
    try {
      await updatePolicy(id, editText.trim());
      // Editing clears the embedding on the server, so mark this row pending.
      setPolicies((ps) =>
        ps.map((p) =>
          p.id === id ? { ...p, policyText: editText.trim(), embedded: false } : p
        )
      );
      setEditId(null);
      setEditText("");
      setEmbedMsg("");
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update policy.");
    } finally {
      setSavingEdit(false);
    }
  }

  const pending  = policies.filter((p) => !p.embedded).length;
  const embedded = policies.filter((p) =>  p.embedded).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[
          { label: "Embedded",      value: loading ? "…" : String(embedded), color: "#22c55e" },
          { label: "Pending embed", value: loading ? "…" : String(pending),  color: "#f59e0b" },
        ].map((s) => (
          <div key={s.label} style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 14, padding: "14px 16px",
          }}>
            <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Policy list */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16 }}>
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 12, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            Company policies
          </span>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            {loading ? "…" : `${policies.length} total`}
          </span>
        </div>

        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span>
            {" "}Loading policies…
          </div>
        ) : error ? (
          <div style={{ padding: "20px", color: "var(--red)", fontSize: 13 }}>⚠ {error}</div>
        ) : policies.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 13 }}>
            No policies yet. Add one below.
          </div>
        ) : (
          <div>
            {policies.map((p, i) => (
              <div key={p.id} style={{
                display: "flex", gap: 14, padding: "16px 20px",
                borderBottom: i < policies.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: "var(--surface-2)", border: "1px solid var(--border-2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: "var(--text-3)", fontWeight: 500, marginTop: 1,
                }}>
                  {i + 1}
                </div>

                {editId === p.id ? (
                  /* ── Edit mode ─────────────────────────── */
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                    <textarea
                      rows={3}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveEdit(p.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                    />
                    {editError && (
                      <p style={{ fontSize: 12, color: "var(--red)", margin: 0 }}>⚠ {editError}</p>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <button
                        onClick={() => saveEdit(p.id)}
                        disabled={savingEdit || !editText.trim()}
                        style={{
                          background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                          color: "white", border: "none", padding: "7px 16px",
                          borderRadius: 8, fontSize: 12, fontWeight: 500,
                          cursor: savingEdit || !editText.trim() ? "not-allowed" : "pointer",
                          opacity: savingEdit || !editText.trim() ? .5 : 1,
                        }}
                      >
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={savingEdit}
                        style={{
                          background: "var(--surface-2)", border: "1px solid var(--border-2)",
                          color: "var(--text-2)", padding: "7px 14px", borderRadius: 8,
                          fontSize: 12, cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                        Editing clears the embedding — re-embed after saving
                      </span>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ─────────────────────────── */
                  <>
                    <p style={{ flex: 1, fontSize: 13, lineHeight: 1.7, color: "var(--text-2)", margin: 0 }}>
                      {p.policyText}
                    </p>
                    <button
                      onClick={() => startEdit(p)}
                      title="Edit policy"
                      style={{
                        flexShrink: 0, height: "fit-content", marginTop: 1,
                        background: "transparent", border: "1px solid var(--border-2)",
                        color: "var(--text-3)", padding: "4px 10px", borderRadius: 8,
                        fontSize: 11, cursor: "pointer",
                      }}
                    >
                      ✎ Edit
                    </button>
                    <span style={{
                      flexShrink: 0, fontSize: 11, padding: "3px 10px", borderRadius: 99,
                      height: "fit-content", marginTop: 3, whiteSpace: "nowrap",
                      background: p.embedded ? "rgba(34,197,94,0.1)"  : "rgba(245,158,11,0.1)",
                      color:      p.embedded ? "#22c55e"               : "#f59e0b",
                      border: `1px solid ${p.embedded ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)"}`,
                    }}>
                      {p.embedded ? "✓ Embedded" : "⏳ Pending"}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Embed button */}
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          {embedMsg && !pending ? (
            <p style={{ fontSize: 13, color: "#22c55e", textAlign: "center", margin: 0 }}>
              ✓ {embedMsg}
            </p>
          ) : (
            <>
              <button
                onClick={handleEmbed}
                disabled={embedding || pending === 0}
                style={{
                  width: "100%", padding: "12px",
                  background: "transparent",
                  border: `1px dashed ${pending > 0 ? "rgba(168,85,247,0.5)" : "var(--border)"}`,
                  borderRadius: 12,
                  cursor: pending > 0 && !embedding ? "pointer" : "not-allowed",
                  fontSize: 13,
                  color: pending > 0 ? "var(--accent-2)" : "var(--text-3)",
                  transition: "all .15s",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {embedding ? (
                  <>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span>
                    Generating embeddings…
                  </>
                ) : (
                  <>⚡ Embed {pending} pending {pending === 1 ? "policy" : "policies"}</>
                )}
              </button>
              {pending > 0 && !embedding && (
                <p style={{ fontSize: 11, color: "var(--text-3)", textAlign: "center", margin: "8px 0 0" }}>
                  Unembedded policies won't be used in policy checks
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add new policy */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20,
      }}>
        <p style={{
          fontSize: 12, color: "var(--text-3)", textTransform: "uppercase",
          letterSpacing: ".06em", marginBottom: 14, margin: "0 0 14px",
        }}>
          Add new policy
        </p>

        <textarea
          rows={3}
          placeholder="e.g. Entertainment expenses above ₹5,000 require VP approval and a business justification."
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd();
          }}
        />

        {addError && (
          <p style={{
            fontSize: 12, color: "var(--red)", margin: "8px 0 0",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)",
            borderRadius: 8, padding: "8px 12px",
          }}>
            ⚠ {addError}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button
            onClick={handleAdd}
            disabled={adding || !newText.trim()}
            style={{
              background: newText.trim() && !adding
                ? "linear-gradient(135deg, #7c3aed, #a855f7)"
                : "var(--surface-2)",
              color: "white", border: "none", padding: "10px 20px",
              borderRadius: 10, fontSize: 13, fontWeight: 500,
              cursor: newText.trim() && !adding ? "pointer" : "not-allowed",
              opacity: newText.trim() && !adding ? 1 : .4,
              transition: "all .15s",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {adding ? (
              <><span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span> Saving…</>
            ) : (
              "+ Add policy"
            )}
          </button>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            Ctrl+Enter to save · then embed to activate
          </span>
        </div>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
