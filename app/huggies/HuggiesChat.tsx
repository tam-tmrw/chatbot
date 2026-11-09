"use client";

import { useEffect, useRef, useState } from "react";

type Btn = { id: string; label: string };
type Bubble = { role: "user" | "assistant"; text: string; imageUrl?: string };
type Job = { videoUrl?: string | null; previewUrl?: string | null };
type Scenario = "success" | "error_photo_invalid" | "error_render";

export function HuggiesChat() {
  const [scenario, setScenario] = useState<Scenario>("success");
  const [ai, setAi] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [text, setText] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  async function start(nextScenario: Scenario, nextAi: boolean) {
    const res = await fetch("/api/huggies/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenario: nextScenario, ai: nextAi }),
    });
    if (!res.ok) {
      setError("Không tạo được phiên");
      return;
    }
    const data = await res.json();
    setSessionId(data.sessionId);
    setBubbles((data.messages as string[]).map((line) => ({ role: "assistant", text: line })));
    setButtons(data.buttons ?? []);
    setJob(null);
  }

  useEffect(() => {
    void start("success", true);
  }, []);

  function applyPayload(
    data: {
      sessionId: string;
      messages?: string[];
      buttons?: Btn[];
      step?: string;
      jobId?: string | null;
      job?: Job | null;
      restart?: boolean;
    },
    user?: Bubble,
  ) {
    if (data.restart) {
      setSessionId(data.sessionId);
      setBubbles((data.messages ?? []).map((line) => ({ role: "assistant", text: line })));
      setButtons(data.buttons ?? []);
      setJob(null);
      return;
    }
    setSessionId(data.sessionId);
    setBubbles((prev) => [
      ...prev,
      ...(user ? [user] : []),
      ...(data.messages ?? []).map((line) => ({ role: "assistant" as const, text: line })),
    ]);
    setButtons(data.buttons ?? []);
    if (data.job) setJob(data.job);
    if (data.step === "processing" && data.jobId) void poll(data.sessionId);
  }

  async function poll(id: string) {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
      if (sessionIdRef.current !== id) return;
      const res = await fetch(`/api/huggies/job?sessionId=${encodeURIComponent(id)}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (sessionIdRef.current !== id) return;
      if ((data.messages as string[] | undefined)?.length) {
        setBubbles((prev) => [
          ...prev,
          ...(data.messages as string[]).map((line) => ({ role: "assistant" as const, text: line })),
        ]);
        setButtons(data.buttons ?? []);
      }
      if (data.job) setJob(data.job);
      if (data.step !== "processing") return;
    }
  }

  async function send(body: Record<string, unknown>, user?: Bubble) {
    if (!sessionId) return;
    setError(null);
    const res = await fetch("/api/huggies/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, ...body }),
    });
    if (!res.ok) {
      setError("Không gửi được");
      return;
    }
    applyPayload(await res.json(), user);
  }

  return (
    <div className="chat-shell">
      <header className="chat-header">
        <strong>Huggies</strong>
        <select
          aria-label="scenario"
          value={scenario}
          onChange={(e) => {
            const value = e.target.value as Scenario;
            setScenario(value);
            void start(value, ai);
          }}
        >
          <option value="success">success</option>
          <option value="error_photo_invalid">error_photo_invalid</option>
          <option value="error_render">error_render</option>
        </select>
        <select
          aria-label="ai"
          value={ai ? "on" : "off"}
          onChange={(e) => {
            const next = e.target.value === "on";
            setAi(next);
            void start(scenario, next);
          }}
        >
          <option value="on">ai on</option>
          <option value="off">ai off</option>
        </select>
      </header>
      <div className="chat-thread">
        {bubbles.map((bubble, i) => (
          <div key={i} className={`bubble ${bubble.role}`}>
            {bubble.imageUrl ? <img alt="" src={bubble.imageUrl} /> : null}
            <p>{bubble.text}</p>
          </div>
        ))}
        {job?.previewUrl ? <img alt="" src={job.previewUrl} /> : null}
        {job?.videoUrl ? <video controls src={job.videoUrl} /> : null}
        <div>
          {buttons.map((button) => (
            <button
              key={button.id}
              type="button"
              onClick={() =>
                void send({ type: "button", buttonId: button.id }, { role: "user", text: button.label })
              }
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          setText("");
          void send({ type: "text", text: value }, { role: "user", text: value });
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Tin nhắn" />
        <input
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Ảnh bé"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            const imageUrl = URL.createObjectURL(file);
            urls.current.push(imageUrl);
            const reader = new FileReader();
            reader.onload = () => {
              const raw = String(reader.result ?? "");
              const imageBase64 = raw.slice(raw.indexOf(",") + 1);
              void send({ type: "image", mime: file.type, imageBase64 }, { role: "user", text: "Ảnh", imageUrl });
            };
            reader.readAsDataURL(file);
          }}
        />
        <button type="submit">Gửi</button>
      </form>
    </div>
  );
}
