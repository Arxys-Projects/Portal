// The content contract for the "Rail" datasheet template — SW security
// workstations, one page.
//
// Deliberately NOT DatasheetContent. The two templates are not variants of one
// sheet: Rail has no model ladder, no headline spec strip, no feature grid, no
// VMS row, no orderable-configurations table and no RAID level, and it has a
// left rail and a four-column camera-stream matrix that Ledger does not. Making
// one type cover both would mean a dozen optional fields whose presence encodes
// which template is meant — the branch would just move into the component.
//
// As on Ledger, this is the shape the template needs rather than an
// appliance_specs row, so the mapping from spec columns to sheet content lives
// in one adapter rather than being smeared through the layout.

/** A row of the camera stream matrix. Columns: resolution, codec, streams, bandwidth. */
export type StreamRow = {
  /** "4MP (2592×1944)" — note the workstation 4MP is 2592×1944, not Ledger's 2560×1440 */
  resolution: string;
  /** H.264 and H.265 are separate rows here, unlike Ledger's H.265-only VSR table */
  codec: string;
  /** camera STREAMS, never "cameras" — a multisensor device presents several */
  streams: number;
  bandwidth: string;
};

export type RailSpecRow = { label: string; value: string };

export type RailImageSlot = {
  /** public path of the photo, or null while the asset does not exist */
  path: string | null;
  /** shown inside the held frame when path is null */
  placeholder: string;
};

export type RailContent = {
  /** the numeral in the rail, e.g. "SW10" */
  model: string;
  runningMark: string;
  /** the two uppercase lines under the numeral, e.g. Performance Tower / Security Workstation */
  productClass: string[];
  /** the orderable part number, under its own rule */
  partNumber: string;
  attributesHeading: string;
  attributes: string[];
  /**
   * Workstations are 3-year, with an optional 5-year upgrade that must be
   * bought with the unit. `sealPath` is null until a 3-year seal graphic
   * exists — the template then holds a 62px circle. Never point this at the
   * 5-year seal: that would print a false warranty claim.
   */
  warranty: { years: number; title: string; body: string; sealPath: string | null };
  complianceHeading: string;
  compliance: string[];
  address: string[];

  /** the navy sentence over the 56px gold rule */
  headline: string;
  usage: string;
  productPhoto: RailImageSlot;

  matrixHeading: string;
  /** right-aligned on the matrix heading row, e.g. "Ceiling: 125 Mbit/s · 4 monitors" */
  ceilingLine: string;
  matrix: StreamRow[];
  matrixCaption: string;

  /** left column — balance the two BY ROW COUNT, not semantics */
  hardwareHeading: string;
  hardware: RailSpecRow[];
  performanceHeading: string;
  performance: RailSpecRow[];

  footerNote: string[];
};
