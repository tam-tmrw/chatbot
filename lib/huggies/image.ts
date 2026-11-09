export function imageMinEdge(bytes: Uint8Array): number | null {
  if (
    bytes.length >= 24 &&
    bytes[0] === 137 &&
    bytes[1] === 80 &&
    bytes[2] === 78 &&
    bytes[3] === 71
  ) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const w = view.getUint32(16);
    const h = view.getUint32(20);
    return Math.min(w, h);
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = bytes[i + 1];
      const sof = marker >= 0xc0 && marker <= 0xc3;
      if (sof) {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const h = view.getUint16(i + 5);
        const w = view.getUint16(i + 7);
        return Math.min(w, h);
      }
      const len = (bytes[i + 2] << 8) + bytes[i + 3];
      if (len < 2) return null;
      i += 2 + len;
    }
  }
  return null;
}
