import { createHash } from "node:crypto";
import type { ProjectQuoteTerms } from "./types";

// Project Quote — in-force Terms & Conditions.
//
// The Project Quote freezes the FULL terms text (not only a version stamp) into
// each snapshot, so an issued quote re-renders the exact legal text it was sent
// with even if these constants later change or a future versioned-terms store
// is introduced. Storing the version alone would make an old quote depend on an
// external terms archive still holding that version at re-render time, a
// fragile dependency that breaks the self-contained-reproduction premise the
// whole feature rests on (the same reasoning that drives the commercial
// snapshot, ADR 0060). The content hash lets us audit and detect drift and
// de-duplicate identical terms across version bumps.
//
// TEXT PROVENANCE: the approved Arxys quote Terms & Conditions, supplied
// 2026-06-18, replacing the earlier placeholder (Price Book disclaimer) that
// was never issued on any quote (project_quotes had 0 rows at the time of the
// swap). Each paragraph is a separate entry joined by a blank line; the renderer
// splits on the blank line so react-pdf can break cleanly across pages. Bump
// PROJECT_QUOTE_TERMS_VERSION on every terms change.

export const PROJECT_QUOTE_TERMS_VERSION = "2.0";

export const PROJECT_QUOTE_TERMS_TEXT = [
  "Arxys Terms and Conditions. By agreeing to this quote you agree to these terms and conditions.",
  "*All Pricing is valid for 30 days only unless otherwise noted and subject to change without notice. With the high probability of tariffs and trade changes coming, prices are subject to rapid and unpredictable change without notice. We reserve the right to make real time adjustments to pricing as new or proposed tariffs and other global impacts spread.",
  "1. With Approved credit, Invoices are payable in 30 days from invoice date unless other terms are negotiated and noted on the quotation or invoice. By accepting delivery of goods, Buyer agrees to pay the invoice cost for those goods, and agrees to be bound to these contract terms. No acceptance may vary these terms unless specifically agreed in writing by Seller.",
  "2. Prices are subject to change at any time. Prices are for Products only and do not include taxes, shipping charges, freight, duties, and other charges or fees, such as fees for special packaging and labeling of the Products, permits, certificates, customs declarations and registration (collectively, \"Additional Fees\"). Customer is responsible for any Additional Fees.",
  "3. Seller retains title of all goods until full payment in good funds is received by Seller. Goods shipped or delivered are F.O.B. Seller’s place of business, and risk of loss passes to Buyer upon the earlier of delivery, or placement with a carrier. Buyer shall pay all applicable taxes and shipping costs.",
  "4. Payments on open accounts shall be applied to oldest invoices first. Balances 30 days or more accrue 1.5% service for each month or portion thereof such balance remains due. On any past due invoice, Arxys may charge (i) interest from the payment due date to the date of payment at 18% per annum, plus reasonable attorney fees and collection costs; or (ii) the maximum amount that is allowed under the applicable law if Arxys' interest rate is deemed invalid. At any time, Arxys may change the terms of Customer's credit, require financial data from Customer for verification of Customer's creditworthiness, require a bank guarantee or other security, or suspend any outstanding Orders of Customer.",
  "5. Seller is not liable for any incidental, consequential or special damages, interest, costs or expenses, or for loss of use, loss of data or lost profits or wages, whether or not Seller knew such damages might be incurred. Seller’s liability is in all cases limited to refunding the lower of the purchase price or the resale value of the goods at the time or return, at Seller’s option. Seller will not refund amounts paid for services rendered.",
  "6. Seller’s remedies for non-payment of this invoice shall include, in addition to all other remedies provided by law, the right to repossess any goods in the possession of Buyer, purchased from Seller, the title for which has not passed to Buyer. Buyer shall surrender such goods upon demand to Seller or Seller’s agent.",
  "7. Seller will accept return of non-conforming goods, only when returned in original condition and packaging for up to 30 days after receipt of product. Returns may be subject to a restocking fee of 50% of the invoice price, in Seller’s discretion. Special Order items are non-returnable. Buyer shall pay all shipping costs for returns under manufacturer’s warranties.",
  "8. In the event it becomes necessary for the Seller to incur any collection costs or suits to collect payment, the Buyer will be responsible for all such costs, including but not limited to court costs, attorney fees and collection agency fees on said collection/suit.",
  "9. Typical order processing and shipment time is 3 weeks after receipt of purchase order and approved credit terms or payment. Expedited orders when possible will incur additional expediting costs.",
  "DUE TO TARIFF TAX UNCERTAINTY AND VOLATILITY ALL PRICES AND QUOTES ARE SUBJECT TO CHANGE WITHOUT NOTICE. ALL TARIFFS ARE PASSED THROUGH",
  "A Microsoft Windows license is included with all systems. Systems ship with Microsoft Windows operating systems pre installed without media, but not setup which is the responsibility of the installer. Video management software & other application installers are included but NOT installed, on the OS drives. Installation, and configuration of the video management software and any other application to be performed by installer/integrator or end user. The installer of the system must install the appropriate VMS version, do all configuration and setup of users and cameras, databases etc. Latest Milestone & Avigilon best practice is to use SQL Standard on all installations over 300 cameras. SQL Standard is optional and not included with Milestone, Avigilon or any other VMS.",
  "DUE TO AI BASED MARKET VOLATILITY ALL PRICES AND QUOTES ARE SUBJECT TO CHANGE WITHOUT NOTICE.",
  "Prices subject to change without notice. All purchases subject to agreement to our Purchase Terms: www.arxys.com/purchaseterms If you prefer credit card payment to Net terms, a 3% processing fee will apply. All prices in US$. F.O.B is Arxys Factory unless specifically indicated above. Freight will be prepaid and added to the invoice and is NOT included unless specifically indicated.",
].join("\n\n");

// sha256 of the exact frozen text, carried alongside the text as an integrity
// stamp. Pure: same input always yields the same digest.
export function projectQuoteTermsSha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// The in-force terms, ready to freeze into a snapshot.
export function getProjectQuoteTerms(): ProjectQuoteTerms {
  return {
    version: PROJECT_QUOTE_TERMS_VERSION,
    text: PROJECT_QUOTE_TERMS_TEXT,
    sha256: projectQuoteTermsSha256(PROJECT_QUOTE_TERMS_TEXT),
  };
}
