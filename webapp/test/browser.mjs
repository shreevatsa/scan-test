// A small headless-Chrome driver for trying the app (no packages: the DevTools protocol over Node's WebSocket).
//   node webapp/test/browser.mjs SCRIPT.mjs
// SCRIPT.mjs exports default async function (page) { ... } using page.goto(url), page.eval(expr), page.wait(expr),
// page.shot(path), page.click(selector), page.type(text), page.key(key), page.sleep(ms) and page.log (console and
// exceptions). Chrome runs with a fresh profile in a temporary directory.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function launch() {
  const dir = mkdtempSync(join(tmpdir(), "chrome-"));
  const proc = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${dir}`,
    "--remote-debugging-port=0", "--window-size=1500,1000", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = "";
    proc.stderr.on("data", d => { buf += d; const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) res(m[1]); });
    setTimeout(() => rej(new Error("Chrome did not start")), 15000);
  });
  const port = new URL(wsUrl).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageWs = targets.find(t => t.type === "page").webSocketDebuggerUrl;
  const ws = new WebSocket(pageWs);
  await new Promise(r => ws.addEventListener("open", r));
  let id = 0;
  const pending = new Map(), log = [];
  ws.addEventListener("message", ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    if (msg.method === "Runtime.consoleAPICalled") log.push(`[${msg.params.type}] ` + msg.params.args.map(a => a.value ?? a.description ?? "").join(" "));
    if (msg.method === "Runtime.exceptionThrown") log.push(`[exception] ${msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text}`);
    if (msg.method === "Log.entryAdded") log.push(`[${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url || ""}`);
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 1000, deviceScaleFactor: 1, mobile: false });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const page = {
    log,
    sleep,
    send,
    async goto(url) { await send("Page.navigate", { url }); await sleep(300); },
    async eval(expr) {
      const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async wait(expr, timeout = 20000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) { try { if (await page.eval(expr)) return true; } catch {} await sleep(150); }
      throw new Error(`timed out waiting for ${expr}`);
    },
    async shot(path) { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(path, Buffer.from(r.data, "base64")); },
    async click(selector) {
      const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({block: "center"}); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!box) throw new Error(`no element ${selector}`);
      await page.clickAt(box[0], box[1]);
    },
    async clickAt(x, y) {
      for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      await sleep(100);
    },
    async drag(x1, y1, x2, y2) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
      for (let k = 1; k <= 8; k++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + (x2 - x1) * k / 8, y: y1 + (y2 - y1) * k / 8, button: "left" });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
      await sleep(150);
    },
    async type(text) { await send("Input.insertText", { text }); await sleep(50); },
    async key(key, modifiers = 0) {
      const codes = { Backspace: 8, Enter: 13, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Delete: 46, End: 35, Home: 36 };
      const k = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, windowsVirtualKeyCode: codes[key] || key.toUpperCase().charCodeAt(0), modifiers };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...k });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...k });
      await sleep(60);
    },
  };
  return { page, close: () => { try { ws.close(); } catch {} proc.kill(); setTimeout(() => rmSync(dir, { recursive: true, force: true }), 500); } };
}

const script = (await import(resolve(process.argv[2]))).default;
const { page, close } = await launch();
try { await script(page); }
catch (e) { console.error("FAILED:", e.message); process.exitCode = 1; }
finally {
  const errs = page.log.filter(l => /exception|\[error\]/.test(l));
  if (errs.length) console.log("browser errors:\n  " + errs.join("\n  "));
  close();
}
