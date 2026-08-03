import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatClockTime,
  formatDayAndClock,
  formatDayLabel,
  formatUsd0,
  isSameLocalDay,
} from "./format";

// Every local-day assertion below pins timeZone="UTC" explicitly so the suite
// is deterministic regardless of which machine runs it — production leaves
// the zone unset and gets the viewer's own browser timezone (see format.ts).
const TZ = "UTC";

describe("formatUsd0", () => {
  it("drops cents and adds thousands separators", () => {
    assert.equal(formatUsd0(6545821.42), "$6,545,821");
  });

  it("rounds rather than truncates", () => {
    assert.equal(formatUsd0(999.6), "$1,000");
  });

  it("handles zero", () => {
    assert.equal(formatUsd0(0), "$0");
  });
});

describe("isSameLocalDay / formatDayLabel", () => {
  it("is true for the same instant", () => {
    const now = "2026-08-03T13:00:00.000Z";
    assert.equal(isSameLocalDay(now, now, TZ), true);
  });

  it("is false across a day boundary", () => {
    assert.equal(
      isSameLocalDay("2026-08-02T23:59:00.000Z", "2026-08-03T00:01:00.000Z", TZ),
      false,
    );
  });

  it("formats the same day as 'today'", () => {
    const now = "2026-08-03T09:42:00.000Z";
    assert.equal(formatDayLabel(now, now, TZ), "today");
  });

  it("formats a different day as '<day> <Mon>'", () => {
    const now = "2026-08-03T09:00:00.000Z";
    assert.equal(formatDayLabel("2026-07-14T09:00:00.000Z", now, TZ), "14 Jul");
  });
});

describe("formatClockTime / formatDayAndClock", () => {
  it("formats a 12-hour clock time", () => {
    assert.equal(formatClockTime("2026-08-03T09:42:00.000Z", TZ), "9:42 AM");
  });

  it("composes day label and clock time", () => {
    const now = "2026-08-03T09:42:00.000Z";
    assert.equal(formatDayAndClock(now, now, TZ), "today at 9:42 AM");
  });
});
