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
    names: () => [...entries.keys()],
  };
}

// A work ZIP of JSON records, each deflated: `entries` are [{ name, value }] (value: any JSON value). Read back with
// openWorkZip.
export async function makeWorkZip(entries) {
  const encoder = new TextEncoder(), locals = [], central = [];
  let offset = 0;
  for (const { name, value } of entries) {
    const path = encoder.encode(name), raw = encoder.encode(JSON.stringify(value));
    const packed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    const crc = crc32(raw), header = new DataView(new ArrayBuffer(30)), entry = new DataView(new ArrayBuffer(46));
    // Version 2.0, UTF-8 names, deflated, dated 1980-01-01.
    for (const [view, at] of [[header, 4], [entry, 6]]) {
      view.setUint16(at, 20, true); view.setUint16(at + 2, 0x0800, true); view.setUint16(at + 4, 8, true);
      view.setUint16(at + 8, 33, true); view.setUint32(at + 10, crc, true); view.setUint32(at + 14, packed.length, true);
      view.setUint32(at + 18, raw.length, true); view.setUint16(at + 22, path.length, true);
    }
    header.setUint32(0, 0x04034b50, true);
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint32(42, offset, true);
    locals.push(header, path, packed);
    central.push(entry, path);
    offset += 30 + path.length + packed.length;
  }
  const size = central.reduce((n, part) => n + part.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...locals, ...central, end], { type: "application/zip" });
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
