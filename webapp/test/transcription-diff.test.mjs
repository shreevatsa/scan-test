import { test } from "node:test";
import assert from "node:assert/strict";
import { graphemes, transcriptionHtml } from "../js/transcription-diff.js";

const visibleText = html => html.replace(/<[^>]*>/g, "");

test("Indic vowel signs and consonant conjuncts stay together", () => {
  for (const cluster of ["क्षि", "क्षी", "ಕ್ಕಿ", "ಕ್ಷಿ", "ಕ್‍ಷಿ", "क्‌षि", "ක්‍ෂි", "ক্ষি", "ക്ഷി", "👩🏽‍💻", "🇮🇳", "e\u0301"]) {
    assert.deepEqual(graphemes(cluster), [cluster], cluster);
  }
  assert.deepEqual(graphemes("ಅಕ್ಷಿ ಬ"), ["ಅ", "ಕ್ಷಿ", " ", "ಬ"]);
  assert.deepEqual(graphemes("text without segmentation", null), ["text without segmentation"]);
});

test("a changed vowel highlights the entire Indic conjunct", () => {
  for (const [reference, candidate] of [["ಅಕ್ಷಿ ಬ", "ಅಕ್ಷೀ ಬ"], ["क्षि", "क्षी"], ["ಕ್‍ಷಿ", "ಕ್‍ಷೀ"]]) {
    const html = transcriptionHtml([reference], [candidate]);
    const changes = [...html.matchAll(/<span class="diff-text"[^>]*>(.*?)<\/span>/g)].map(match => match[1]);
    assert.deepEqual(changes, [candidate.includes(" ") ? "ಕ್ಷೀ" : candidate]);
    assert.equal(visibleText(html), candidate);
  }
});

test("insertions, substitutions and omissions retain the candidate text", () => {
  for (const [reference, candidate] of [["cat", "car"], ["ab", "axb"], ["hello world", "hello"], ["word", ""], ["", "word"]]) {
    const html = transcriptionHtml([reference], [candidate]);
    assert.equal(visibleText(html), candidate);
    assert.match(html, /diff-text|diff-omitted/);
  }
  assert.match(transcriptionHtml(["ಅಕ್ಷಿ ಬ"], ["ಅ ಬ"]), /data-missing="ಕ್ಷಿ"/);
  assert.match(transcriptionHtml(["hello world"], ["hello"]), /data-missing=" world"/);
  assert.equal(visibleText(transcriptionHtml([], ["extra line"])), "extra line");
});

test("canonical equivalents match while original code points are retained", () => {
  const html = transcriptionHtml(["café"], ["cafe\u0301"]);
  assert.equal(html, "cafe\u0301");
});

test("formatting differences use full clusters and tags render as formatting", () => {
  const html = transcriptionHtml(["<b>ಕ್</b>ಷಿ"], ["ಕ್ಷಿ"]);
  assert.match(html, /<span class="diff-format"[^>]*>ಕ್ಷಿ<\/span>/);
  assert.equal(visibleText(html), "ಕ್ಷಿ");
  assert.equal(transcriptionHtml(["<b>word</b>"], ["<b>word</b>"]), "<b>word</b>");
  assert.equal(transcriptionHtml(["<b>word"], ["<b>word"]), "<b>word</b>");
  const carried = transcriptionHtml(["<b>one", "two</b>"], ["one", "two"]);
  assert.equal((carried.match(/class="diff-format"/g) || []).length, 2);
  assert.equal(visibleText(carried), "one\ntwo");
});

test("note markers are visible and their additions and omissions are highlighted", () => {
  assert.match(transcriptionHtml(["a"], ["a[1]"]), /diff-text[^]*<sup class="diff-note">\[1\]<\/sup>/);
  assert.match(transcriptionHtml(["a[1]"], ["a"]), /data-missing="\[1\]"/);
  // A marker anchored inside a conjunct is displayed at its boundary.
  const html = transcriptionHtml(["ಕ್[1]ಷಿ"], ["ಕ್[1]ಷಿ"]);
  assert.equal(html, "ಕ್ಷಿ<sup class=\"diff-note\">[1]</sup>");
});

test("long lines use bounded alignment and preserve all displayed text", () => {
  const text = "ಕ್ಷಿ".repeat(1200);
  assert.equal(visibleText(transcriptionHtml(["x".repeat(1200)], [text])), text);
});

test("text and omitted text are escaped before HTML rendering", () => {
  const script = '<img src=x onerror="alert(1)">';
  const added = transcriptionHtml([""], [script]);
  assert.ok(!added.includes("<img"));
  assert.match(added, /&lt;img/);
  const omitted = transcriptionHtml([script], [""]);
  assert.match(omitted, /data-missing="&lt;img/);
  assert.ok(!omitted.includes('onerror="alert'));
});
