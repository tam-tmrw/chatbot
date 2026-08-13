/** Escape then apply a tiny markdown subset. No raw HTML from the model. */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function isUl(line: string): boolean {
  return /^[-*]\s+/.test(line);
}

function isOl(line: string): boolean {
  return /^\d+\.\s+/.test(line);
}

function listItemHtml(line: string): string {
  const text = line.replace(/^([-*]|\d+\.)\s+/, "");
  return `<li>${inline(text)}</li>`;
}

export function markdownToSafeHtml(src: string): string {
  const text = escapeHtml(src.replace(/\r\n/g, "\n").trim());
  if (!text) return "";

  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = (line.match(/^#+/) ?? ["#"])[0].length;
      const title = line.replace(/^#{1,3}\s+/, "");
      out.push(`<h${level}>${inline(title)}</h${level}>`);
      i += 1;
      continue;
    }

    if (isUl(line)) {
      const items: string[] = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(listItemHtml(lines[i]));
        i += 1;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (isOl(line)) {
      const items: string[] = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(listItemHtml(lines[i]));
        i += 1;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isUl(lines[i]) &&
      !isOl(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join("<br />"))}</p>`);
  }

  return out.join("");
}
