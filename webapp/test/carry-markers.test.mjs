// Note markers kept when a reader that cannot see them reads a line again (marker-ids.js carryMarkers).
import { test } from "node:test";
import assert from "node:assert/strict";
import { carryMarkers } from "../js/marker-ids.js";

const marker = (at, n) => ({ start: at, end: at, kind: "note_marker", id: `m${n}`, marker: String(n) });
const place = (text, spans) => { const chars = [...text]; for (const span of [...spans].reverse()) chars.splice(span.start, 0, `[${span.marker}]`); return chars.join(""); };

test("a marker goes after the same word in the new reading, its spelling a little different", () => {
  const old = "ನಾವು ಊರಿನ ದೇವಸ್ಥನಕ್ಕೆ ಹೋದೆವು, ಅಲ್ಲಿ ತೇರು ಇತ್ತು.";
  const spans = [marker([..."ನಾವು ಊರಿನ ದೇವಸ್ಥನಕ್ಕೆ"].length, 1), marker([..."ನಾವು ಊರಿನ ದೇವಸ್ಥನಕ್ಕೆ ಹೋದೆವು, ಅಲ್ಲಿ ತೇರು ಇತ್ತು."].length, 2)];
  const fresh = "ನಾವು ಊರಿನ ದೇವಸ್ಥಾನಕ್ಕೆ ಹೋದೆವು. ಅಲ್ಲಿ ತೇರು ಇತ್ತು.";
  assert.equal(place(fresh, carryMarkers(old, spans, fresh, undefined)), "ನಾವು ಊರಿನ ದೇವಸ್ಥಾನಕ್ಕೆ[1] ಹೋದೆವು. ಅಲ್ಲಿ ತೇರು ಇತ್ತು.[2]");
  assert.deepEqual(carryMarkers(old, spans, fresh, undefined).map(span => span.id), ["km1", "km2"]);
});

test("a marker inside a word's closing punctuation stays before it; none is carried to a word not there", () => {
  const old = "He came home, and slept.";
  const spans = [marker([..."He came home"].length, 3)];
  assert.equal(place("He came home, and slept.", carryMarkers(old, spans, "He came home, and slept.")), "He came home[3], and slept.");
  assert.equal(carryMarkers(old, spans, "Nothing alike here at all."), undefined);
});

test("the new reading's own markers, or none in the old text: nothing carried", () => {
  const own = [marker(4, 1)];
  assert.equal(carryMarkers("one two", [marker(3, 5)], "one two", own), own);
  assert.equal(carryMarkers("one two", [], "one two", undefined), undefined);
});
