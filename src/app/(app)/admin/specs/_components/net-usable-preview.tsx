"use client";

// The live net-usable preview — design §4b, and the highest-value element in
// this slice.
//
// It imports the REAL usableCapacityTb() from src/lib/capacity-utils.ts rather
// than restating the parity formula. That is the entire point: a preview that
// re-implements the maths can agree with itself and still disagree with what the
// Price Book prints, which would make it worse than no preview at all. It also
// formats through the Price Book's own formatTb(), so the number on screen is
// character-for-character the number that will be published.
//
// Every capacity defect in this initiative (ADR 0092's RAID 60 span parity, the
// V100's correct-by-coincidence 'NA', ADR 0094's nameplate fallback) was
// invisible at the point of change and surfaced later in a rendered document.
// This component moves the consequence to the moment of editing.

import { usableCapacityTb } from "@/lib/capacity-utils";
import { formatTb } from "@/lib/price-book/cell-value";

export type CapacityInputs = {
  storage_raw_tb: number | null;
  hdd_count: number | null;
  raid_level_display: string | null;
  raid_level_alt_display: string | null;
};

function tb(value: number | null): string {
  return value == null ? "—" : `${formatTb(value)} TB`;
}

function DeltaBadge({ saved, next }: { saved: number; next: number }) {
  const diff = next - saved;
  if (Math.abs(diff) < 0.05) {
    return (
      <span className="rounded-full border border-line bg-[#f2f5f9] px-2 py-0.5 text-xs font-semibold text-ink-soft">
        no change
      </span>
    );
  }
  const pct = saved === 0 ? null : (diff / saved) * 100;
  const up = diff > 0;
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
        up
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-red-300 bg-red-50 text-red-700"
      }`}
    >
      {up ? "+" : "−"}
      {formatTb(Math.abs(diff))} TB
      {pct == null ? "" : ` (${up ? "+" : "−"}${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5c6472]">
        {label}
      </div>
      <div
        className={
          emphasis
            ? "text-xl font-bold text-arxys-navy"
            : "text-xl font-semibold text-ink-soft"
        }
      >
        {value}
      </div>
    </div>
  );
}

export function NetUsablePreview({
  saved,
  next,
}: {
  /** The persisted row's capacity inputs. Null on the create form. */
  saved: CapacityInputs | null;
  /** What the form currently holds. */
  next: CapacityInputs;
}) {
  const savedPrimary = saved
    ? usableCapacityTb(saved.storage_raw_tb, saved.hdd_count, saved.raid_level_display)
    : null;
  const nextPrimary = usableCapacityTb(
    next.storage_raw_tb,
    next.hdd_count,
    next.raid_level_display,
  );

  // The alternate figure is a second call to the same helper with only the level
  // varied — which is exactly why ADR 0096 decision 7 chose one nullable level
  // column over two capacity columns.
  const savedAlt =
    saved && saved.raid_level_alt_display
      ? usableCapacityTb(saved.storage_raw_tb, saved.hdd_count, saved.raid_level_alt_display)
      : null;
  const nextAlt = next.raid_level_alt_display
    ? usableCapacityTb(next.storage_raw_tb, next.hdd_count, next.raid_level_alt_display)
    : null;

  const primaryMoved =
    savedPrimary != null && nextPrimary != null && Math.abs(nextPrimary - savedPrimary) >= 0.05;
  const altMoved =
    savedAlt != null && nextAlt != null && Math.abs(nextAlt - savedAlt) >= 0.05;
  const altAppeared = savedAlt == null && nextAlt != null;
  const moved = primaryMoved || altMoved || altAppeared;

  return (
    <section
      aria-labelledby="net-usable-preview-heading"
      className={`rounded-[14px] border p-5 ${
        moved ? "border-amber-300 bg-amber-50/60" : "border-line bg-[#f7f9fc]"
      }`}
    >
      <h2
        id="net-usable-preview-heading"
        className="text-[11px] font-bold uppercase tracking-[0.09em] text-[#5c6472]"
      >
        Net usable capacity
      </h2>

      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-4">
        {saved ? (
          <Figure label="Saved" value={tb(savedPrimary)} />
        ) : null}
        <Figure
          label={saved ? "After this save" : "Will publish"}
          value={tb(nextPrimary)}
          emphasis
        />
        {savedPrimary != null && nextPrimary != null ? (
          <div className="pb-1">
            <DeltaBadge saved={savedPrimary} next={nextPrimary} />
          </div>
        ) : null}
      </div>

      {next.raid_level_alt_display || savedAlt != null ? (
        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-4 border-t border-line-soft pt-4">
          {savedAlt != null ? (
            <Figure
              label={`Saved alternate (${saved?.raid_level_alt_display})`}
              value={tb(savedAlt)}
            />
          ) : null}
          <Figure
            label={`Alternate — ${next.raid_level_alt_display ?? "cleared"}`}
            value={tb(nextAlt)}
            emphasis
          />
          {savedAlt != null && nextAlt != null ? (
            <div className="pb-1">
              <DeltaBadge saved={savedAlt} next={nextAlt} />
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
        {nextPrimary == null ? (
          <>Enter raw storage, HDD count and a RAID level to see the published figure.</>
        ) : (
          <>
            This figure appears on the <strong>Price Book</strong>, and on every{" "}
            <strong>new</strong> System Estimate PDF, Project Quote and Customer
            Proposal. It also changes <strong>which SKU the Calculator
            recommends</strong>. Documents already issued keep their stored
            snapshot and are unaffected.
          </>
        )}
      </p>

      {next.raid_level_display === "NA" ? (
        <p className="mt-2 text-[13px] font-medium text-amber-800">
          Level &lsquo;NA&rsquo; is not a RAID level usableCapacityTb() recognises — the
          figure above comes from its RAID-5 fallback, which matches the mirror
          figure only while this box has exactly two drives.
        </p>
      ) : null}
    </section>
  );
}
