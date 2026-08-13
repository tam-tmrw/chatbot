"use client";

import { useCallback, useEffect, useState } from "react";

const SECRET_KEY = "vi_admin_secret";

type Lead = {
  id: number;
  phone: string;
  summary: string | null;
  createdAt: string;
};

type Message = {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("vi-VN");
}

export default function AdminLeadsPage() {
  const [secret, setSecret] = useState<string | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem(SECRET_KEY);
    if (stored) setSecret(stored);
    else {
      const entered = window.prompt("Nhập ADMIN_SECRET:");
      if (entered) {
        sessionStorage.setItem(SECRET_KEY, entered);
        setSecret(entered);
      }
    }
  }, []);

  const fetchLeads = useCallback(async () => {
    if (!secret) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/leads", {
        headers: { "x-admin-secret": secret },
      });
      if (res.status === 401) {
        sessionStorage.removeItem(SECRET_KEY);
        setSecret(null);
        throw new Error("Sai mật khẩu admin");
      }
      if (!res.ok) throw new Error("Không tải được danh sách");
      const data = await res.json();
      setLeads(data.leads);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }, [secret]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function loadDetail(lead: Lead) {
    if (!secret) return;
    setSelected(lead);
    setMessages([]);
    setError(null);
    try {
      const res = await fetch(`/api/admin/leads/${lead.id}`, {
        headers: { "x-admin-secret": secret },
      });
      if (!res.ok) throw new Error("Không tải được chi tiết");
      const data = await res.json();
      setMessages(data.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    }
  }

  if (!secret) {
    return (
      <main className="admin-shell">
        <p className="admin-error">Cần ADMIN_SECRET để xem leads.</p>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <h1>Leads</h1>
        <button type="button" onClick={fetchLeads} disabled={loading}>
          {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </header>

      {error && <p className="admin-error">{error}</p>}

      <div className="admin-layout">
        <ul className="admin-list">
          {leads.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                className={`admin-row${selected?.id === lead.id ? " selected" : ""}`}
                onClick={() => loadDetail(lead)}
              >
                <strong>{lead.phone}</strong>
                <span>{lead.summary ?? "—"}</span>
                <time>{formatDate(lead.createdAt)}</time>
              </button>
            </li>
          ))}
          {!loading && leads.length === 0 && (
            <li className="admin-empty">Chưa có lead nào.</li>
          )}
        </ul>

        {selected && (
          <section className="admin-detail">
            <h2>{selected.phone}</h2>
            <p>{selected.summary}</p>
            <div className="admin-messages">
              {messages.map((m) => (
                <div key={m.id} className={`bubble ${m.role === "user" ? "user" : "assistant"}`}>
                  {m.content}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
