"use client";

import { useEffect, useState } from "react";
import { MarkdownMessage } from "@/app/components/MarkdownMessage";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "vi_chat_session_id";

const WELCOME =
  "Mình là Minh. Bạn đang tìm Palisade cho gia đình, đi làm, hay đi tỉnh?";

// ponytail: web-only think time — bump here; later: env / per-channel config
const REPLY_DELAY_MS = 1000;

function waitAtLeast(startedAt: number, minMs: number): Promise<void> {
  const left = minMs - (Date.now() - startedAt);
  if (left <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, left));
}

export function Chat() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME },
  ]);
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
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply as string },
      ]);
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
          <div className="bubble assistant typing" aria-label="Minh đang soạn tin">
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
        />
        <button type="submit" disabled={loading}>
          Gửi
        </button>
      </form>
    </div>
  );
}
