// One-off Pipedrive catalog fix: two products carry the code VX5-V600-320, so
// push-prices.ts refuses the Pipedrive step (ADR 0150) and the deal picker
// offers the stale one.
//
//   #1443  linkable,     $41,659 (pre-July price), on 5 deals incl. open deal 5562
//   #1485  not linkable, $56,461 (current price),  on 1 lost deal (5033)
//
// The fix, PROPOSED and NOT yet approved: keep #1443, the product sales have been
// using, and move #1485 off the code to "VX5-V600-320-DUP-1485" (still not
// linkable, price untouched, nothing deleted). After that the code is unique and
// the next `push-prices.ts --target=pipedrive` run updates #1443's name and
// price to the portal's current row like any other SKU. Deal lines keep the
// prices they were entered at; open deal 5562 needs a look by hand either way.
//
//   node --env-file=.env.local --import tsx scripts/fix-pipedrive-v600-320-duplicate.ts             # dry run
//   node --env-file=.env.local --import tsx scripts/fix-pipedrive-v600-320-duplicate.ts --apply     # write (type CONFIRM)
//   node --env-file=.env.local --import tsx scripts/fix-pipedrive-v600-320-duplicate.ts --rollback  # undo (type CONFIRM)
//
// Writes only when Pipedrive still holds exactly the expected state, so a
// re-run, or a run after someone fixed it by hand, writes nothing.

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { env } from "../src/lib/env";
import { listPipedriveProducts, writePipedriveProduct } from "../src/lib/pipedrive/product-api";
import { usdPrice, type PdProduct } from "../src/lib/pipedrive/product-sync";

const CODE = "VX5-V600-320";
const KEEP_ID = 1443;
const MOVE_ID = 1485;
const MOVED_CODE = "VX5-V600-320-DUP-1485";

function show(p: PdProduct | undefined, id: number): string {
  if (!p) return `#${id} NOT FOUND`;
  return `#${p.id} code=${p.code} ${p.is_linkable ? "linkable" : "not linkable"} USD=${usdPrice(p)} "${p.name}"`;
}

async function confirm(): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) =>
    rl.question("Type CONFIRM to write, anything else to cancel: ", (answer) => {
      rl.close();
      resolve(answer.trim() === "CONFIRM");
    }),
  );
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--rollback") ? "rollback" : "dry-run";
  console.log(`=== fix-pipedrive-v600-320-duplicate [${mode}] ===\n`);

  const products = await listPipedriveProducts(env.PIPEDRIVE_API_TOKEN);
  const keep = products.find((p) => p.id === KEEP_ID);
  const move = products.find((p) => p.id === MOVE_ID);
  console.log(`  keep  ${show(keep, KEEP_ID)}`);
  console.log(`  move  ${show(move, MOVE_ID)}`);
  console.log(`  products coded ${CODE}: ${products.filter((p) => p.code === CODE).map((p) => `#${p.id}`).join(", ") || "none"}\n`);

  if (!move) {
    console.log(`#${MOVE_ID} is not in Pipedrive. Nothing to do.`);
    return;
  }

  const fromCode = mode === "rollback" ? MOVED_CODE : CODE;
  const toCode = mode === "rollback" ? CODE : MOVED_CODE;
  if (move.code !== fromCode) {
    console.log(`#${MOVE_ID} has code ${move.code}, not ${fromCode}. ${mode === "rollback" ? "Not moved, or already rolled back" : "Already moved"}; nothing to do.`);
    return;
  }
  if (mode !== "rollback" && (move.is_linkable || keep?.code !== CODE)) {
    console.log(`Pipedrive no longer matches the state this fix was written for (expected #${MOVE_ID} not linkable and #${KEEP_ID} coded ${CODE}). Stopping; nothing written.`);
    process.exitCode = 1;
    return;
  }

  // Prices go back as they are: an omitted `prices` on v2 can reset the price.
  const body = {
    code: toCode,
    is_linkable: false,
    prices: (move.prices ?? []).map((p) => ({ price: Number(p.price), currency: p.currency })),
  };
  console.log(`Planned write: PATCH /api/v2/products/${MOVE_ID} ${JSON.stringify(body)}`);

  if (mode === "dry-run") {
    console.log("\n[DRY RUN] No writes performed.");
    return;
  }
  if (!(await confirm())) {
    console.log("Cancelled. Nothing written.");
    return;
  }
  const after = await writePipedriveProduct(env.PIPEDRIVE_API_TOKEN, "PATCH", `/products/${MOVE_ID}`, body);
  console.log(`\nWritten: ${show(after, MOVE_ID)}`);
  if (mode === "apply") {
    console.log(`Next: node --env-file=.env.local --import tsx scripts/push-prices.ts --target=pipedrive --dry-run`);
    console.log(`      should now list ${CODE} #${KEEP_ID} under UPDATED (name, price).`);
  }
}

main().catch((err) => {
  console.error("fix-pipedrive-v600-320-duplicate failed:", err);
  process.exit(1);
});
