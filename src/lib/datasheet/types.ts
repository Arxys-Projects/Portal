// The content contract the datasheet template renders from.
//
// This is deliberately NOT a product_specs row. It is the shape the template
// needs, so that the mapping from spec columns to sheet content lives in one
// adapter (lib/datasheet/from-specs.ts, build step ahead) rather than being
// smeared through the layout. The mockup fills this shape by hand.
//
// The handoff's audit of the built design found only three SKU-specific
// literals in the whole two-page template — the model descriptor, the page-2
// ceiling line, and the RAID level. Everything else below is data the spec
// tables already carry or can derive.
//
// ONE SHAPE, TWO SHEETS. Both the NVR sheet and the V250/V255 management sheet
// render from this type. They share page 1, page 3 and every rule about how a
// block is styled; they differ in exactly two places on page 2, and those two
// are `performance` and `orderable` below. Keeping them one type is what stops
// a fix to the warranty band, the ladder or the spec grid from having to be
// made twice — see ADR 0111 for why this is a variant where Rail (ADR 0109) is
// a separate template.

export type LadderCell = {
  /** e.g. "V800" */
  model: string;
  /** e.g. "36 bay · 4U" — the role line on the management ladder */
  detail: string;
  /** max camera streams, or a role word when no capacity data exists */
  capacity: string;
  /** the SKU this sheet is for gets the 3px gold bar on its top edge */
  active: boolean;
};

export type HeadlineStat = { key: string; value: string };

export type FeatureBlock = { title: string; body: string };

export type VsrRow = {
  resolution: string;
  codec: string;
  /** camera STREAMS, never "cameras" — a multisensor device presents several */
  streams: number;
  /** the "vs. 4MP baseline" cell */
  comparison: string;
};

export type OrderableRow = {
  partNumber: string;
  driveConfig: string;
  raw: string;
  usable: string;
};

/**
 * A row of the management sheet's Management Capacity table, which stands where
 * the NVR sheet puts its Max Video Stream Rate table.
 *
 * The two are not the same table with different numbers in it. A VSR row states
 * how many camera STREAMS a recorder ingests at a resolution; a capacity row
 * states what a management role does and how many cameras it covers, and its
 * Recording column reads "None" on every row — a management server records no
 * video at all. Rendering one through the other's shape is the failure ADR 0109
 * was written about.
 */
export type CapacityRow = {
  /** e.g. "V250 management server", "Management w/ failover" */
  role: string;
  /** e.g. "Up to 250", "250 and above", "Per model", or "—" where none applies */
  cameras: string;
  /** "None" throughout — stated rather than omitted, because it is the point */
  recording: string;
  notes: string;
};

/**
 * The page-2 performance section, which is the one block whose SHAPE differs
 * between an NVR sheet and a management sheet.
 *
 * A discriminated union rather than optional fields on both: with optionals,
 * every reader has to know which combination is legal, and a management sheet
 * that quietly carried an empty `vsrParameters` would render a wash panel with
 * a gold border and nothing in it. The union makes the illegal states
 * unrepresentable and lets the template switch once.
 */
export type PerformanceSection =
  | {
      kind: "vsr";
      heading: string;
      /** literal 2 of 3: "4,000 Mbit/s · 864 TB raw · 720 TB usable" */
      ceilingLine: string;
      rows: VsrRow[];
      /** the strip that makes the stream count defensible — never drop it */
      parameters: { label: string; value: string }[];
      caption: string;
    }
  | {
      kind: "capacity";
      heading: string;
      ceilingLine: string;
      rows: CapacityRow[];
      /**
       * No parameter strip. Deliberately absent rather than empty: the strip
       * exists to state the recording parameters a stream count was measured
       * against, and a server that records nothing has none to state.
       */
      caption: string;
    };

/**
 * The orderable-configurations table, columns and all.
 *
 * The columns are data because the two sheets order differently: an NVR sells
 * three drive capacities of one chassis (Part Number / Drive Configuration /
 * Raw / Usable · RAID 60), and a management sheet sells two CPU-and-RAM tiers
 * (Part Number / Model / Configuration / Cameras Managed). Same table, same
 * styling rules, different columns — so the header text, the flex weights and
 * which cells carry emphasis all come from the adapter.
 */
export type OrderableColumn = {
  header: string;
  /** the handoff's column weights, e.g. 1.05 / 1.6 / .75 / .95 */
  flex: number;
  /** navy 600 for a part number, bold ink for the figure a reader is buying */
  emphasis?: "partNumber" | "strong";
};

export type OrderableTable = {
  columns: OrderableColumn[];
  /** one array of cells per row, in column order */
  rows: string[][];
  caption: string;
};

export type SpecRow = { label: string; value: string };

export type ImageSlot = {
  /** public path of the photo, or null while the asset does not exist */
  path: string | null;
  /** shown inside the held frame when path is null */
  placeholder: string;
};

export type DatasheetContent = {
  model: string;
  /** literal 1 of 3: "36 Bay · 4U Rack · V5 Video Server" */
  descriptor: string;
  runningMark: string;
  productClass: string;
  compliance: string[];
  headline: HeadlineStat[];
  ladderHeading: string;
  ladderCaption: string;
  ladder: LadderCell[];
  usageHeading: string;
  usage: string;
  attributes: string[];
  productPhoto: ImageSlot;
  /**
   * Height of the page-1 photo frame, in handoff pixels.
   *
   * The one layout number in this content contract, and it is here because page
   * 1 has no slack and the photo is its only adjustable block — the feature grid
   * sits at its content minimum and absorbs nothing, so anything that adds a
   * line has to be paid for out of the frame. A flexible slot does not work:
   * @react-pdf/renderer paginates rather than shrinking a flex child, which was
   * tried and reverted (ADR 0110).
   *
   * MEASURED PER SHEET, never estimated. See PAGE1_PHOTO_HEIGHT.
   */
  productPhotoHeight: number;
  /**
   * null when the spec row has no `warranty_years`, in which case the band is
   * omitted entirely. The V100 rows are in that state today. A term must never
   * be inferred — not from the legacy free-text `warranty` column ("5yr NBD,
   * Advanced Replacement"), not from a sibling model — because the seal graphic
   * is chosen by term and the wrong seal is a false warranty claim on a
   * customer-facing document, not a cosmetic slip.
   */
  warranty: { years: number; title: string; body: string; sealPath: string | null } | null;
  featuresHeading: string;
  features: FeatureBlock[];
  vmsValidated: string[];
  /** VSR table on an NVR sheet, Management Capacity table on a management one. */
  performance: PerformanceSection;
  orderable: OrderableTable;
  hardware: SpecRow[];
  environmental: SpecRow[];
  rearIo: ImageSlot;
  generalInfo: string;
  footerAddress: string;
  footerNote: string;
  revisionLine: string;
};
