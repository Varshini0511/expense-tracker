// In production (Vercel), set NEXT_PUBLIC_API_URL to your deployed backend's base URL
// (e.g. https://expensetracker-api.onrender.com). Falls back to localhost for dev.
const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5085"}/api/expenses`;

export interface Expense {
  id: number;
  description: string;
  amount: number;
  category: string | null;
  vendor: string | null;
  expenseDate: string;
  createdAt: string;
}

export interface AddExpenseRequest {
  description: string;
  amount: number;
  category?: string;
  vendor?: string;
  expenseDate: string;
}

export interface AddExpenseResponse {
  expenseId: number;
  description: string;
  amount: number;
  isCompliant: boolean;
  policyAdvice: string;
  relevantPolicy: string;
  status: string;
  agentReasoning: string;
}

export interface ExpensesResponse {
  totalCount: number;
  totalAmount: number;
  expenses: Expense[];
}

export async function getExpenses(): Promise<ExpensesResponse> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function addExpense(body: AddExpenseRequest): Promise<AddExpenseResponse> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export interface PolicyRow {
  id: number;
  policyText: string;
  embedded: boolean;
}

export async function addPolicy(policyText: string): Promise<PolicyRow> {
  const res = await fetch(`${BASE}/policies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policyText }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return { id: data.id, policyText, embedded: false };
}

export async function updatePolicy(id: number, policyText: string): Promise<void> {
  const res = await fetch(`${BASE}/policies/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policyText }),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function getPolicies(): Promise<PolicyRow[]> {
  const res = await fetch(`${BASE}/policies`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function embedPolicies(): Promise<void> {
  const res = await fetch(`${BASE}/embed-policies`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
}

export async function deleteExpense(id: number): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function updateExpense(id: number, body: AddExpenseRequest): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function askAgent(question: string): Promise<string> {
  const res = await fetch(`${BASE}/agent/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.answer;
}
