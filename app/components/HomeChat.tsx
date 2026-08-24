"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Chat } from "@/app/components/Chat";
import { CHAT_SESSION_STORAGE_KEY } from "@/lib/web/chat-session";

/** Home `/`: continue last session via URL, else empty chat (lazy session). */
export function HomeChat() {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
    if (id) {
      router.replace(`/c/${id}`);
      return;
    }
    setShow(true);
  }, [router]);

  if (!show) return null;
  return <Chat />;
}
