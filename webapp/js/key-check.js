import { post } from "./pipeline/run.js?v=20261113-flags-2";
import { openaiText, geminiText } from "./pipeline/steps.js?v=20261113-flags-2";
import { h } from "./render.js";

// Generated blank PNG. Credential checks never contain a book page.
const BLANK = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGP8//8/AymAiSTVDKMaiANMRKqDg1ENxACSQwkAVW0DHeN02ZEAAAAASUVORK5CYII=";

export class CredentialChecks {
  // cache (optional): { load() -> [record], save([record]) } keeps successful checks across reloads, so a key that checked
  // out is not checked again each time the page loads. A record names the provider, model and settings but holds only a
  // digest of the key; it applies only while the key is the same. `ready` resolves once the saved checks are loaded.
  constructor(keys, request = post, cache = null) {
    this.keys = keys; this.request = request; this.results = new Map(); this.cache = cache;
    this.ready = cache ? this.hydrate().catch(() => {}) : Promise.resolve();
  }
  extras(provider) { return provider === "vision" ? [this.keys.vision_auth || null, this.keys.vision_project || null] : null; }
  async keyDigest(provider, key) {
    const bytes = new TextEncoder().encode(`${provider}\n${key}`);
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async hydrate() {
    for (const record of await this.cache.load()) {
      const key = this.keys[record.provider];
      if (!key || record.keyDigest !== await this.keyDigest(record.provider, key)) continue;
      if (JSON.stringify(record.extras ?? null) !== JSON.stringify(this.extras(record.provider))) continue;
      const identity = JSON.stringify([record.provider, record.model, key, this.extras(record.provider)]);
      if (!this.results.has(identity)) this.results.set(identity, { valid: true, cached: true,
        message: `Key checked successfully for this model (checked ${new Date(record.at).toLocaleDateString()}).` });
    }
  }
  async remember(profile, valid) {
    if (!this.cache) return;
    const provider = profile.provider, key = this.keys[provider];
    if (!key) return;
    const keyDigest = await this.keyDigest(provider, key), extras = this.extras(provider);
    const same = record => record.provider === provider && record.model === profile.model && record.keyDigest === keyDigest
      && JSON.stringify(record.extras ?? null) === JSON.stringify(extras);
    const records = (await this.cache.load()).filter(record => !same(record));
    if (valid) records.push({ provider, model: profile.model, keyDigest, extras, at: Date.now() });
    await this.cache.save(records);
  }
  identity(profile) {
    return JSON.stringify([profile.provider, profile.model, this.keys[profile.provider],
      profile.provider === "vision" ? [this.keys.vision_auth, this.keys.vision_project] : null]);
  }
  status(profile) { return profile.provider === "local" ? { valid: true } : this.results.get(this.identity(profile)); }
  group(profiles) {
    const group = {
      keys: this.keys,
      status: () => {
        const failed = profiles.find(profile => this.status(profile)?.valid === false);
        if (failed) return { valid: false, message: `${failed.label} · ${this.status(failed).message}` };
        return profiles.every(profile => this.status(profile)?.valid)
          ? { valid: true, message: "Credential checked successfully for the selected models." } : undefined;
      },
      check: async () => {
        const seen = new Set();
        for (const profile of profiles) {
          const id = this.identity(profile);
          if (seen.has(id)) continue;
          seen.add(id);
          const result = await this.check(profile);
          if (!result.valid) break;
        }
        return group.status();
      },
    };
    return group;
  }
  async check(profile) {
    if (profile.provider === "local") return { valid: true };
    const id = this.identity(profile), keys = { ...this.keys }, provider = profile.provider;
    this.results.delete(id);
    let result;
    try {
      const payload = provider === "openai" ? { model: profile.model, store: false, reasoning: { effort: profile.reasoning || "none" },
        max_output_tokens: profile.reasoning === "low" ? 256 : 64, input: "Reply OK." }
        : provider === "gemini" ? { model: profile.model, store: false, service_tier: "standard",
          input: [{ type: "text", text: "Reply OK." }], generation_config: {
            thinking_level: profile.thinking === "minimal" ? "minimal" : "low", thinking_summaries: "none", max_output_tokens: 64 } }
          : { requests: [{ image: { content: BLANK }, features: [{ type: profile.model, maxResults: 1 }] }] };
      const { body } = await this.request(provider, payload, keys[provider], { mode: keys.vision_auth, project: keys.vision_project });
      if (provider === "vision") {
        if (!body.responses?.length) throw new Error("Cloud Vision returned no test result.");
        if (body.responses[0].error) throw new Error(body.responses[0].error.message || "Cloud Vision rejected the test.");
      } else if (!(provider === "openai" ? openaiText(body) : geminiText(body))) throw new Error("The test returned no text. Check the key again.");
      result = { valid: true, message: "Key checked successfully for this model." };
    } catch (error) {
      let message = error.message;
      for (const key of [keys.openai, keys.gemini, keys.vision].filter(Boolean)) message = message.replaceAll(key, "[redacted]");
      result = { valid: false, message };
    }
    this.results.set(id, result);
    this.remember(profile, result.valid).catch(() => {});
    return result;
  }
}

export function stageKeyControls(checks, profile, save, changed = () => {}, label = "API credential") {
  if (profile.provider === "local") return h("p", { class: "hint" }, "Runs on this device with zero API cost.");
  const keys = checks.keys, provider = profile.provider;
  const status = h("p", { class: "hint", role: "status" });
  // The summary says whether the credential has checked out, so the panel can stay closed.
  const state = h("span", { class: "key-state" });
  const refresh = () => {
    const result = checks.status(profile);
    state.className = `key-state ${result?.valid ? "ok" : result ? "bad" : "hint"}`;
    state.textContent = result?.valid ? "✓ checked" : result ? "✗ not accepted" : "not checked";
    status.className = result?.valid ? "ok" : result ? "bad" : "hint";
    status.textContent = result?.message || "Check this credential to enable processing.";
    changed();
  };
  const credential = h("input", { type: "password", value: keys[provider] || "", autocomplete: "off",
    "aria-label": `${provider === "vision" ? "Cloud Vision credential" : provider === "openai" ? "OpenAI API key" : "Gemini API key"}`,
    oninput: () => { keys[provider] = credential.value.trim(); refresh(); },
    onchange: async () => { if (!(provider === "vision" && keys.vision_auth === "oauth")) await save(provider, keys[provider]); } });
  const fields = h("div", { class: "fields" }, h("label", {}, provider === "vision" ? "Cloud Vision credential " : "API key ", credential));
  if (provider === "vision") {
    fields.append(h("label", {}, "Authentication ", h("select", { "aria-label": "Cloud Vision authentication", onchange: async event => {
      keys.vision_auth = event.target.value;
      keys.vision = credential.value = "";
      await save("vision", ""); await save("vision_auth", keys.vision_auth); refresh();
    } }, h("option", { value: "key", selected: keys.vision_auth !== "oauth" }, "API key"),
    h("option", { value: "oauth", selected: keys.vision_auth === "oauth" }, "OAuth token"))),
    h("label", {}, "Quota project ", h("input", { value: keys.vision_project || "", "aria-label": "Google Cloud quota project",
      oninput: event => { keys.vision_project = event.target.value.trim(); refresh(); },
      onchange: () => save("vision_project", keys.vision_project) })));
  }
  const button = h("button", { onclick: async () => {
    button.disabled = true;
    status.textContent = "Checking with a small test request…";
    const request = checks.check(profile);
    changed();
    await request;
    button.disabled = false;
    refresh();
    if (checks.status(profile)?.valid) panel.open = false;
  } }, "Check key");
  refresh();
  const panel = h("details", { class: "stage-keys", open: !checks.status(profile)?.valid }, h("summary", {}, `${label} `, state),
    fields, h("p", {}, button), status, h("p", { class: "hint" },
      "The check makes a small billable test request with no book content. OAuth tokens are held for this session. Keys are saved in this browser."));
  return panel;
}

const PROVIDER_NAMES = { openai: "OpenAI", gemini: "Gemini", vision: "Google Cloud Vision" };

// The Regions tab's one credentials box: a key field, its "Check key" and its state for each provider that any model in
// use needs (the selected region finder, and the unit-type survey's model once that box has been opened). `bind` gives
// it the book's CredentialChecks; `onChange` is told whenever a key or a check result changes.
export function credentialsBox(save) {
  let checks = null, finder = null, survey = [], shown = null;
  const listeners = new Set(), body = h("div");
  const element = h("section", { class: "box credentials-box", "aria-label": "API credentials" }, h("h2", {}, "API credentials"), body);
  const notify = () => { for (const listener of listeners) listener(); };
  const render = () => {
    if (!checks) { body.replaceChildren(h("p", { class: "hint" }, "Loading…")); return; }
    const profiles = providerGroups(finder, survey);
    const signature = JSON.stringify([...profiles].map(([provider, list]) => [provider, list.map(profile => profile.id)]));
    if (signature === shown) return;
    shown = signature;
    if (!profiles.size) { body.replaceChildren(h("p", { class: "hint" }, "No API key is needed for the selected finder.")); return; }
    body.replaceChildren(...[...profiles].map(([provider, list]) => stageKeyControls(checks.group(list), list[0], save, notify,
      `${PROVIDER_NAMES[provider] || provider} key · ${[...new Set(list.map(profile => profile.label))].join(", ")}`)));
  };
  render();
  return {
    element,
    get checks() { return checks; },
    bind(value) { checks = value; shown = null; render(); },
    setFinder(profile) { finder = profile || null; render(); },
    setSurvey(profiles) { survey = profiles || []; render(); },
    onChange(listener) { listeners.add(listener); },
  };
}

// The models that need a key, grouped by provider (a local model needs none).
export function providerGroups(finder, survey) {
  const groups = new Map();
  for (const profile of [finder, ...survey || []]) {
    if (!profile || profile.provider === "local") continue;
    if (!groups.has(profile.provider)) groups.set(profile.provider, []);
    if (!groups.get(profile.provider).some(other => other.id === profile.id)) groups.get(profile.provider).push(profile);
  }
  return groups;
}
