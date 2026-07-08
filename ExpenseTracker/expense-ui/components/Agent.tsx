"use client";
import { useRef, useState } from "react";
import { askAgent } from "@/lib/api";

interface Message { role: "user" | "bot"; text: string; }

const CHIPS = [
  "What is my total spend by category?",
  "Show me my recent expenses",
  "What is the meals policy?",
  "Am I within budget for travel?",
];

export default function Agent() {
  const [messages, setMessages] = useState<Message[]>([
    { role: "bot", text: "Hi! Ask me anything about your expenses or company policies. I can look up spending summaries, recent transactions, and policy rules." },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);

  function scrollDown() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
  }

  async function send(question: string) {
    if (!question.trim() || loading) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setLoading(true);
    scrollDown();
    try {
      const answer = await askAgent(question);
      setMessages((m) => [...m, { role: "bot", text: answer }]);
    } catch (err: unknown) {
      setMessages((m) => [...m, {
        role: "bot",
        text: `⚠ ${err instanceof Error ? err.message : "Something went wrong."}`,
      }]);
    } finally {
      setLoading(false);
      scrollDown();
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Quick chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {CHIPS.map((c) => (
          <button key={c} onClick={() => send(c)} style={{
            fontSize: 12, padding: "6px 14px", borderRadius: 99,
            border: "1px solid var(--border-2)",
            background: "var(--surface)", color: "var(--text-2)",
            cursor: "pointer", transition: "all .12s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(168,85,247,0.4)"; e.currentTarget.style.color = "var(--accent-2)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-2)"; e.currentTarget.style.color = "var(--text-2)"; }}
          >
            {c} ↗
          </button>
        ))}
      </div>

      {/* Chat window */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#22c55e",
            boxShadow: "0 0 6px #22c55e",
          }} />
          <span style={{ fontSize: 13, color: "var(--text-2)" }}>AI Agent</span>
          <span style={{
            marginLeft: "auto", fontSize: 11, color: "var(--text-3)",
            background: "var(--surface-2)", border: "1px solid var(--border)",
            borderRadius: 99, padding: "2px 10px",
          }}>llama-3.3-70b</span>
        </div>

        {/* Messages */}
        <div style={{ padding: 18, overflowY: "auto", maxHeight: 400,
          display: "flex", flexDirection: "column", gap: 14 }}>
          {messages.map((m, i) => (
            <div key={i} style={{
              display: "flex", gap: 10, maxWidth: "84%",
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              flexDirection: m.role === "user" ? "row-reverse" : "row",
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14,
                background: m.role === "bot"
                  ? "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(168,85,247,0.2))"
                  : "var(--surface-2)",
                border: "1px solid var(--border-2)",
              }}>
                {m.role === "bot" ? "◈" : "◉"}
              </div>
              <div style={{
                padding: "11px 15px",
                borderRadius: m.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap",
                background: m.role === "user"
                  ? "linear-gradient(135deg, #7c3aed, #a855f7)"
                  : "var(--surface-2)",
                color:      m.role === "user" ? "white" : "var(--text-1)",
                border:     m.role === "user" ? "none" : "1px solid var(--border)",
              }}>
                {m.text}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: 10, alignSelf: "flex-start" }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(168,85,247,0.2))",
                border: "1px solid var(--border-2)", fontSize: 14,
              }}>◈</div>
              <div style={{
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: "4px 14px 14px 14px", padding: "14px 18px",
                display: "flex", gap: 5, alignItems: "center",
              }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: "var(--accent-2)", display: "inline-block",
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          borderTop: "1px solid var(--border)", padding: "12px 14px",
          display: "flex", gap: 10,
        }}>
          <input
            placeholder="Ask about your expenses…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            disabled={loading}
            style={{ flex: 1 }}
          />
          <button onClick={() => send(input)} disabled={loading || !input.trim()} style={{
            background: input.trim() && !loading
              ? "linear-gradient(135deg, #7c3aed, #a855f7)"
              : "var(--surface-2)",
            color: "white", border: "1px solid var(--border-2)",
            padding: "0 18px", borderRadius: 10, fontSize: 14, fontWeight: 500,
            cursor: input.trim() && !loading ? "pointer" : "not-allowed",
            opacity: input.trim() && !loading ? 1 : .4, transition: "all .15s",
            whiteSpace: "nowrap",
          }}>
            Send →
          </button>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
