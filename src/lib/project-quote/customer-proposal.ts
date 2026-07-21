import type {
  DealQuote,
  QuoteLineItem,
  QuoteOrganization,
  QuotePerson,
} from "@/lib/pipedrive/quote";

// ===========================================================================
// Customer Proposal — assembler-level discount strip (ADR 0089 §2).
//
// The Customer Proposal is a second view over the SAME project_quotes snapshot
// as the Project Quote. The critical safety rule: the object handed to the
// Customer Proposal renderer must have every partner / discount value
// PHYSICALLY ABSENT — removed here at the data-assembly layer, never present in
// the render input and hidden by layout. The renderer variant is typed to
// receive CustomerProposalCommercial (below), which has no field capable of
// carrying a discount %, a partner-each price, a partner line total, the
// discounted line amount, or the partner grand total.
//
// A build-failing guard (customer-proposal.test.ts) renders a proposal from a
// snapshot carrying known discount/partner values and asserts none of them
// appear in the output. This module is the boundary that guarantee rests on.
//
// The only price retained is unitPrice — Pipedrive's item_price, i.e. the MSRP
// each, frozen at generation (ADR 0086 / Task 0: STORED, not a live lookup).
// PRODUCT TOTAL and the grand total are MSRP arithmetic (MSRP each × qty, and
// their sum); ADR 0089 §3 permits this display arithmetic for the customer
// document. It deliberately does NOT inherit commercial.productTotal (the
// partner/discounted deal total).
// ===========================================================================

// One customer-facing line. Carries ONLY the customer-safe fields. There is no
// discount, discountPercent, discountType, partner-each, partner-total,
// lineAmount, or discountedUnitPrice field anywhere on this type.
export type CustomerProposalLine = {
  productCode: string | null;
  productName: string | null;
  // MSRP each (Pipedrive unitPrice, relabeled "PRICE EACH" in the document).
  priceEach: number | null;
  quantity: number | null;
  // MSRP each × qty. null when priceEach is null; 0-priced info-only lines blank.
  productTotal: number | null;
  orderNr: number | null;
  isInfoOnly: boolean;
};

// The customer-facing commercial view. Keeps the end-customer identity
// (organization = "Customer", person = "Contact") but NOT the raw internal deal
// title (the DEAL cell is dropped, ADR 0089 §3), NOT the partner productTotal,
// and NOT additionalDiscounts.
export type CustomerProposalCommercial = {
  organization: QuoteOrganization | null;
  person: QuotePerson | null;
  currency: string | null;
  lineItems: CustomerProposalLine[];
  // Recomputed sum of MSRP line totals over non-info lines. NOT the inherited
  // partner/discounted deal total.
  grandTotal: number | null;
};

// MSRP line total for one line: priceEach × qty. Info-only or null-priced lines
// contribute nothing (null → blank cell, 0 in the sum).
function msrpLineTotal(line: QuoteLineItem): number | null {
  if (line.isInfoOnly) return null;
  if (line.unitPrice == null) return null;
  return line.unitPrice * (line.quantity ?? 0);
}

// Strip the frozen DealQuote down to the customer-safe view. This is the single
// point where partner/discount fields are dropped; everything downstream of it
// is structurally incapable of leaking them.
export function assembleCustomerProposalCommercial(
  commercial: DealQuote,
): CustomerProposalCommercial {
  const lineItems: CustomerProposalLine[] = commercial.lineItems.map((line) => ({
    productCode: line.productCode,
    productName: line.productName,
    priceEach: line.unitPrice,
    quantity: line.quantity,
    productTotal: msrpLineTotal(line),
    orderNr: line.orderNr,
    isInfoOnly: line.isInfoOnly,
  }));

  // Grand total = sum of MSRP line totals (recomputed; never the partner total).
  // null only when there is no priced line to sum.
  let sum = 0;
  let anyPriced = false;
  for (const line of commercial.lineItems) {
    const t = msrpLineTotal(line);
    if (t != null) {
      sum += t;
      anyPriced = true;
    }
  }

  return {
    organization: commercial.organization,
    person: commercial.person,
    currency: commercial.currency,
    lineItems,
    grandTotal: anyPriced ? sum : null,
  };
}
