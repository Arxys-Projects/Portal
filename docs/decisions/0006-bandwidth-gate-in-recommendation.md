# 0006 — Bandwidth is a hard gate in the recommendation, not just an output

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

The PHP calculator computes total bandwidth (Mbps) from cameras × resolution × codec × complexity, and displays it as an output. It does not use bandwidth to filter or constrain server choice — only camera count and storage capacity drive the multi-unit packing.

Real-world deployments fail not on camera count or disk, but on the server's network throughput. A 64-camera 4K install at high complexity can saturate the NIC on a server that would otherwise be a fine fit on cameras+storage. Customers who exceeded the rated bandwidth would call support and the answer was "you needed a bigger box, sorry."

Going forward we're also seeding `server_specs.max_bandwidth_mbps` from a Google Sheet that the hardware team is maintaining.

## Decision

**Add `max_bandwidth_mbps` as a third constraint in the multi-unit packing algorithm.**

The unit count for a candidate SKU is:
```
units = max(
  1,
  ceil(cameras / max_cameras),
  ceil(storage_tb / max_storage_tb),
  ceil(bandwidth_mbps / max_bandwidth_mbps)    # new
)
```

`server_specs.max_bandwidth_mbps` is `NOT NULL` and has a `> 0` check constraint at the table level. SKUs with no bandwidth rating cannot be seeded — the Google Sheet ingestion process will reject rows missing this column.

## Consequences

**Positive:**
- Quotes match what the system can actually deliver. Fewer support escalations after deployment.
- Sales engineers don't need to manually post-check bandwidth on every quote.

**Negative:**
- A SKU that's fine on cameras+storage might now require more units than the old PHP tool quoted, raising the price. Sales needs to know this is happening so they can explain the bandwidth-driven uplift to existing partners. (Action item for whoever runs the change rollout.)
- Bandwidth is the most variable input — depends on codec efficiency, scene complexity, and motion levels. The factors used to compute it (resolution, codec, complexity tier) are simplifications. If they're too conservative, we over-quote; too aggressive, we under-quote. Keep the factor table in the Google Sheet auditable.
