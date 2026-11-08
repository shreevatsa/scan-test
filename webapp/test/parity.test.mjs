// Parity of the app's checks, assembly and inline parsing with schema/book.py and schema/inline.py.
// Run from the repository root:  node --test webapp/test/
// Needs the book folders in outputs/books/ (webapp/tools/make_book_folder.py) and `uv` for the Python side.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { makeValidator, checkPage } from "../js/schema.js";
import { assemble } from "../js/assemble.js";
import { parseLine } from "../js/inline.js";

const ROOT = new URL("../..", import.meta.url).pathname;
const SCHEMA = JSON.parse(readFileSync(join(ROOT, "webapp/schema.json"), "utf8"));
const validate = makeValidator(SCHEMA);
const BOOKS = ["outputs/books/kale-1913-book-002", "outputs/books/telang-dli-book-001"].filter(b => existsSync(join(ROOT, b, "book.json")));

const python = (args, input) => JSON.parse(execFileSync("uv", ["run", "--offline", "python", "webapp/test/py_reference.py", ...args],
  { cwd: ROOT, input, maxBuffer: 1 << 30, encoding: "utf8" }));

function load(folder) {
  const m = JSON.parse(readFileSync(join(ROOT, folder, "book.json"), "utf8"));
  const tl = JSON.parse(readFileSync(join(ROOT, folder, m.types), "utf8"));
  const docs = m.pages.map(p => JSON.parse(readFileSync(join(ROOT, folder, p.document), "utf8")));
  return { tl, docs };
}

// JSON Schema messages quote values differently in Python (repr) and here (JSON); compare their paths only.
const norm = errs => errs.map(e => (e.startsWith("$") ? e.split(":")[0] + ": (schema)" : e));

test("schema.json is the schema's copy", () => {
  assert.equal(readFileSync(join(ROOT, "webapp/schema.json"), "utf8"), readFileSync(join(ROOT, "schema/schema.json"), "utf8"));
});

for (const folder of BOOKS) {
  test(`check: ${folder}`, () => {
    const { tl, docs } = load(folder);
    const byId = Object.fromEntries(docs.map(d => [d.page.id, d]));
    const cases = python(["check", folder]);
    let n = 0;
    for (const c of cases) {
      const doc = c.doc || byId[c.name];
      const [errors, warnings] = checkPage(validate, doc, tl);
      assert.deepEqual(norm(errors), norm(c.errors), c.name);
      assert.deepEqual(warnings, c.warnings, c.name);
      n++;
    }
    assert.ok(n > docs.length);
  });

  test(`assemble: ${folder}`, () => {
    const { tl, docs } = load(folder);
    const want = python(["assemble", folder]);
    const [book, warnings] = assemble(docs, tl);
    assert.deepEqual(warnings, want.warnings);
    assert.deepEqual(book.units, want.units);
    assert.deepEqual(book.flows, want.flows);
    assert.deepEqual(book.relations, want.relations);
    assert.equal(book.schema_version, want.schema_version);
    const [errors] = checkPage(validate, book, tl).length ? [validate(book)] : [[]];
    assert.deepEqual(norm(errors), norm(want.errors.filter(e => e.startsWith("$"))));
  });
}

test("parseLine", () => {
  const cases = [
    ["plain", [], 1], ["wo[*]rd and <b>bold</b> <i>it", [], 3], ["al</i>ics", ["italic"], 1],
    ["<sc>Stanza</sc> I.—x<sup>2</sup>", [], 1], ["च[१] वदने[२]", [], 5], ["<b><i>both</i></b>", [], 1],
    ["𝔄[a]𝔅 <u>u</u>", [], 1], ["unclosed <b>bold", [], 1], ["</b>stray close", [], 1], ["[toolong] [x y]", [], 1],
  ];
  const want = python(["parse"], JSON.stringify(cases));
  cases.forEach(([text, tags, n], k) => assert.deepEqual(parseLine(text, tags, n), want[k], text));
});
