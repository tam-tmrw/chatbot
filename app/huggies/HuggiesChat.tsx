"use client";

import { useEffect, useRef, useState } from "react";

type Btn = { id: string; label: string };
type Bubble = { role: "user" | "assistant"; text: string; imageUrl?: string; step?: string };
type Job = { videoUrl?: string | null; previewUrl?: string | null };
type DemoChannel = "zalo" | "messenger";
type DemoMode = "flow" | "guide";

const CHANNEL_LABELS: Record<DemoChannel, string> = {
  zalo: "Zalo (text / số)",
  messenger: "Messenger (button)",
};

const MODE_LABELS: Record<DemoMode, string> = {
  flow: "Flow chatbot",
  guide: "AI guide",
};

function cleanAssistantText(
  channel: DemoChannel,
  step: string | undefined,
  text: string,
  hasChips: boolean,
): string {
  if (channel === "zalo" || !hasChips) return text;
  if (step === "consent") {
    return "Trước khi bắt đầu, mình cần ba mẹ đồng ý Điều khoản sử dụng ảnh để tạo video.";
  }
  if (step === "gender") {
    return "Bé là bé trai hay bé gái ạ? (Mình không đoán từ ảnh đâu nhé.)";
  }
  if (step === "age_range") return "Bé đang ở độ tuổi nào ạ? Chọn mức gần đúng giúp mình nhé.";
  if (step === "hobby") return "Bé thích gì nhất? Chọn 1 sở thích để mình chọn kiểu video cho hợp nhé.";
  if (step === "confirm" && text.includes("Mình tóm tắt")) return "Mình tóm tắt lại cho ba mẹ kiểm tra nhé:";
  if (step === "welcome") return text;
  return text;
}

function summaryRows(text: string): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^(Tên|Tên trên video|Giới tính|Độ tuổi|Sở thích|Ảnh):\s*(.*)$/);
    if (m) rows.push({ label: m[1], value: m[2] || "—" });
  }
  return rows;
}

function chipClass(id: string): string {
  if (id === "confirm" || id === "start" || id === "yes" || id === "retry") {
    return "hg-chip hg-chip-primary";
  }
  if (id === "no" || id === "end") return "hg-chip hg-chip-muted";
  return "hg-chip";
}

export function HuggiesChat() {
  const [mode, setMode] = useState<DemoMode>("flow");
  const [channel, setChannel] = useState<DemoChannel>("zalo");
  const [draftMode, setDraftMode] = useState<DemoMode>("flow");
  const [draftChannel, setDraftChannel] = useState<DemoChannel>("zalo");
  const [configOpen, setConfigOpen] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<string>("welcome");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [buttons, setButtons] = useState<Btn[]>([]);
  const [text, setText] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [bubbles, buttons, job, step]);

  async function start(nextMode: DemoMode, nextChannel: DemoChannel) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/huggies/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: nextMode, channel: nextChannel }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Không tạo được phiên");
      return;
    }
    const data = await res.json();
    setSessionId(data.sessionId);
    setChannel(data.channel === "messenger" ? "messenger" : "zalo");
    setMode(data.mode === "guide" ? "guide" : "flow");
    setStep(data.step ?? "welcome");
    setBubbles(
      (data.messages as string[]).map((line) => ({
        role: "assistant",
        text: line,
        step: data.step,
      })),
    );
    setButtons(data.buttons ?? []);
    setJob(null);
  }

  useEffect(() => {
    void start("flow", "zalo");
  }, []);

  function applyPayload(
    data: {
      sessionId: string;
      mode?: DemoMode;
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
      setStep(data.step ?? "welcome");
      if (data.mode) setMode(data.mode === "guide" ? "guide" : "flow");
      setBubbles(
        (data.messages ?? []).map((line) => ({
          role: "assistant",
          text: line,
          step: data.step,
        })),
      );
      setButtons(data.buttons ?? []);
      setJob(null);
      return;
    }
    setSessionId(data.sessionId);
    if (data.mode) setMode(data.mode === "guide" ? "guide" : "flow");
    if (data.step) setStep(data.step);
    setBubbles((prev) => [
      ...prev,
      ...(user ? [user] : []),
      ...(data.messages ?? []).map((line) => ({
        role: "assistant" as const,
        text: line,
        step: data.step,
      })),
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
          ...(data.messages as string[]).map((line) => ({
            role: "assistant" as const,
            text: line,
            step: data.step,
          })),
        ]);
        setButtons(data.buttons ?? []);
      }
      if (data.step) setStep(data.step);
      if (data.job) setJob(data.job);
      if (data.step !== "processing") return;
    }
  }

  async function send(body: Record<string, unknown>, user?: Bubble) {
    if (!sessionId || busy) return;
    setError(null);
    setBusy(true);
    const res = await fetch("/api/huggies/message", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, ...body }),
    });
    setBusy(false);
    if (res.status === 404) {
      setError("Phiên demo đã hết — đang tạo lại…");
      await start(mode, channel);
      return;
    }
    if (!res.ok) {
      setError("Không gửi được");
      return;
    }
    applyPayload(await res.json(), user);
  }

  function pickFile(file: File) {
    if (mode === "guide" && step !== "photo") return;
    const imageUrl = URL.createObjectURL(file);
    urls.current.push(imageUrl);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const imageBase64 = raw.slice(raw.indexOf(",") + 1);
      void send(
        { type: "image", mime: file.type, imageBase64 },
        { role: "user", text: "", imageUrl },
      );
    };
    reader.readAsDataURL(file);
  }

  const lastConfirm = [...bubbles]
    .reverse()
    .find((b) => b.role === "assistant" && b.step === "confirm");
  const confirmSummary =
    channel === "messenger" && step === "confirm" && lastConfirm
      ? summaryRows(lastConfirm.text)
      : [];
  const choiceGrid =
    channel === "messenger" &&
    mode === "flow" &&
    (step === "hobby" || step === "age_range" || step === "gender" || step === "consent");
  const showChips = channel === "messenger" && buttons.length > 0;
  const showDropzone = step === "photo" && (channel === "messenger" || mode === "guide");
  const guidePhotoLocked = step !== "photo";
  const showMedia =
    channel === "messenger" && step === "result" && (job?.previewUrl || job?.videoUrl);
  const modeShort = mode === "guide" ? "AI guide" : "Flow";
  const channelShort =
    channel === "zalo" ? "Demo Zalo · text/số" : "Demo Messenger · button";

  return (
    <div className={`chat-shell hg-shell hg-channel-${channel}`}>
      <header className="chat-header hg-header">
        <div className="chat-header-row">
          <div className="chat-header-titles">
            <strong>Huggies</strong>
            <span>
              {modeShort} · {channelShort}
            </span>
          </div>
          <button
            type="button"
            className="hg-config-btn"
            aria-label="Cấu hình demo"
            aria-expanded={configOpen}
            onClick={() => {
              setDraftChannel(channel);
              setDraftMode(mode);
              setConfigOpen((open) => !open);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 13a7.7 7.7 0 0 0 .1-2l2-1.2-2-3.4-2.3.7a7.6 7.6 0 0 0-1.7-1L15 3.5h-4l-.5 2.6a7.6 7.6 0 0 0-1.7 1L6.5 6.4l-2 3.4 2 1.2a7.7 7.7 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a7.6 7.6 0 0 0 1.7 1l.5 2.6h4l.5-2.6a7.6 7.6 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {configOpen ? (
        <div className="hg-config-backdrop" onClick={() => setConfigOpen(false)}>
          <div
            className="hg-config-panel"
            role="dialog"
            aria-label="Cấu hình demo"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Cấu hình pitch</h2>
            <p className="hg-config-note">Đổi xong sẽ bắt đầu chat mới. Chỉ mô phỏng UI web.</p>
            <fieldset className="hg-fieldset">
              <legend>Kênh demo</legend>
              {(Object.keys(CHANNEL_LABELS) as DemoChannel[]).map((key) => (
                <label key={key} className="hg-radio">
                  <input
                    type="radio"
                    name="channel"
                    checked={draftChannel === key}
                    onChange={() => setDraftChannel(key)}
                  />
                  <span>{CHANNEL_LABELS[key]}</span>
                  <code>{key}</code>
                </label>
              ))}
            </fieldset>
            <fieldset className="hg-fieldset">
              <legend>Mode</legend>
              {(Object.keys(MODE_LABELS) as DemoMode[]).map((key) => (
                <label key={key} className="hg-radio">
                  <input
                    type="radio"
                    name="mode"
                    checked={draftMode === key}
                    onChange={() => setDraftMode(key)}
                  />
                  <span>{MODE_LABELS[key]}</span>
                  <code>{key}</code>
                </label>
              ))}
            </fieldset>
            <div className="hg-config-actions">
              <button type="button" className="hg-chip" onClick={() => setConfigOpen(false)}>
                Huỷ
              </button>
              <button
                type="button"
                className="hg-chip hg-chip-primary"
                onClick={() => {
                  setMode(draftMode);
                  setChannel(draftChannel);
                  setConfigOpen(false);
                  void start(draftMode, draftChannel);
                }}
              >
                Áp dụng
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="chat-thread" ref={threadRef}>
        {bubbles.map((bubble, i) => {
          const isLastAssistant =
            bubble.role === "assistant" &&
            i === bubbles.map((b) => b.role).lastIndexOf("assistant");
          const showConfirmCard =
            isLastAssistant &&
            channel === "messenger" &&
            bubble.step === "confirm" &&
            confirmSummary.length > 0;
          const textToShow = cleanAssistantText(
            channel,
            bubble.step,
            bubble.text,
            Boolean(showChips && isLastAssistant),
          );
          return (
            <div key={i} className={`bubble ${bubble.role}`}>
              {bubble.imageUrl ? (
                <img className="hg-thumb" alt="Ảnh đã gửi" src={bubble.imageUrl} />
              ) : null}
              {showConfirmCard ? (
                <>
                  <p className="hg-bubble-lead">{textToShow}</p>
                  <dl className="hg-summary">
                    {confirmSummary.map((row) => (
                      <div key={row.label} className="hg-summary-row">
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : bubble.text || !bubble.imageUrl ? (
                <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{textToShow}</p>
              ) : null}
            </div>
          );
        })}

        {step === "processing" ? (
          <div className="bubble assistant typing" aria-label="Đang tạo video">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        ) : null}

        {showMedia ? (
          <div className="hg-media-card">
            {job?.previewUrl ? <img alt="" src={job.previewUrl} /> : null}
            {job?.videoUrl ? <video controls src={job.videoUrl} playsInline /> : null}
          </div>
        ) : null}

        {channel === "zalo" && step === "result" && job?.videoUrl ? (
          <div className="bubble assistant">
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{job.videoUrl}</p>
          </div>
        ) : null}

        {showDropzone ? (
          <button
            type="button"
            className="hg-dropzone"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <span className="hg-dropzone-icon" aria-hidden>
              📷
            </span>
            <strong>Chạm để chọn ảnh bé</strong>
            <span>JPG hoặc PNG · tối đa 5MB</span>
          </button>
        ) : null}

        {showChips ? (
          <div className={choiceGrid ? "hg-chips hg-chips-grid" : "hg-chips"}>
            {buttons.map((button) => (
              <button
                key={button.id}
                type="button"
                className={chipClass(button.id)}
                disabled={busy}
                onClick={() =>
                  void send(
                    { type: "button", buttonId: button.id },
                    { role: "user", text: button.label },
                  )
                }
              >
                {button.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="chat-error">{error}</p> : null}

      <form
        className="chat-composer hg-composer"
        onSubmit={(e) => {
          e.preventDefault();
          const value = text.trim();
          if (!value) return;
          setText("");
          void send({ type: "text", text: value }, { role: "user", text: value });
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hg-file-hidden"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) pickFile(file);
          }}
        />
        <button
          type="button"
          className={step === "photo" ? "hg-photo-btn hg-photo-btn-active" : "hg-photo-btn"}
          aria-label="Gửi ảnh bé"
          disabled={busy || guidePhotoLocked}
          onClick={() => {
            if (guidePhotoLocked) return;
            fileRef.current?.click();
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M4 7.5A2.5 2.5 0 0 1 6.5 5h2.1l1.2-1.5A1.5 1.5 0 0 1 11 3h2a1.5 1.5 0 0 1 1.2.5L15.4 5h2.1A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            step === "photo"
              ? "Gửi ảnh bằng nút camera…"
              : channel === "zalo" && mode === "flow"
                ? "Gõ số hoặc tin nhắn…"
                : "Nhắn gì đó…"
          }
          aria-label="Tin nhắn"
          disabled={busy || step === "processing"}
        />
        <button type="submit" disabled={busy || !text.trim() || step === "processing"}>
          Gửi
        </button>
      </form>
    </div>
  );
}
