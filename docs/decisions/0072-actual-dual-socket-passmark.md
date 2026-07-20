# 0072 — Use actual dual-socket Passmark scores instead of 2× single

- **Status**: Accepted
- **Date**: 2026-06-24

## Context

The comparison spreadsheet needs CPU Passmark scores for dual-socket servers (Genetec SV-4041EX-R28 with 2× Xeon Gold 5416S and SV-7041EX-R6S with 2× Xeon Silver 4416+). The original data used 2× the single-socket score as a proxy, which is simple but incorrect: real dual-socket systems suffer NUMA overhead, memory bandwidth saturation, and inter-socket communication latency that reduce effective multi-socket scaling to roughly 80–90% of 2× theoretical.

Passmark's cpubenchmark.net publishes actual measured dual-CPU scores from real hardware submissions, distinct from single-CPU scores.

## Options considered

- **2× single-socket score**: simple, reproducible, but inflates by 25–32% vs. real hardware.
- **Actual dual-socket measured score from cpubenchmark.net**: reflects real NUMA behaviour; the authoritative benchmark source; used for all single-socket scores already.
- **Estimate with NUMA scaling factor (e.g. 1.8×)**: a reasonable middle ground but arbitrary — different CPU families scale differently.

## Decision

Use the actual dual-socket scores published on cpubenchmark.net, the same source used for all single-socket scores in the sheet. The corrections are:

| Model | CPU | Old (2×) | New (actual) | Delta |
|---|---|---|---|---|
| SV-4041EX-R28 | 2× Xeon Gold 5416S | 71,162 | 53,750 | −25% |
| SV-7041EX-R6S | 2× Xeon Silver 4416+ | 87,318 | 70,032 | −20% |

NVR6 Premium (2× Xeon Silver 4410Y): existing value of 42,443 closely matches the actual dual score of 42,522 and is left unchanged.

## Consequences

**Positive:** Passmark scores are internally consistent (single and dual both from measured hardware). Genetec dual-socket models are no longer artificially boosted relative to Milestone and Avigilon single-socket models.

**Negative:** The corrected dual-socket scores make Genetec's top-end models look less dominant on CPU benchmarks — which is fine, since the old scores were wrong.

**When to revisit:** If cpubenchmark.net updates their dual-socket scores for these CPUs (scores can drift slightly as more submissions arrive), re-run `scripts/update_comparison_data.py` with the new values.
