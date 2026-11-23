/** Minimal streaming tar reader (ustar + pax path headers), enough for GitHub's tarballs. */
/** `keep`: files whose text is returned. `pathOnly`: files returned with "" (their bytes are skipped, never decoded). */
export async function untar(stream: ReadableStream<Uint8Array>, keep: (path: string) => boolean, pathOnly?: (path: string) => boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const reader = stream.getReader();
  let buf = new Uint8Array(0);
  let done = false;
  const need = async (n: number) => {
    while (buf.length < n && !done) {
      const r = await reader.read();
      if (r.done) done = true;
      else {
        const nb = new Uint8Array(buf.length + r.value.length);
        nb.set(buf);
        nb.set(r.value, buf.length);
        buf = nb;
      }
    }
    return buf.length >= n;
  };
  const take = (n: number) => {
    const v = buf.subarray(0, n);
    buf = buf.subarray(n);
    return v;
  };
  const dec = new TextDecoder();
  const str = (b: Uint8Array) => {
    const z = b.indexOf(0);
    return dec.decode(z >= 0 ? b.subarray(0, z) : b);
  };
  let paxPath: string | null = null;
  for (;;) {
    if (!(await need(512))) break;
    const h = take(512);
    if (h.every((x) => x === 0)) break;
    const name = str(h.subarray(0, 100));
    const size = parseInt(str(h.subarray(124, 136)).trim() || "0", 8);
    const type = String.fromCharCode(h[156]!);
    const prefix = str(h.subarray(345, 500));
    const padded = Math.ceil(size / 512) * 512;
    await need(padded);
    const body = take(padded).slice(0, size);
    if (type === "x") {
      const m = /\d+ path=([^\n]*)\n/.exec(dec.decode(body));
      paxPath = m ? m[1]! : null;
      continue;
    }
    if (type === "g") continue;
    const full = paxPath ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = null;
    if (type !== "0" && type !== "\0") continue;
    const rel = full.slice(full.indexOf("/") + 1); // strip "<repo>-<sha>/"
    if (keep(rel)) out[rel] = dec.decode(body);
    else if (pathOnly?.(rel)) out[rel] = "";
  }
  reader.cancel().catch(() => undefined);
  return out;
}
