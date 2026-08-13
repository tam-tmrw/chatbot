export type ChannelName = "web" | "messenger";

export type IncomingMessage = {
  sessionId?: string;
  channelUserId: string;
  channel: ChannelName;
  text: string;
};

export type OutgoingMessage = {
  sessionId: string;
  text: string;
  leadCaptured: boolean;
  quickReplies: string[];
  stage: string;
};
