export async function notifyLead(_lead: {
  id: number;
  phone: string | null;
  sessionId: string;
}): Promise<void> {
  // ponytail: no-op until Slack/email wired via env
}
