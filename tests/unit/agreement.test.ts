import { test } from "node:test";
import assert from "node:assert/strict";
import { agreementClauses, defaultTerms, readTerms, termLabel } from "../../lib/agreement.ts";

const parties = { licensor: "Ada", licensee: "Cy", property: "Mango", kind: "character" as const, date: "Oct 12, 2026" };

test("defaults use the accepted fee", () => {
  assert.equal(defaultTerms(300, "character").fee, 300);
  assert.equal(defaultTerms(300, "service").approvals, false);
});

test("readTerms rejects junk", () => {
  const t = readTerms({ media: ["Games and interactive", "Rockets"], term_months: -4, fee: "abc", exclusive: "yes" }, 99);
  assert.deepEqual(t.media, ["Games and interactive"]);
  assert.equal(t.term_months, 12);
  assert.equal(t.fee, 99);
  assert.equal(t.exclusive, false);
});

test("clauses read naturally", () => {
  const t = { ...defaultTerms(1250, "character"), exclusive: true, term_months: 24, attribution: "Mango © Ada" };
  const c = agreementClauses(t, parties);
  assert.match(c[1].text, /exclusive license to use the character “Mango”/);
  assert.match(c[2].text, /2 years/);
  assert.match(c[3].text, /\$1,250/);
  assert.ok(c.some((x) => x.text.includes("Credit line: “Mango © Ada”")));
  assert.equal(termLabel(0), "No end date");
  assert.equal(termLabel(6), "6 months");
});

test("territory wording reads naturally", async () => {
  const { where } = await import("../../lib/agreement.ts");
  assert.equal(where("Worldwide"), "worldwide");
  assert.equal(where("United States"), "in the United States");
  assert.equal(where("Asia-Pacific"), "in Asia-Pacific");
});
