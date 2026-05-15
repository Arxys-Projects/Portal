# 0003 — Server recommendation uses PHP multi-unit packing algorithm

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

There are two existing implementations of "given N cameras + S TB of storage + B Mbps bandwidth, recommend a server config":

1. **The PHP backend** (`reference/arxys-calculator-mailer-FINAL.php`, function `arxys_get_optimal_server_config`): a multi-unit packing algorithm. Given a candidate SKU with `max_cam_per_unit` and `max_storage_TB`, it computes `units = max(1, ceil(N / max_cam), ceil(S / max_storage))` and returns the cheapest SKU/units combination that fits the workload.
2. **The React calculator HTML** (`reference/Arxys-React-calculator.clean.html`, function `findRecommendedServer`): defined but never called. It's a single-unit filter — finds the smallest single SKU that fits, fails if none does.

These produce different answers when no single SKU can hold the workload. The PHP version says "use 3× model X." The React version says "no match."

## Options considered

- **Port the PHP multi-unit packer.** Handles workloads that exceed any single unit's capacity. Matches the existing customer-facing tool, so quotes are consistent with what partners have seen historically.
- **Port the React single-unit filter.** Simpler code, but it would silently refuse to quote configurations that the PHP tool quotes today. Regression for partners.
- **Write a new algorithm.** Scope risk for Phase 1.

## Decision

**Port the PHP multi-unit packing algorithm.** Server-side only — partners hit `/api/submit-calculation`, the algorithm runs there, the result lives in `submissions.recommended_product_id` and `recommended_units`.

Algorithm shape:
```
for each active server_specs row, ordered by total cost:
  units_for_cameras = ceil(cameras / max_cameras)
  units_for_storage = ceil(storage_tb / max_storage_tb)
  units_for_bandwidth = ceil(bandwidth_mbps / max_bandwidth_mbps)   # new gate, see ADR 0006
  units = max(1, units_for_cameras, units_for_storage, units_for_bandwidth)
  total_cost = units * unit_price_for_partner(product_id)
  pick the (product_id, units) pair with the lowest total_cost
```

The React file's `findRecommendedServer` will not be ported. The client only collects inputs and renders the result.

## Consequences

**Positive:**
- Quote parity with the legacy PHP calculator. No surprise regressions for existing partners.
- Handles large workloads cleanly via stacking.
- One source of truth (server-side), so we can audit recommendations from `submissions` rows.

**Negative:**
- The packing algorithm needs careful unit tests once we write it. The PHP version has been battle-tested in production, but the TS port is new code and could regress.
- "Best" is defined as "lowest total price" — not "fewest units" or "lowest rack-U." If a partner wants a single-box solution, they'll need to override manually. Documenting this in the API response shape (return alternatives, not just the winner) is a Phase-1.5 enhancement.
