// Keeping a copy of a book on disk: the scheduling and permission logic, with the file, the clock and the timers
// simulated; and a book whose files in the browser cannot all be read.
// Run from the repository root:  node --test webapp/test/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DiskCopy, copyState, spendingBlock, copyLabel, storageText, COPY_INTERVAL_MS, COPY_SETTLE_MS } from "../js/disk-copy.js";
import { Book, restoreChaya, idb } from "../js/store.js";
import { writeChaya } from "../js/chayapdf.js";

// A clock and timers that advance only when told to.
function clock(start = 1_000_000) {
  let now = start, next = 1;
  const pending = new Map();
  return {
    now: () => now,
    timers: { set: (fn, ms) => { const id = next++; pending.set(id, { at: now + ms, fn }); return id; }, clear: id => pending.delete(id) },
    pending,
    async advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...pending].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await settle();
      }
      now = until;
      await settle();
    },
  };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture({ record = {}, permission = "granted", request = "granted", problems = [], fail = null, during = () => {} } = {}) {
  const time = clock(), writes = [], stored = [], states = [];
  const handle = { name: "book.chaya.pdf" };
  let version = 0;
  const copy = new DiskCopy({
    record, now: time.now, timers: time.timers,
    store: value => { stored.push(value); },
    bytes: async () => { during(); return new Uint8Array(++version); },
    write: async (target, bytes) => {
      if (fail) { const error = fail; fail = null; throw error; }
      writes.push({ target, length: bytes.length, at: time.now() });
    },
    permission: async () => permission,
    request: async () => { permission = request; return request; },
    check: async () => problems,
    onState: state => states.push(state),
  });
  return { copy, time, writes, stored, states, handle,
    setPermission: value => { permission = value; }, failNext: error => { fail = error; }, setProblems: value => { problems = value; } };
}

test("a chosen file is written at once and timed writes come at most every five minutes", async () => {
  const { copy, time, writes, handle } = fixture();
  assert.equal(await copy.choose(handle), true);
  assert.equal(writes.length, 1);
  assert.equal(copy.state.kind, "current");
  copy.noteChange();
  assert.equal(copy.state.kind, "stale");
  await time.advance(COPY_SETTLE_MS);
  assert.equal(writes.length, 1, "a change within five minutes of the last write waits");
  for (let minute = 1; minute < 5; minute++) { await time.advance(60_000); copy.noteChange(); }
  assert.equal(writes.length, 1);
  await time.advance(60_000);
  assert.equal(writes.length, 2, "the changes are written five minutes after the previous write");
  assert.equal(writes[1].at - writes[0].at, COPY_INTERVAL_MS);
  assert.equal(copy.state.kind, "current");
  await time.advance(30 * 60_000);
  assert.equal(writes.length, 2, "nothing is written without changes");
  copy.noteChange();
  await time.advance(COPY_SETTLE_MS - 1);
  assert.equal(writes.length, 2);
  await time.advance(1);
  assert.equal(writes.length, 3, "after a quiet spell the first change waits only for the burst it starts");
  assert.equal(time.pending.size, 0);
});

test("a checkpoint writes at once when the copy lacks changes, and only then", async () => {
  const { copy, time, writes, handle } = fixture();
  assert.equal(await copy.checkpoint(), false, "no file chosen: nothing to write");
  await copy.choose(handle);
  assert.equal(await copy.checkpoint(), true);
  assert.equal(writes.length, 1, "a current copy is not written again");
  copy.noteChange();
  assert.equal(time.pending.size, 1);
  assert.equal(await copy.checkpoint(), true);
  assert.equal(writes.length, 2);
  assert.equal(time.pending.size, 0, "the timed write is no longer needed");
});

test("a change made while the copy is being written leaves it stale and is written next", async () => {
  let edit = false;
  const { copy, time, writes, handle } = fixture({ during: () => { if (edit) { edit = false; copy.noteChange(); } } });
  await copy.choose(handle);
  copy.noteChange();
  const before = copy.checkpoint();
  copy.noteChange();
  await before;
  assert.equal(copy.state.kind, "current", "a change noted before the book is read for writing is in the file");
  copy.noteChange();
  edit = true;
  assert.equal(await copy.checkpoint(), true);
  assert.equal(copy.state.kind, "stale", "the change may not be in the file just written");
  assert.ok(copy.record.changed_at > copy.record.written_at);
  await time.advance(COPY_INTERVAL_MS);
  assert.equal(writes.length, 4);
  assert.equal(copy.state.kind, "current");
});

test("when the browser drops its permission the copy waits for a visible request, then writes", async () => {
  const { copy, time, writes, handle, setPermission } = fixture({ request: "granted" });
  await copy.choose(handle);
  setPermission("prompt");
  copy.noteChange();
  await time.advance(COPY_INTERVAL_MS);
  assert.equal(writes.length, 1, "nothing is written without permission");
  assert.equal(copy.state.kind, "permission");
  assert.equal(spendingBlock(copy.state), "permission");
  assert.equal(copyLabel(copy.state).action, "allow");
  assert.equal(copyLabel(copy.state).warn, true);
  assert.equal(time.pending.size, 0, "no timer retries while the browser waits for the user");
  assert.equal(await copy.allow(), true);
  assert.equal(writes.length, 2);
  assert.equal(copy.state.kind, "current");
  assert.equal(spendingBlock(copy.state), null);
});

test("a reopened book with a remembered file asks again before writing", async () => {
  const { copy, writes, handle } = fixture({ permission: "prompt", request: "denied" });
  copy.record = { handle, name: handle.name, written_at: 5, changed_at: 9 };
  await copy.start();
  assert.equal(copy.state.kind, "permission");
  assert.equal(await copy.allow(), false);
  assert.equal(copy.state.kind, "permission", "a refusal is shown, not hidden");
  assert.equal(writes.length, 0);
});

test("a failed write is reported, kept as an error until a later write succeeds, and retried at most every five minutes", async () => {
  const { copy, time, writes, handle, failNext } = fixture();
  await copy.choose(handle);
  failNext(Object.assign(new Error("The disk is full."), { name: "QuotaExceededError" }));
  copy.noteChange();
  assert.equal(await copy.checkpoint(), false);
  assert.equal(copy.state.kind, "error");
  assert.match(copy.state.error, /QuotaExceededError: The disk is full/);
  assert.equal(copyLabel(copy.state).action, "retry");
  assert.equal(spendingBlock(copy.state), "error");
  await time.advance(COPY_INTERVAL_MS - 1);
  assert.equal(writes.length, 1);
  await time.advance(1);
  assert.equal(writes.length, 2);
  assert.equal(copy.state.kind, "current");
  assert.equal(copy.state.error, null);
});

test("a book whose files cannot all be read never replaces the copy on disk", async () => {
  const { copy, writes, handle, setProblems } = fixture();
  await copy.choose(handle);
  setProblems(["source.pdf: NotFoundError: A requested file or directory could not be found"]);
  copy.noteChange();
  assert.equal(await copy.checkpoint(), false);
  assert.equal(writes.length, 1);
  assert.equal(copy.state.kind, "error");
  assert.match(copy.state.error, /source\.pdf: NotFoundError/);
  assert.match(copy.state.error, /kept as it was/);
});

test("the record is kept when the book first changes after a save, and with every write", async () => {
  const { copy, stored, handle } = fixture();
  copy.noteChange();
  assert.equal(stored.length, 1, "the first change is remembered across reloads");
  copy.noteChange();
  assert.equal(stored.length, 1, "later changes before a save need not be");
  await copy.choose(handle);
  assert.equal(stored.at(-1).written_at > 0, true);
  assert.equal(stored.at(-1).handle, handle);
  await copy.forget();
  assert.equal(stored.at(-1).handle, undefined);
  assert.equal(copy.state.kind, "none");
});

test("spending waits for a copy outside the browser that has the latest change", () => {
  assert.equal(spendingBlock(copyState({})), "no-copy", "a new book was never saved");
  assert.equal(spendingBlock(copyState({ changed_at: 5, exported_at: 9 })), null, "a download after the last change");
  assert.equal(spendingBlock(copyState({ changed_at: 10, exported_at: 9 })), "no-copy", "a change after the last download");
  const handle = { name: "b.chaya.pdf" };
  assert.equal(spendingBlock(copyState({ handle, written_at: 9, changed_at: 10 })), null, "a working disk copy is written after the run");
  assert.equal(spendingBlock(copyState({ handle, written_at: 9, changed_at: 10 }, { permission: "prompt" })), "permission");
  assert.equal(spendingBlock(copyState({ handle, written_at: 9, changed_at: 10, exported_at: 11 }, { permission: "prompt" })), null,
    "a download after the last change is enough even without the disk copy");
  assert.equal(spendingBlock(copyState({ handle, written_at: 9, changed_at: 10 }, { error: "failed" })), "error");
});

test("the header names the copy's state, and warns only once the book holds work", () => {
  const time = t => `t${t}`;
  assert.equal(copyLabel(copyState({}), { time }), null, "a new book with nothing in it");
  assert.deepEqual(copyLabel(copyState({}), { hasWork: true, time }), { text: "No copy on disk", warn: true, action: "choose" });
  assert.deepEqual(copyLabel(copyState({}), { hasWork: true, canPick: false, time }), { text: "No copy on disk", warn: true, action: "download" });
  assert.deepEqual(copyLabel(copyState({ changed_at: 3, exported_at: 4 }), { canPick: false, time }),
    { text: "No copy on disk · saved as a file t4", warn: false, action: "download" });
  assert.deepEqual(copyLabel(copyState({ changed_at: 5, exported_at: 4 }), { canPick: false, time }),
    { text: "No copy on disk · saved as a file t4, changed since", warn: true, action: "download" });
  const handle = { name: "b.chaya.pdf" };
  assert.equal(copyLabel(copyState({ handle, written_at: 7, changed_at: 6 }), { time }).text, "Copy on disk · written t7");
  assert.equal(copyLabel(copyState({ handle, written_at: 7, changed_at: 8 }), { time }).text, "Copy on disk · written t7 · newer changes");
  assert.equal(copyLabel(copyState({ handle }), { time }).text, "Copy on disk · not written yet");
  assert.equal(copyLabel(copyState({ handle, written_at: 7 }, { writing: true }), { time }).text, "Copy on disk · writing…");
});

test("the storage report says whether the browser keeps the books and how much they use", () => {
  assert.match(storageText({ persisted: true, usage: 2.5e9, quota: 60e9 }), /^Persistent storage.*2\.5 GB used of 60\.0 GB/);
  assert.match(storageText({ persisted: false, usage: 3.2e6 }), /^Storage is not persistent.*3\.2 MB used\.$/);
  assert.match(storageText({}), /does not say/);
});

// ---------------------------------------------------------------- a book whose files cannot all be read

// An in-memory directory with the File System Access API's shape: paths to strings or bytes.
function folder(files, prefix = "", name = "book") {
  const children = () => {
    const names = new Map();
    for (const path of files.keys()) if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length), cut = rest.indexOf("/");
      names.set(cut < 0 ? rest : rest.slice(0, cut), cut < 0 ? "file" : "directory");
    }
    return names;
  };
  const file = path => ({ kind: "file", name: path.split("/").at(-1),
    async getFile() {
      if (!files.has(path)) throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
      const value = files.get(path);
      return { size: typeof value === "string" ? value.length : value.byteLength, text: async () => typeof value === "string" ? value : new TextDecoder().decode(value),
        arrayBuffer: async () => (typeof value === "string" ? new TextEncoder().encode(value) : value).buffer };
    },
    async createWritable() {
      let data = null;
      return { async write(value) { data = value instanceof Blob ? new Uint8Array(await value.arrayBuffer()) : value; }, async close() { files.set(path, data); } };
    } });
  return {
    kind: "directory", name,
    async getDirectoryHandle(n, { create = false } = {}) {
      if (!create && children().get(n) !== "directory") throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
      return folder(files, `${prefix}${n}/`, n);
    },
    async getFileHandle(n, { create = false } = {}) {
      if (!create && !files.has(prefix + n)) throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
      return file(prefix + n);
    },
    async removeEntry(n) {
      let found = files.delete(prefix + n);
      for (const path of [...files.keys()]) if (path.startsWith(`${prefix}${n}/`)) { files.delete(path); found = true; }
      if (!found) throw new DOMException("A requested file or directory could not be found.", "NotFoundError");
    },
    async *entries() {
      for (const [n, kind] of children()) yield [n, kind === "file" ? file(prefix + n) : folder(files, `${prefix}${n}/`, n)];
    },
  };
}

function tinyPdf() {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] >>"];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((value, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${value}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f\r\n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n\r\n`).join("");
  return new TextEncoder().encode(out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

function damagedBook() {
  const pages = ["b-page-001", "b-page-002", "b-page-003"].map((id, i) => ({ id, document: `pages/${id}.json`, label: null, valid: i < 2 ? true : null, pdf_page: 1 }));
  const manifest = { format: "book-folder", version: 1, book_id: "b", title: "B", types: "types.json", pdf: { path: "source.pdf", name: "b.pdf" }, pages };
  const doc = id => JSON.stringify({ page: { id, regions: [] }, units: [] });
  const files = new Map([["book.json", JSON.stringify(manifest)], ["types.json", JSON.stringify({ types: {} })], ["source.pdf", tinyPdf()],
    ["pages/b-page-001.json", doc("b-page-001")], ["pages/b-page-002.json", doc("b-page-002")]]);
  return { files, manifest, handle: folder(files, "", "b") };
}

test("opening names the files a processed book has lost instead of showing its pages as unprocessed", async () => {
  const original = { ...idb };
  idb.put = async () => {};
  try {
    const { files, handle } = damagedBook();
    let book = await Book.openFolder(handle, { browser: true });
    assert.deepEqual(await book.unreadableFiles(), [], "an unprocessed page needs no document");
    files.delete("source.pdf");
    files.set("pages/b-page-002.json", "{ not json");
    book = await Book.openFolder(handle, { browser: true });
    const lost = await book.unreadableFiles();
    assert.deepEqual(lost.map(item => item.path), ["source.pdf", "pages/b-page-002.json"]);
    assert.match(lost[0].error, /^NotFoundError/);
    assert.match(lost[1].error, /^SyntaxError/);
    files.set("pages/b-page-002.json", JSON.stringify({ page: { id: "b-page-001" }, units: [] }));
    assert.match((await (await Book.openFolder(handle, { browser: true })).unreadableFiles()).at(-1).error, /holds page b-page-001/);
    files.delete("types.json");
    await assert.rejects(Book.openFolder(handle, { browser: true }), error => error.path === "types.json" && /types\.json could not be read \(NotFoundError/.test(error.message));
  } finally { Object.assign(idb, original); }
});

test("a .chaya.pdf of the same book restores a damaged folder; another book's file is refused", async () => {
  const original = { ...idb };
  idb.put = async () => {};
  try {
    const { files, manifest, handle } = damagedBook();
    const saved = { format: "chaya-book", version: 1, saved_by: "test", files: { "book.json": manifest, "types.json": { types: {} },
      "pages/b-page-001.json": JSON.parse(files.get("pages/b-page-001.json")), "pages/b-page-002.json": JSON.parse(files.get("pages/b-page-002.json")) } };
    const bytes = await writeChaya(tinyPdf(), saved);
    files.delete("source.pdf"); files.delete("pages/b-page-002.json");
    const other = await writeChaya(tinyPdf(), { ...saved, files: { ...saved.files, "book.json": { ...manifest, book_id: "c" } } });
    await assert.rejects(restoreChaya(other, handle, "b"), /holds the book “c”, not “b”/);
    assert.equal(files.has("pages/b-page-001.json"), true, "a refused file changes nothing");
    const book = await restoreChaya(bytes, handle, "b");
    assert.deepEqual(await book.unreadableFiles(), []);
    assert.deepEqual(new Uint8Array(files.get("source.pdf")), tinyPdf(), "the original PDF is back");
  } finally { Object.assign(idb, original); }
});

test("every change to a book's data is reported, and page-image caching is not", async () => {
  const original = { ...idb };
  idb.put = async () => {};
  try {
    const { handle } = damagedBook();
    const book = await Book.openFolder(handle, { browser: true });
    const changes = [];
    book.onChange = path => changes.push(path);
    await book.writeFile("images/b-page-001.png", "cache");
    await book.writeWork("work/reader-lab/ledger.json", { calls: [] });
    await book.removeFile("pages/b-page-002.json");
    await book.removeFile("pages/missing.json");
    assert.deepEqual(changes, ["work/reader-lab/ledger.json", "pages/b-page-002.json"]);
  } finally { Object.assign(idb, original); }
});
