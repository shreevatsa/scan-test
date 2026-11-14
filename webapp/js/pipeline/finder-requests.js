import { regionRequest } from "./steps.js?v=20261113-moveon-2";
import { geminiReadingRequest } from "./readers.js?v=20261113-moveon-2";

export function finderRequest(profile, prompt, schema, image) {
  if (profile.provider === "openai") return { ...regionRequest(prompt, schema, image),
    model: profile.model, reasoning: { effort: profile.reasoning } };
  if (profile.provider === "gemini") return geminiReadingRequest(profile,
    [{ type: "text", text: prompt }, { type: "image", data: image.split(",")[1], mime_type: "image/png", resolution: "high" }], schema, 16384);
  throw new Error("Choose a model provider to build a region request.");
}
