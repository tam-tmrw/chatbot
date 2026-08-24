"use client";

import { useEffect, useState } from "react";
import { MarkdownMessage } from "@/app/components/MarkdownMessage";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "vi_chat_session_id";

// ponytail: web-only — bump later / env if needed
const REPLY_DELAY_MS = 1500;
const BUBBLE_STAGGER_MS = 1000;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitAtLeast(startedAt: number, minMs: number): Promise<void> {
  const left = minMs - (Date.now() - startedAt);
  if (left <= 0) return Promise.resolve();
  return wait(left);
}

export function Chat() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) setSessionId(existing);
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
    const startedAt = Date.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          sessionId,
          channelUserId: "web-browser",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lỗi gửi tin");
      await waitAtLeast(startedAt, REPLY_DELAY_MS);
      localStorage.setItem(STORAGE_KEY, data.sessionId);
      setSessionId(data.sessionId);

      const replies: string[] = Array.isArray(data.replies)
        ? data.replies.filter((r: unknown): r is string => typeof r === "string")
        : typeof data.reply === "string"
          ? [data.reply]
          : [];

      for (let i = 0; i < replies.length; i++) {
        if (i > 0) await wait(BUBBLE_STAGGER_MS);
        setMessages((m) => [
          ...m,
          { role: "assistant", content: replies[i] },
        ]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <strong>Minh</strong>
        <span>TMRW · người bạn rành xe</span>
      </header>
      <div className="chat-thread">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === "assistant" ? (
              <MarkdownMessage text={m.content} />
            ) : (
              m.content
            )}
          </div>
        ))}
        {loading ? (
          <div
            className="bubble assistant typing"
            aria-label="Minh đang soạn tin"
          >
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : null}
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhắn gì đó..."
          maxLength={2000}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>
          Gửi
        </button>
      </form>
    </div>
  );
}
