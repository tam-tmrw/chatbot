export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface LlmProvider {
  chat(messages: ChatMessage[]): Promise<string>;
}
