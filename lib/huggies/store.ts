import type { Session } from "@/lib/huggies/types";

// ponytail: demo in-memory only; globalThis so Next HMR / dual route bundles share one Map
const g = globalThis as typeof globalThis & {
  __huggiesSessions?: Map<string, Session>;
};
const sessions = g.__huggiesSessions ?? new Map<string, Session>();
g.__huggiesSessions = sessions;

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
