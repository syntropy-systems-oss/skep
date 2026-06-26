import { test } from "node:test";
import assert from "node:assert/strict";
import { xml, raw, showIf } from "../src/framework/index.ts";

test("xml escapes interpolated raw values", () => {
  const name = `a & b <c> "d"`;
  assert.equal(String(xml`<x name="${name}" />`), `<x name="a &amp; b &lt;c&gt; &quot;d&quot;" />`);
});

test("xml passes nested Markup through without re-escaping", () => {
  const inner = xml`<inner v="${"a & b"}" />`;
  const outer = xml`<outer>${inner}</outer>`;
  assert.equal(String(outer), `<outer><inner v="a &amp; b" /></outer>`);
});

test("xml renders arrays of Markup and skips empty values", () => {
  const items = ["x", "y"].map((v) => xml`<i>${v}</i>`);
  assert.equal(String(xml`<list>${items}</list>`), `<list><i>x</i>\n<i>y</i></list>`);
});

test("raw() injects a trusted string without escaping", () => {
  assert.equal(String(xml`<x>${raw("<b>bold</b>")}</x>`), `<x><b>bold</b></x>`);
});

test("showIf renders only when the condition holds, escaping by default", () => {
  assert.equal(String(showIf(true, "a & b")), "a &amp; b");
  assert.equal(String(showIf(false, "a & b")), "");
  assert.equal(String(showIf(true, xml`<ok/>`)), "<ok/>");
});
