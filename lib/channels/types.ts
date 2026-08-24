export type ChannelName = "web" | "messenger";

export type IncomingMessage = {
  sessionId?: string;
  channelUserId: string;
  channel: ChannelName;
  text: string;
};

export type OutgoingMessage = {
  sessionId: string;
  /** Joined bubbles — for DB history and single-string consumers */
  text: string;
  /** 1–3 segments for web stagger / ManyChat multi-message */
  texts: string[];
  leadCaptured: boolean;
};
