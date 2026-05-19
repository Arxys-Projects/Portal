# 0012 — Bandwidth gate dropped from server recommendation

- **Status**: Accepted — **Supersedes 0006**
- **Date**: 2026-05-18

## Context

ADR 0006 added `max_bandwidth_mbps` as a hard gate in the multi-unit packing algorithm and made the column `NOT NULL` on `server_specs`. At Step 5 (the submission save / recommendation algorithm) we received the VideoX configurator capacity table from the user — six rows for V200–V800 with `model`, `max_cameras`, `storage_min_tb`, `storage_max_tb`, and a description. **The configurator has no bandwidth-cap column.** The hardware team's "Google Sheet" referenced in ADR 0006 was an assumption that did not match what the configurator actually exposes.

Three options were on the table before the algorithm could be written:

- **A** — User supplies six per-model Mbps caps separately. Keeps ADR 0006 intact.
- **B** — Derive caps as `max_cameras × X` Mbps. Cheap and unblocking, but bandwidth becomes a redundant restatement of cameras, so the gate stops doing real work.
- **C** — Drop the gate. Algorithm picks on cameras + storage only.

## Options considered

- **Option A** — Most faithful to ADR 0006, but blocks Step 5 indefinitely until the hardware team produces a maintained sheet of Mbps numbers. That sheet does not exist today.
- **Option B** — Compiles, but every candidate's bandwidth check collapses to the camera check (since both scale with `max_cameras`). The constraint adds no new information.
- **Option C** — Drop the gate entirely. Accept that camera count + storage capacity are the two constraints we can defend with data we actually have. Sales engineering will still post-check bandwidth on quotes the same way they do today for the legacy PHP tool.

## Decision

**Option C.** Drop the bandwidth gate from the recommendation algorithm and from the schema's NOT NULL requirement on `server_specs.max_bandwidth_mbps`. The column stays — set to NULL for the six seeded rows, with a CHECK that any future value is > 0. If/when the hardware team produces real per-model caps the column can be populated and the gate re-introduced under a new ADR.

ADR 0006 is marked **Superseded by 0012**.

## Consequences

**Positive:**
- Step 5 ships with no fictional bandwidth caps. No partner ever sees a quote driven by a number we made up.
- The algorithm matches the legacy PHP tool's constraint surface, so quote parity with the old calculator is preserved on the dimensions we do have.

**Negative:**
- Real-world deployments that saturate a server's NIC will be quoted as if they fit. Sales engineering must keep the manual post-check that ADR 0006 was trying to retire.
- Reversing this (re-introducing the gate) costs a migration to NOT NULL plus a value for every existing row.

**When to revisit:**
- Hardware team publishes per-model Mbps caps as part of the configurator data, or
- Sales records two or more incidents where a quote sized correctly on cameras + storage was a poor fit on bandwidth, justifying the cost of the reintroduction.
