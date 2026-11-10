"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoId } from "@/lib/demo-access";

const LABELS: Record<DemoId, string> = {
  hyundai: "Hyundai · Minh",
  huggies: "Huggies",
};

export function DemoGate({ demo }: { demo: DemoId }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6 || pending) return;
    setPending(true);
    setError(null);
    const res = await fetch("/api/demo-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demo, code }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Sai mã truy cập");
      return;
    }
    router.refresh();
  }

  return (
    <div className="demo-gate">
      <form className="demo-gate-card" onSubmit={onSubmit}>
        <p className="demo-gate-brand">{LABELS[demo]}</p>
        <h1 className="demo-gate-title">Nhập mã demo</h1>
        <p className="demo-gate-hint">Mã gồm đúng 6 ký tự</p>
        <input
          className="demo-gate-input"
          value={code}
          onChange={(e) => setCode(e.target.value.slice(0, 6))}
          maxLength={6}
          autoComplete="off"
          autoFocus
          spellCheck={false}
          inputMode="text"
          aria-label="Mã 6 ký tự"
          placeholder="••••••"
        />
        {error ? <p className="demo-gate-error">{error}</p> : null}
        <button
          type="submit"
          className="demo-gate-submit"
          disabled={pending || code.length !== 6}
        >
          {pending ? "Đang vào…" : "Vào demo"}
        </button>
      </form>
    </div>
  );
}
