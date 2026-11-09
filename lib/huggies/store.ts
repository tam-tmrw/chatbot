import type { Session } from "@/lib/huggies/types";

const sessions = new Map<string, Session>();

export function resetHuggiesStore(): void {
  sessions.clear();
}

export function createHuggiesSession(session: Session): void {
  sessions.set(session.id, session);
}

export function getHuggiesSession(id: string): Session | undefined {
  return sessions.get(id);
}

export function saveHuggiesSession(session: Session): void {
  sessions.set(session.id, session);
}
