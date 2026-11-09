"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoId } from "@/lib/demo-access";

export function DemoGate({ demo }: { demo: DemoId }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await fetch("/api/demo-access", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demo, code }),
    });
    setPending(false);
    if (!res.ok) {
      setError("Sai mã");
      return;
    }
    router.refresh();
  }

  return (
    <form className="chat-shell" onSubmit={onSubmit}>
      <header className="chat-header">
        <strong>Mã truy cập demo</strong>
      </header>
      <div className="chat-composer">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={6}
          autoComplete="off"
          aria-label="Mã 6 ký tự"
        />
        <button type="submit" disabled={pending || code.length !== 6}>
          Vào
        </button>
      </div>
      {error ? <p className="chat-error">{error}</p> : null}
    </form>
  );
}
