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
  warranty: { years: number; title: string; body: string; sealPath: string | null };
  featuresHeading: string;
  features: FeatureBlock[];
  vmsValidated: string[];
  /** literal 2 of 3: "4,000 Mbit/s · 864 TB raw · 720 TB usable" */
  ceilingLine: string;
  vsrRows: VsrRow[];
  /** the strip that makes the stream count defensible — never drop it */
  vsrParameters: { label: string; value: string }[];
  vsrCaption: string;
  /** literal 3 of 3 — appears in the column header AND the caption */
  raidLevel: string;
  orderableRows: OrderableRow[];
  orderableCaption: string;
  hardware: SpecRow[];
  environmental: SpecRow[];
  rearIo: ImageSlot;
  generalInfo: string;
  footerAddress: string;
  footerNote: string;
  revisionLine: string;
};
