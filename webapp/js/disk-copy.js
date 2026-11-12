// A copy of a book outside this browser (webapp/README.md, "Where a book lives"). A book kept in the browser's own
// storage is lost with that storage, so the app rewrites a .chaya.pdf that the user chose once: after each processing
// run, after pages are moved on, and at most every five minutes while there are changes. This module is the
// scheduling and permission logic only. Writing the file, asking for permission, checking the book's files, keeping
// the record and the clock are given to it, so that it runs under Node in the tests; main.js connects it to the book,
// the header and the dialogs.

export const COPY_INTERVAL_MS = 5 * 60 * 1000;  // timed writes at most this often
export const COPY_SETTLE_MS = 20 * 1000;        // the first change after a quiet spell waits this long for the next ones

// The record, kept per book in IndexedDB: {handle, name, written_at, bytes, exported_at, exported_as, changed_at}.
// written_at is when the disk copy's content was taken (a change after it is not in the file); exported_at is when the
// book was last saved as a file some other way (a download, "Save as", or the .chaya.pdf it was opened from);
// changed_at is the latest change to the book's data that was noted.
export function copyState(record = {}, { permission = null, writing = false, error = null } = {}) {
  const changed = record.changed_at || 0, disk = !!record.handle;
  const current = disk && !!record.written_at && changed <= record.written_at;
  const outside = Math.max(disk ? record.written_at || 0 : 0, record.exported_at || 0);
  const needsPermission = disk && !!permission && permission !== "granted";
  return {
    kind: !disk ? "none" : needsPermission ? "permission" : error ? "error" : writing ? "writing" : current ? "current" : "stale",
    disk, name: record.name || null, permission: disk ? permission : null, error: disk ? error : null,
    writtenAt: disk ? record.written_at || null : null, exportedAt: record.exported_at || null, changedAt: record.changed_at || null,
    stale: disk && !current,                     // the disk copy lacks changes, or was never written
    unsaved: !outside || changed > outside,      // no file outside the browser has the latest change
  };
}

// Why a run that spends money should wait, or null: "no-copy" (neither a disk copy nor a file saved since the last
// change), "permission" (the browser dropped its permission to write the disk copy) or "error" (the last write failed).
// A working disk copy is rewritten when the run finishes or stops, so it never blocks.
export function spendingBlock(state) {
  if (!state.unsaved) return null;
  if (state.kind === "none") return "no-copy";
  return state.kind === "permission" || state.kind === "error" ? state.kind : null;
}

// What the book's header says about its copies, or null while a new book holds nothing worth keeping. action is what
// its button does: "choose" a file for the disk copy, "download" the .chaya.pdf (where the browser cannot keep a file),
// "allow" writing again, or "retry" a failed write.
export function copyLabel(state, { hasWork = false, canPick = true, time = t => new Date(t).toLocaleString() } = {}) {
  const name = state.name || "the file";
  switch (state.kind) {
    case "current": return { text: `Copy on disk · written ${time(state.writtenAt)}`, warn: false, action: null };
    case "writing": return { text: "Copy on disk · writing…", warn: false, action: null };
    case "stale": return state.writtenAt
      ? { text: `Copy on disk · written ${time(state.writtenAt)} · newer changes`, warn: false, action: null }
      : { text: "Copy on disk · not written yet", warn: false, action: null };
    case "permission": return { text: `The browser needs permission again to write the copy on disk (${name})`, warn: true, action: "allow" };
    case "error": return { text: `The copy on disk was not written: ${state.error}`, warn: true, action: "retry" };
    default: {
      if (!hasWork && !state.changedAt && !state.exportedAt) return null;
      const saved = state.exportedAt ? ` · saved as a file ${time(state.exportedAt)}${state.unsaved ? ", changed since" : ""}` : "";
      return { text: `No copy on disk${saved}`, warn: state.unsaved, action: canPick ? "choose" : "download" };
    }
  }
}

// The browser's answer about keeping this site's storage, with how much it uses: for the library and Export.
export function storageText({ persisted = null, usage = null, quota = null } = {}) {
  const size = bytes => bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} kB`;
  const kept = persisted === true ? "Persistent storage: the browser keeps this site's books until you clear its data."
    : persisted === false ? "Storage is not persistent: the browser may clear this site's books when the disk runs low, or when told to forget the site."
      : "The browser does not say whether it keeps this site's storage.";
  const used = Number.isFinite(usage) ? ` ${size(usage)} used${Number.isFinite(quota) ? ` of ${size(quota)} the browser allows` : ""}.` : "";
  return kept + used;
}

const describe = error => error?.name && error.name !== "Error" ? `${error.name}: ${error.message}` : error?.message || String(error);

export class DiskCopy {
  // store(record) keeps the record; bytes() makes the .chaya.pdf; write(handle, bytes) writes it; permission(handle)
  // and request(handle) query and ask for permission to write ("granted", "prompt" or "denied"); check() lists the
  // book's files that cannot be read, so that a damaged book never replaces a good copy; onState(state) is told of
  // every change of state.
  constructor({ record = {}, store = async () => {}, bytes, write, permission = async () => "granted", request = async () => "granted",
                check = async () => [], onState = () => {}, now = () => Date.now(),
                timers = { set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id) } } = {}) {
    Object.assign(this, { record: { ...record }, keep: store, bytes, writeFile: write, query: permission, ask: request, check, onState, now, timers });
    this.permission = null;
    this.error = null;
    this.timer = null;
    this.job = null;
    this.again = false;
    this.lastWrite = null;     // when the last write started, for the five-minute rule
    this.takenAt = null;       // while writing: when its content was taken
  }

  get state() { return copyState(this.record, { permission: this.permission, writing: !!this.job, error: this.error }); }

  emit() { this.onState(this.state); }

  save() { return Promise.resolve(this.keep({ ...this.record })).catch(error => console.warn("the disk copy's record", error)); }

  // Find out whether the browser still lets the app write the file (after a reload it usually asks again).
  async start() {
    if (this.record.handle) this.permission = await Promise.resolve(this.query(this.record.handle)).catch(() => "prompt");
    this.emit();
    this.schedule();
  }

  // A change to the book's data (a page, a type list, a work record).
  noteChange() {
    const before = this.state;
    // Later than every save it could not be in, even within the same millisecond.
    const saves = [this.record.changed_at || 0, (this.record.written_at || 0) + 1, (this.record.exported_at || 0) + 1, this.takenAt === null ? 0 : this.takenAt + 1];
    this.record.changed_at = Math.max(this.now(), ...saves);
    if (!before.unsaved || !before.stale && before.disk || !before.changedAt) this.save();
    if (before.kind !== this.state.kind || before.unsaved !== this.state.unsaved) this.emit();
    this.schedule();
  }

  // The book was saved as a file some other way: a download, "Save as", or the file it was opened from.
  noteExport(at = this.now(), name = null) {
    this.record.exported_at = at;
    if (name) this.record.exported_as = name;
    this.save();
    this.emit();
  }

  schedule() {
    const state = this.state;
    if (this.timer !== null || this.job || !state.stale || state.kind === "permission") return;
    const delay = Math.max(COPY_SETTLE_MS, (this.lastWrite ?? -Infinity) + COPY_INTERVAL_MS - this.now());
    this.timer = this.timers.set(() => { this.timer = null; this.write(); }, delay);
  }

  cancel() {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  // Write now if the disk copy lacks changes: after a processing run, after pages are moved on.
  checkpoint() {
    if (!this.state.stale) return Promise.resolve(this.state.kind === "current");
    this.cancel();
    return this.write();
  }

  // Write the file. Resolves true when it was written, false when it could not be (the state says why).
  write() {
    if (this.job) { this.again = true; return this.job; }
    this.cancel();
    this.job = this.run().finally(() => {
      this.job = null;
      const again = this.again;
      this.again = false;
      this.emit();
      if (again && this.state.stale && this.permission === "granted") this.write(); else this.schedule();
    });
    this.emit();
    return this.job;
  }

  async run() {
    const handle = this.record.handle;
    if (!handle) return false;
    this.lastWrite = this.now();
    this.permission = await Promise.resolve(this.query(handle)).catch(() => "prompt");
    if (this.permission !== "granted") return false;
    let problems;
    try { problems = await this.check(); } catch (error) { problems = [describe(error)]; }
    if (problems.length) {
      this.error = `this book's files in the browser could not all be read, so the copy on disk was kept as it was (${problems.join("; ")})`;
      return false;
    }
    // Every change noted so far is in what is about to be read (the clock may not have moved since).
    const taken = this.takenAt = Math.max(this.now(), this.record.changed_at || 0);
    try {
      const data = await this.bytes();
      await this.writeFile(handle, data);
      Object.assign(this.record, { written_at: taken, bytes: data.length ?? data.size ?? null });
      if ((this.record.changed_at || 0) > taken) this.record.changed_at = Math.max(this.record.changed_at, taken + 1);
      this.error = null;
      await this.save();
      return true;
    } catch (error) {
      if (["NotAllowedError", "SecurityError"].includes(error?.name)) {
        this.permission = await Promise.resolve(this.query(handle)).catch(() => "prompt");
        if (this.permission === "granted") this.error = describe(error);
      } else this.error = describe(error);
      return false;
    } finally { this.takenAt = null; }
  }

  // The file the user chose for the copy: written at once.
  async choose(handle) {
    this.cancel();
    this.record = { ...this.record, handle, name: handle.name, written_at: null, bytes: null };
    this.permission = "granted";
    this.error = null;
    await this.save();
    return this.write();
  }

  // Ask again for permission to write (from a click: browsers ask only after one), then write if it was given.
  async allow() {
    if (!this.record.handle) return false;
    this.permission = await Promise.resolve(this.ask(this.record.handle)).catch(() => "denied");
    this.emit();
    if (this.permission !== "granted") return false;
    return this.state.stale || this.error ? this.write() : true;
  }

  // Stop keeping a copy on disk (the file itself is left as it is).
  async forget() {
    this.cancel();
    const { handle, name, written_at, bytes, ...rest } = this.record;
    this.record = rest;
    this.permission = null;
    this.error = null;
    await this.save();
    this.emit();
  }

  dispose() { this.cancel(); this.onState = () => {}; }
}
