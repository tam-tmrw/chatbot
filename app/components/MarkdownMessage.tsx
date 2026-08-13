import { markdownToSafeHtml } from "@/lib/chat/markdown";

export function MarkdownMessage({ text }: { text: string }) {
  return (
    <div
      className="md"
      dangerouslySetInnerHTML={{ __html: markdownToSafeHtml(text) }}
    />
  );
}
