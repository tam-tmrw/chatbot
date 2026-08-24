"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownMessage } from "@/app/components/MarkdownMessage";
import { CHAT_SESSION_STORAGE_KEY } from "@/lib/web/chat-session";

type Msg = {
  id?: number;
  role: "user" | "assistant";
  content: string;
  key: string;
};

// ponytail: web-only — bump later / env if needed
const REPLY_DELAY_MS = 1500;
const BUBBLE_STAGGER_MS = 1000;
const PAGE_SIZE = 20;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitAtLeast(startedAt: number, minMs: number): Promise<void> {
  const left = minMs - (Date.now() - startedAt);
  if (left <= 0) return Promise.resolve();
  return wait(left);
}

/** Legacy joined assistant rows → multiple UI bubbles (S6). */
function expandRows(
  rows: Array<{ id: number; role: string; content: string }>,
): Msg[] {
  const out: Msg[] = [];
  for (const r of rows) {
    if (r.role !== "user" && r.role !== "assistant") continue;
    if (r.role === "assistant" && r.content.includes("\n\n")) {
      const parts = r.content
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      parts.forEach((content, i) => {
        out.push({
          id: r.id,
          role: "assistant",
          content,
          key: `${r.id}-${i}`,
        });
      });
    } else {
      out.push({
        id: r.id,
        role: r.role,
        content: r.content,
        key: String(r.id),
      });
    }
  }
  return out;
}

type ChatProps = {
  /** Bound route `/c/[sessionId]` — hydrate from API */
  sessionId?: string;
};

export function Chat({ sessionId: boundSessionId }: ChatProps = {}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | undefined>(
    boundSessionId,
  );
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(Boolean(boundSessionId));
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const oldestIdRef = useRef<number | undefined>(undefined);
  const tempKeyRef = useRef(0);
  const nextTempKey = () => `t-${Date.now()}-${tempKeyRef.current++}`;

  const hydrate = useCallback(async (id: string) => {
    setHydrating(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/chat/sessions/${encodeURIComponent(id)}/messages?limit=${PAGE_SIZE}`,
      );
      if (res.status === 404) {
        localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
        setError("Không tìm thấy hội thoại");
        setMessages([]);
        setHasMore(false);
        return;
      }
      if (!res.ok) throw new Error("Không tải được lịch sử chat");
      const data = (await res.json()) as {
        messages: Array<{ id: number; role: string; content: string }>;
        hasMore: boolean;
      };
      const expanded = expandRows(data.messages);
      setMessages(expanded);
      setHasMore(Boolean(data.hasMore));
      oldestIdRef.current = data.messages[0]?.id;
      localStorage.setItem(CHAT_SESSION_STORAGE_KEY, id);
      setSessionId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setHydrating(false);
    }
  }, []);

  useEffect(() => {
    if (boundSessionId) void hydrate(boundSessionId);
  }, [boundSessionId, hydrate]);

  async function loadOlder() {
    if (!sessionId || !hasMore || loadingOlder || hydrating) return;
    const beforeId = oldestIdRef.current;
    if (beforeId == null) return;
    const el = threadRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/chat/sessions/${encodeURIComponent(sessionId)}/messages?limit=${PAGE_SIZE}&beforeId=${beforeId}`,
      );
      if (!res.ok) throw new Error("Không tải thêm tin cũ");
      const data = (await res.json()) as {
        messages: Array<{ id: number; role: string; content: string }>;
        hasMore: boolean;
      };
      if (!data.messages.length) {
        setHasMore(false);
        return;
      }
      const expanded = expandRows(data.messages);
      oldestIdRef.current = data.messages[0]?.id;
      setHasMore(Boolean(data.hasMore));
      setMessages((m) => [...expanded, ...m]);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoadingOlder(false);
    }
  }

  function onThreadScroll() {
    const el = threadRef.current;
    if (!el || el.scrollTop > 40) return;
    void loadOlder();
  }

  function newChat() {
    localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
    setSessionId(undefined);
    setMessages([]);
    setHasMore(false);
    oldestIdRef.current = undefined;
    setError(null);
    router.push("/");
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || hydrating) return;
    setError(null);
    setInput("");
    setMessages((m) => [
      ...m,
      { role: "user", content: text, key: nextTempKey() },
    ]);
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
      localStorage.setItem(CHAT_SESSION_STORAGE_KEY, data.sessionId);
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
          {
            role: "assistant",
            content: replies[i],
            key: nextTempKey(),
          },
        ]);
      }

      // After first send on `/`, bind URL (hydrate on remount picks up DB rows)
      if (!boundSessionId && data.sessionId) {
        router.replace(`/c/${data.sessionId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lỗi");
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || hydrating;

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <div className="chat-header-row">
          <div className="chat-header-titles">
            <strong>Minh</strong>
            <span>TMRW · người bạn rành xe</span>
          </div>
          <button type="button" className="chat-new" onClick={newChat}>
            Chat mới
          </button>
        </div>
      </header>
      <div
        className="chat-thread"
        ref={threadRef}
        onScroll={onThreadScroll}
      >
        {loadingOlder ? (
          <p className="chat-load-older">Đang tải tin cũ…</p>
        ) : null}
        {hydrating ? (
          <p className="chat-load-older">Đang tải hội thoại…</p>
        ) : null}
        {messages.map((m) => (
          <div key={m.key} className={`bubble ${m.role}`}>
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
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          Gửi
        </button>
      </form>
    </div>
  );
}
