const VN_MOBILE =
  /(?:\+?84|0)(?:3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])(?:[\s.]?\d){7}/g;

export function normalizeVnPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("84") && local.length === 11) {
    local = `0${local.slice(2)}`;
  }
  if (!/^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9\d)\d{7}$/.test(local)) {
    return null;
  }
  return local;
}

export function extractVnPhone(text: string): string | null {
  const matches = text.match(VN_MOBILE);
  if (!matches?.length) return null;
  for (const m of matches) {
    const n = normalizeVnPhone(m);
    if (n) return n;
  }
  return null;
}
