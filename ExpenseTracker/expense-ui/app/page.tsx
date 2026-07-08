"use client";
import { useState } from "react";
import Dashboard  from "@/components/Dashboard";
import AddExpense from "@/components/AddExpense";
import Agent      from "@/components/Agent";
import Policies   from "@/components/Policies";

const TABS = [
  { id: "dashboard", label: "Dashboard",   icon: "⬡" },
  { id: "add",       label: "Add expense", icon: "+" },
  { id: "agent",     label: "AI agent",    icon: "◈" },
  { id: "policies",  label: "Policies",    icon: "≡" },
] as const;

type Tab = typeof TABS[number]["id"];

export default function Home() {
  const [active, setActive] = useState<Tab>("dashboard");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid var(--border)",
        padding: "0 24px",
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(9,9,11,0.85)",
        backdropFilter: "blur(12px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #7c3aed, #a855f7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>💰</div>
          <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text-1)", letterSpacing: "-0.01em" }}>
            ExpenseAI
          </span>
        </div>
        <div style={{
          fontSize: 12, color: "var(--text-3)",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: 99,
          padding: "4px 12px",
        }}>
          Powered by Groq + Gemini
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "28px 16px" }}>
        {/* Tab nav */}
        <nav style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 4,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 4,
          marginBottom: 24,
        }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: 7, padding: "9px 12px", borderRadius: 10, border: "none",
                cursor: "pointer", fontSize: 13, fontWeight: active === tab.id ? 500 : 400,
                transition: "all .15s",
                background: active === tab.id
                  ? "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(168,85,247,0.15))"
                  : "transparent",
                color: active === tab.id ? "var(--text-1)" : "var(--text-2)",
                boxShadow: active === tab.id ? "inset 0 0 0 1px rgba(168,85,247,0.3)" : "none",
              }}
            >
              <span style={{ fontSize: 15, opacity: .8 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {active === "dashboard" && <Dashboard />}
        {active === "add"       && <AddExpense />}
        {active === "agent"     && <Agent />}
        {active === "policies"  && <Policies />}
      </div>
    </div>
  );
}
