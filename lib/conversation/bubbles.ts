export const MAX_BUBBLES = 3;

/** Parse LLM JSON `{ "bubbles": string[] }` → 1..MAX_BUBBLES texts. Non-JSON → single bubble. */
export function parseBubbles(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [" "];

  const jsonText = extractJsonObject(trimmed);
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { bubbles?: unknown }).bubbles)
      ) {
        const bubbles = (parsed as { bubbles: unknown[] }).bubbles
          .filter((b): b is string => typeof b === "string")
          .map((b) => b.trim())
          .filter(Boolean);
        if (bubbles.length) return clampBubbles(expandNewlines(bubbles));
      }
    } catch {
      // fall through
    }
  }

  return clampBubbles(expandNewlines([trimmed]));
}

/** Split each chunk on blank/single newlines so long LLM lines become more bubbles. */
function expandNewlines(texts: string[]): string[] {
  return texts
    .flatMap((t) => t.split(/\n+/))
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Cap at MAX_BUBBLES; merge overflow into last so we don't drop copy. */
function clampBubbles(parts: string[]): string[] {
  if (parts.length <= MAX_BUBBLES) return parts;
  return [
    ...parts.slice(0, MAX_BUBBLES - 1),
    parts.slice(MAX_BUBBLES - 1).join(" "),
  ];
}

function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

export function joinBubbles(texts: string[]): string {
  return texts.join("\n\n");
}
