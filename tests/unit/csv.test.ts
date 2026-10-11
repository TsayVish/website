import { test } from "node:test";
import assert from "node:assert/strict";
import { IMPORT_TEMPLATE, parseCsv, readCharacterCsv } from "../../lib/csv.ts";

test("parseCsv handles quotes, commas and newlines inside fields", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","say ""hi""\nthere"\r\n'), [["a", "b"], ["x, y", 'say "hi"\nthere']]);
  assert.deepEqual(parseCsv("﻿name\nMango\n\n"), [["name"], ["Mango"]]);
});

test("the template imports cleanly", () => {
  const { rows, error } = readCharacterCsv(IMPORT_TEMPLATE);
  assert.equal(error, undefined);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { line: 2, name: "Mango", kind: "Food", color: "Peach", personality: "Dreamy", description: "A sleepy cupcake who narrates life", errors: [] });
});

test("defaults, case-insensitive values and validation errors", () => {
  const { rows } = readCharacterCsv("Character,Colour,Mood\nPip,pink,CHILL\n,Teal,Grumpy\nPip,,\n");
  assert.equal(rows[0].kind, "Person");
  assert.equal(rows[0].color, "Pink");
  assert.equal(rows[0].personality, "Chill");
  assert.deepEqual(rows[0].errors, []);
  assert.ok(rows[1].errors.some((e) => e.includes("Missing name")));
  assert.ok(rows[1].errors.some((e) => e.startsWith("Color")));
  assert.ok(rows[1].errors.some((e) => e.startsWith("Personality")));
  assert.ok(rows[2].errors.includes("Duplicate name in this file"));
});

test("a file without a name column is rejected", () => {
  assert.match(readCharacterCsv("title\nx\n").error ?? "", /name/);
});
