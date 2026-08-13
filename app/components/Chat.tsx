"use client";

import { useEffect, useState } from "react";
import { MarkdownMessage } from "@/app/components/MarkdownMessage";
import { WELCOME_REPLIES, WELCOME_TEXT } from "@/lib/conversation/flow";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "vi_chat_session_id";

export function Chat() {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: WELCOME_TEXT },
  ]);
  const [quickReplies, setQuickReplies] = useState<string[]>(WELCOME_REPLIES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) setSessionId(existing);
  }, []);

  async function send(raw?: string) {
    const text = (raw ?? input).trim();
    if (!text || loading) return;
    setError(null);
    setInput("");
    setQuickReplies([]);
    setMessages((m) => [...m, { role: "user", content: text }]);
    setLoading(true);
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
      localStorage.setItem(STORAGE_KEY, data.sessionId);
      setSessionId(data.sessionId);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply as string },
      ]);
      setQuickReplies(
        Array.isArray(data.quickReplies) ? data.quickReplies : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <strong>MAI</strong>
        <span>TMRW · Palisade bestie</span>
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
        {loading ? <div className="bubble assistant">...</div> : null}
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
      {quickReplies.length > 0 && !loading ? (
        <div className="quick-replies">
          {quickReplies.map((label) => (
            <button
              key={label}
              type="button"
              className="quick-reply"
              onClick={() => void send(label)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
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
