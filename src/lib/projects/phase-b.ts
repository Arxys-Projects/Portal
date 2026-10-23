// Pure helpers for scripts/project-deal-phase-b.mts (Project Portal Step 5
// Phase B, ADR 0172): the one live end-to-end test of a portal-built deal.
// No env, no fetch, no database.

import type { CalculatorInitialState } from "@/lib/calculator/rehydrate";
import { usdPrice, type PdProduct } from "@/lib/pipedrive/product-sync";
import type { PdV2DealProduct } from "@/lib/pipedrive/project-deal-api";

// The rep's system-design choices, in the shape submitCalculation accepts
// (systemDesignSchema in src/app/(app)/calculator/actions.ts validates it).
export type SystemDesignRequest = Record<string, unknown>;

// The submitCalculation payload for a fresh project calc with the same camera
// groups and project settings as a stored calc. Not a revision: a project calc
// cannot revise a calc outside any project (Step 4), so lineage is not carried.
// The legacy add-on booleans are left off; a project calc uses systemDesign.
export function buildProjectCalcPayload(
  state: CalculatorInitialState,
  projectId: string,
  systemDesign: SystemDesignRequest,
): Record<string, unknown> {
  return {
    projectName: state.projectName || null,
    vms: state.vms || null,
    retentionDays: state.retentionDays,
    utilizationPct: state.utilizationPct,
    groups: state.groups.map((g) => ({ ...g })),
    addOnFailoverRecorder: false,
    addOnManagementServer: false,
    isRevision: false,
    sourceSubmissionId: null,
    projectId,
    systemDesign,
  };
}

export type LinePriceMismatch = {
  attachmentId: number;
  productId: number;
  itemPrice: number | null | undefined;
  productPrice: number | null;
};

// Each deal line's item_price against its product's USD price, string for
// string: the portal sends the price verbatim, so any difference is a defect.
export function checkLinePrices(lines: readonly PdV2DealProduct[], products: readonly PdProduct[]): LinePriceMismatch[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: LinePriceMismatch[] = [];
  for (const line of lines) {
    const product = byId.get(line.product_id);
    const productPrice = product ? usdPrice(product) : null;
    if (productPrice === null || String(line.item_price) !== String(productPrice)) {
      out.push({ attachmentId: line.id, productId: line.product_id, itemPrice: line.item_price, productPrice });
    }
  }
  return out;
}

// The deal's value against Pipedrive's own line sums. A verification of what
// Pipedrive computed, never a price the portal shows or sends. Compared in
// cents so float addition cannot fail an equal pair.
export function checkDealValue(
  dealValue: number | null | undefined,
  lines: readonly PdV2DealProduct[],
): { ok: boolean; dealValue: number | null; linesSum: number | null } {
  const sums = lines.map((l) => l.sum);
  if (typeof dealValue !== "number" || sums.some((s) => typeof s !== "number")) {
    return { ok: false, dealValue: typeof dealValue === "number" ? dealValue : null, linesSum: null };
  }
  const cents = (sums as number[]).reduce((acc, s) => acc + Math.round(s * 100), 0);
  return { ok: Math.round(dealValue * 100) === cents, dealValue, linesSum: cents / 100 };
}

// ---------------------------------------------------------------------------
// The deal field, the deal header and the ledger (review gate A-3, A-7)
// ---------------------------------------------------------------------------

export type DealFieldMatch = { code: string | null; type: string | null };

// Every deal field with exactly this name, v2 or v1 property names. More than
// one is a problem to fix by hand; create-field never adds another.
export function dealFieldMatches(fields: readonly Record<string, unknown>[], name: string): DealFieldMatch[] {
  return fields
    .filter((f) => (f.field_name ?? f.name) === name)
    .map((f) => ({
      code: ((f.field_code ?? f.key) as string | undefined) ?? null,
      type: ((f.field_type as string | undefined) ?? null),
    }));
}

export type DealHeader = {
  pipeline_id?: number | null;
  stage_id?: number | null;
  org_id?: number | null;
  person_id?: number | null;
  owner_id?: number | null;
  currency?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

export type ExpectedHeader = {
  pipelineId: number;
  stageId: number;
  orgId: number;
  personId: number;
  // null: the default owner, not checked here.
  ownerId: number | null;
  fieldCode: string;
  projectId: string;
};

// What differs between the deal Pipedrive holds and the deal the portal meant to create.
export function checkDealHeader(deal: DealHeader | null, want: ExpectedHeader): string[] {
  if (!deal) return ["the deal could not be read"];
  const problems: string[] = [];
  const eq = (label: string, got: unknown, expected: unknown) => {
    if (got !== expected) problems.push(`${label}: ${String(got)} (expected ${String(expected)})`);
  };
  eq("pipeline_id", deal.pipeline_id, want.pipelineId);
  eq("stage_id", deal.stage_id, want.stageId);
  eq("org_id", deal.org_id, want.orgId);
  eq("person_id", deal.person_id, want.personId);
  if (want.ownerId !== null) eq("owner_id", deal.owner_id, want.ownerId);
  eq("currency", deal.currency, "USD");
  eq(`custom_fields.${want.fieldCode} (arxys_project_id)`, deal.custom_fields?.[want.fieldCode] ?? null, want.projectId);
  return problems;
}

export type LedgerRowForCheck = {
  sku: string;
  role: string;
  status: string;
  pipedrive_deal_product_id: number | null;
  item_price_sent: number | string;
};

// Every ledger row added, its attachment on the deal, at the price it recorded
// sending; and no deal line the ledger does not account for.
export function checkLedger(rows: readonly LedgerRowForCheck[], lines: readonly PdV2DealProduct[]): string[] {
  const problems: string[] = [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  const cents = (v: unknown) => Math.round(Number(v) * 100);
  for (const r of rows) {
    if (r.status !== "added") {
      problems.push(`${r.sku} (${r.role}) is ${r.status}`);
      continue;
    }
    const line = r.pipedrive_deal_product_id ? byId.get(Number(r.pipedrive_deal_product_id)) : undefined;
    if (!line) {
      problems.push(`${r.sku} (${r.role}) points at line #${r.pipedrive_deal_product_id}, which the deal does not have`);
      continue;
    }
    if (cents(line.item_price) !== cents(r.item_price_sent)) {
      problems.push(`${r.sku} (${r.role}): deal price ${line.item_price}, ledger sent ${r.item_price_sent}`);
    }
  }
  const accounted = new Set(rows.map((r) => Number(r.pipedrive_deal_product_id)));
  for (const l of lines) if (!accounted.has(l.id)) problems.push(`deal line #${l.id} (product #${l.product_id}) is not in the ledger`);
  return problems;
}
