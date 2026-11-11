import { post } from "./pipeline/run.js?v=20261111-type-overview-2";
import { openaiText, geminiText } from "./pipeline/steps.js?v=20261110-reading-2";
import { h } from "./render.js";

// Generated blank PNG. Credential checks never contain a book page.
const BLANK = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGP8//8/AymAiSTVDKMaiANMRKqDg1ENxACSQwkAVW0DHeN02ZEAAAAASUVORK5CYII=";

export class CredentialChecks {
  constructor(keys, request = post) { this.keys = keys; this.request = request; this.results = new Map(); }
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
    return result;
  }
}

export function stageKeyControls(checks, profile, save, changed = () => {}) {
  if (profile.provider === "local") return h("p", { class: "hint" }, "Runs on this device with zero API cost.");
  const keys = checks.keys, provider = profile.provider;
  const status = h("p", { class: "hint", role: "status" });
  const refresh = () => {
    const result = checks.status(profile);
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
  } }, "Check key");
  refresh();
  return h("details", { class: "stage-keys", open: !checks.status(profile)?.valid }, h("summary", {}, "API credential"),
    fields, h("p", {}, button), status, h("p", { class: "hint" },
      "The check makes a small billable test request with no book content. OAuth tokens are held for this session. Keys are saved in this browser."));
}
