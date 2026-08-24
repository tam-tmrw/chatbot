"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CHAT_SESSION_STORAGE_KEY } from "@/lib/web/chat-session";

export default function SessionNotFound() {
  useEffect(() => {
    localStorage.removeItem(CHAT_SESSION_STORAGE_KEY);
  }, []);

  return (
    <main className="session-missing">
      <h1>Không tìm thấy hội thoại</h1>
      <p>Link này không còn hoặc không đúng. Bắt đầu chat mới nhé.</p>
      <Link href="/" className="session-missing-cta">
        Chat mới
      </Link>
    </main>
  );
}
