import { test } from "node:test";
import assert from "node:assert/strict";
import { agoInline, dealHref, money, offerDraft } from "../../lib/offers.ts";
import { characterSubtitle, cleanLinks, isExisting } from "../../lib/existing.ts";
import { reportHref } from "../../lib/hub.ts";
import { cleanQuery } from "../../lib/members.ts";
import { MAX_LIMIT, moreHref, readLimit, splitPage } from "../../lib/paging.ts";

test("money formats whole and fractional dollars", () => {
  assert.equal(money(300), "$300");
  assert.equal(money(1250.5), "$1,250.50");
  assert.equal(money("99"), "$99");
});

test("offer helpers", () => {
  assert.equal(dealHref("abc"), "/studio/deals/abc");
  assert.match(offerDraft("Vish", 300), /\$300 offer on “Vish”/);
  assert.equal(agoInline(new Date().toISOString()), "just now");
});

test("cleanLinks keeps up to five real links and adds https", () => {
  assert.deepEqual(cleanLinks("tiktok.com/@crumb\nnot a link\nhttps://instagram.com/x"), ["https://tiktok.com/@crumb", "https://instagram.com/x"]);
  assert.equal(cleanLinks("a.co b.co c.co d.co e.co f.co").length, 5);
  assert.deepEqual(cleanLinks("javascript:alert(1)"), []);
});

test("existing characters are recognised and described", () => {
  assert.equal(isExisting({ origin: "existing" }), true);
  assert.equal(isExisting({}), false);
  assert.equal(isExisting(null), false);
  const label = (k: string | null) => k ?? "";
  assert.equal(characterSubtitle({ personality: null, kind: "Custom", details: { origin: "existing", since: "2021" } }, label), "Existing character · since 2021");
  assert.equal(characterSubtitle({ personality: "Dreamy", kind: "Food", details: {} }, label), "Dreamy · food");
});

test("reportHref points at the reported item", () => {
  assert.equal(reportHref({ target_type: "listing", target_id: "1" }), "/studio/marketplace/1");
  assert.equal(reportHref({ target_type: "message", target_id: "1" }), null);
});

test("cleanQuery strips characters that would break a filter", () => {
  assert.equal(cleanQuery("voice, (actors)%"), "voice actors");
  assert.equal(cleanQuery(undefined), "");
});

test("paging", () => {
  assert.equal(readLimit(undefined), 24);
  assert.equal(readLimit("30"), 48);
  assert.equal(readLimit("99999"), MAX_LIMIT);
  assert.equal(readLimit("-5"), 24);
  assert.deepEqual(splitPage([1, 2, 3], 2), { items: [1, 2], hasMore: true });
  assert.deepEqual(splitPage([1, 2], 2), { items: [1, 2], hasMore: false });
  assert.equal(moreHref("/studio/marketplace", { q: "voice", type: null }, 24), "/studio/marketplace?q=voice&limit=48");
});

import { describeChange, isStyleGuideEmpty, readStyleGuide } from "../../lib/characters.ts";

test("style guide reading drops bad values", () => {
  const g = readStyleGuide({ palette: ["#ff00aa", "red", 3], voice: "Warm", catchphrases: ["Yum", 4] });
  assert.deepEqual(g.palette, ["#ff00aa"]);
  assert.deepEqual(g.catchphrases, ["Yum"]);
  assert.equal(isStyleGuideEmpty(readStyleGuide(null)), true);
  assert.equal(isStyleGuideEmpty(g), false);
});

test("describeChange lists what changed", () => {
  assert.equal(describeChange({ name: "A", color: "Mint" }, { name: "B", color: "Mint" }), "Changed name");
  assert.equal(describeChange({ name: "A" }, { name: "A" }), "No visible changes");
});
