// A migrated work sidecar is kept as a ZIP in work/. Read individual records on demand.
const decoder = new TextDecoder();
const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
async function bytes(file, from, to) { return new Uint8Array(await file.slice(from, to).arrayBuffer()); }

export async function openWorkZip(file) {
  const tailAt = Math.max(0, file.size - 65_557);
  const tail = view(await bytes(file, tailAt, file.size));
  let end = tail.byteLength - 22;
  while (end >= 0 && (tail.getUint32(end, true) !== 0x06054b50 || end + 22 + tail.getUint16(end + 20, true) !== tail.byteLength)) end--;
  if (end < 0 || tail.getUint16(end + 4, true) || tail.getUint16(end + 6, true)) throw new Error("Choose a complete Chaya work ZIP.");
  const count = tail.getUint16(end + 10, true), length = tail.getUint32(end + 12, true), start = tail.getUint32(end + 16, true);
  if (start + length > tailAt + end) throw new Error("Invalid work ZIP directory.");
  const list = await bytes(file, start, start + length), dir = view(list), entries = new Map();
  let at = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > length || dir.getUint32(at, true) !== 0x02014b50) throw new Error("Invalid work ZIP entry.");
    const nameLength = dir.getUint16(at + 28, true), extra = dir.getUint16(at + 30, true), comment = dir.getUint16(at + 32, true);
    const next = at + 46 + nameLength + extra + comment;
    if (next > length) throw new Error("Truncated work ZIP directory.");
    const name = decoder.decode(list.subarray(at + 46, at + 46 + nameLength));
    if (["book.json", "types.json"].includes(name) || /^work\/(?:[\w.-]+\/)*[\w.-]+\.json$/u.test(name)) {
      entries.set(name, { flags: dir.getUint16(at + 8, true), method: dir.getUint16(at + 10, true),
        packed: dir.getUint32(at + 20, true), size: dir.getUint32(at + 24, true), offset: dir.getUint32(at + 42, true) });
    }
    at = next;
  }
  return {
    async json(path) {
      const entry = entries.get(path);
      if (!entry) return null;
      const { flags, method, packed, size, offset } = entry;
      if (flags & 1 || ![0, 8].includes(method) || offset + 30 > start) throw new Error("Unsupported work ZIP entry.");
      const header = view(await bytes(file, offset, offset + 30));
      if (header.getUint32(0, true) !== 0x04034b50) throw new Error("Invalid work ZIP record.");
      const data = offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
      if (data + packed > start) throw new Error("Truncated work ZIP record.");
      const blob = file.slice(data, data + packed);
      const raw = method === 0 ? await blob.arrayBuffer() : await new Response(blob.stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
      if (raw.byteLength !== size) throw new Error("Incorrect work ZIP record size.");
      return JSON.parse(decoder.decode(raw));
    },
  };
}
