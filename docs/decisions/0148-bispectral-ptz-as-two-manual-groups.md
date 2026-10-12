# 0148 - A bispectral camera is sized as two manual groups in a submission; the catalog deferral stands

- **Status**: Accepted. Narrows [0134](./0134-thermal-cameras-deferred-from-camera-specs.md) for submission sizing only; 0134's `camera_specs` deferral is unchanged.
- **Date**: 2026-10-12

## Context

ADR 0134 kept every thermal and bispectral camera out of `camera_specs`, because
nobody had decided whether a thermal stream counts toward storage sizing, or how.
Its revisit condition was "when a partner requests a quote involving a thermal or
bispectral camera". Escambia Men's Prison is that quote: 9 AXIS Q8752-E bispectral
PTZs on the perimeter.

The spec answers the counting question for this project. 2.04.A.1 requires storage
for every video stream, with multi-sensor cameras calculated per imager, and
2.06.E.6 records the Q8752-E continuously at 15 fps. The seed document lists the
streams as 9 visible at 2MP plus 9 thermal at SVGA. Axis's datasheet gives a 1920x1080
visible channel and a 640x480 thermal sensor; the encoded thermal stream size is an
open item (OPEN C). A calculator group has one resolution.

## Options considered

- **Leave the thermal streams out.** Fails 2.04.A.1 and under-sizes.
- **Seed a `camera_specs` row with `sensor_count: 2` at the visible resolution.**
  The option ADR 0134 rejected. It also bills the thermal channel as 1080p and
  changes the shared catalog for one project.
- **Two no-model groups in the submission.** Visible at its resolution, thermal at
  its own bucket, catalog untouched. Chosen.

## Decision

In a submission, a bispectral camera is entered as **two groups with no camera-model
link**: the visible channel at its maximum visual resolution, and the thermal channel
at the `RESOLUTIONS` bucket for its recorded stream (SVGA on Escambia, per the seed
document, until OPEN C is answered). Both use the same recording profile the spec
gives the camera. The thermal row carries the same physical cameras as the visible
row, so it adds streams, not cameras.

The thermal stream is billed with the ordinary visible-light bitrate model; there is
no thermal coefficient and none is invented here.

## Consequences

**Positive:** per-imager sizing as the spec requires, with no catalog or schema
change. The thermal share is small (6.41 TB of 12,421.85 TB on Escambia), so an error
in how it is billed cannot move the recommendation.

**Negative:** thermal bitrate is unmeasured and assumed to behave like visible video
at the same pixel count. The portal shows 18 "cameras" for 9 devices. The two groups
carry no model link, so the model name lives in the group name.

**When to revisit:** when 0134 is revisited with a catalog representation for
thermal channels, or when a measured thermal-stream bitrate is available.
