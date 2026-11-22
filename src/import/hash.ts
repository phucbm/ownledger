/** cyrb53, a fast non-crypto 53-bit hash. Two seeds give a 26-hex-digit key; plenty for import keys. */
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

export function stableKey(parts: (string | number | null | undefined)[]): string {
  const s = parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("\u001f");
  return cyrb53(s, 1).toString(16).padStart(14, "0") + cyrb53(s, 2).toString(16).padStart(14, "0").slice(0, 12);
}
