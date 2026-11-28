import { CredentialChecks } from "./key-check.js?v=20261127-unordered-in-place";
import { settings } from "./preferences.js?v=20261127-unordered-in-place";

export async function bookCredentials() {
  const keys = Object.fromEntries(await Promise.all(["openai", "gemini", "vision", "vision_auth", "vision_project"].map(async name =>
    [name, await settings.get(`key:${name}`) || ""])));
  return new CredentialChecks(keys, undefined, {
    load: async () => await settings.get("credential-checks") ?? [],
    save: records => settings.set("credential-checks", records),
  });
}

export const saveCredential = (name, value) => settings.set(`key:${name}`, value);
