export type ChannelName = "web" | "messenger";

export type IncomingMessage = {
  sessionId?: string;
  channelUserId: string;
  channel: ChannelName;
  text: string;
};

export type OutgoingMessage = {
  sessionId: string;
  /** Joined bubbles — single-string consumers (API `reply`, notify); DB stores each bubble as its own row */
  text: string;
  /** 1–3 segments for web stagger / ManyChat multi-message */
  texts: string[];
  leadCaptured: boolean;
};
