import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buttonClasses,
  iconButtonClasses,
  cx,
  BADGE_BASE,
  BADGE_SOURCE,
  BADGE_ON_BEHALF,
} from "./styles";

test("buttonClasses defaults to primary/md", () => {
  const c = buttonClasses();
  assert.match(c, /bg-arxys-navy/);
  assert.match(c, /hover:bg-arxys-navy-deep/);
  assert.match(c, /text-sm/);
  assert.doesNotMatch(c, /bg-secondary/);
});

test("buttonClasses secondary uses navy text on grey fill", () => {
  const c = buttonClasses("secondary");
  assert.match(c, /bg-secondary/);
  assert.match(c, /text-arxys-navy/);
});

test("buttonClasses destructive uses danger tokens", () => {
  const c = buttonClasses("destructive", "sm");
  assert.match(c, /bg-danger/);
  assert.match(c, /text-\[13px\]/);
});

test("buttonClasses appends caller className last", () => {
  assert.match(buttonClasses("primary", "md", "w-full"), /w-full$/);
});

test("buttonClasses reskin variants (ADR 0075) are distinct", () => {
  // outline: white surface, navy text, fills navy-tint on hover
  const outline = buttonClasses("outline");
  assert.match(outline, /bg-surface/);
  assert.match(outline, /text-arxys-navy/);
  assert.match(outline, /hover:bg-arxys-navy-soft/);
  // amber: gold fill, dark-on-gold text (gold reinstated)
  const amber = buttonClasses("amber");
  assert.match(amber, /bg-arxys-gold/);
  assert.match(amber, /text-arxys-text-on-gold/);
  // invert: white on navy contexts
  assert.match(buttonClasses("invert"), /bg-white/);
});

test("icon button tones differ", () => {
  assert.match(iconButtonClasses("default"), /hover:text-arxys-navy/);
  assert.match(iconButtonClasses("danger"), /hover:text-danger/);
});

test("cx drops falsy parts", () => {
  assert.equal(cx("a", false, null, undefined, "b"), "a b");
});

test("badge variants are distinct, all share the pill base shape", () => {
  assert.match(BADGE_BASE, /rounded-full/);
  assert.notEqual(BADGE_SOURCE, BADGE_ON_BEHALF);
  assert.match(BADGE_SOURCE, /text-arxys-navy/);
});
