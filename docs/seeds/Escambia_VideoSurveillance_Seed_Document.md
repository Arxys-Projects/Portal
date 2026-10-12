# Escambia Men's Prison Facility: Video Surveillance Seed Document

**Purpose:** Seed a new project calculation and quote for the video surveillance system.
**Project:** New Escambia Men's Prison Facility, Atmore, Alabama. DCM Project No. 2022182, GMC Project No. AMGM210063.
**Spec source:** Section 28 23 14 IP Video Surveillance System, 14 pages, with Addendum 15 changes (marked ADD 15) and RFI 403 / ADD 11 spares change.
**Quantity source:** "Escambia Final Camera Quote Quantities for RFQ R2.xlsx" (sheet "Quote Quantities").
**VMS platform:** Genetec Security Center.
**Hardware position:** Arxys VideoX hardware is being quoted. See Section 9 for the spec deviations this creates.
**Status:** Draft for calculator input. Items marked OPEN need confirmation (Section 10).

---

## 1. Project snapshot

| Item | Value |
|---|---|
| Total cameras | 1,548 (Hanwha 1,538, Axis 10) |
| Total recorded streams (one stream per imager) | 2,469 |
| Camera models | 14 (13 in the spec, plus PNM-7082RVD, which appears only on the quantity sheet) |
| Retention | 90 days continuous |
| Evidence archive | 250TB minimum, 1:1 failover |
| Camera standard | ONVIF, H.265, no audio recording |
| Spare cameras | 5% minimum, at least 2 per model (about 85 preliminary, Section 8.1) |

---

## 2. Recording parameters

All items come from Section 2.06.E unless another reference is given.

| Parameter | Requirement | Spec ref |
|---|---|---|
| Retention | Record continuously for 90 days for all cameras | 2.06.E |
| Frame rate method | Variable frame rate recording is acceptable | 2.06.E |
| Recorded resolution | Maximum resolution capability of the camera | 2.06.E.1 |
| Motion profile, on motion | 16 hours/day at 15 fps | 2.06.E.2 |
| Motion profile, no motion | 8 hours/day at 5 fps | 2.06.E.3 |
| Scene activity | 65% scene activity / image change for compression | 2.06.E.4 |
| Compression | H.265-20, taken as H.265 at compression/quality level 20 | 2.06.E.5 |
| Exception A, perimeter bi-spectral PTZ | Constant motion, 24 hours/day at 15 fps (9 Axis Q8752-E) | 2.06.E.6 |
| Exception B, cell cameras | Constant motion, 24 hours/day at 15 fps | 2.06.E.7 |
| Stream basis | Size storage for every video stream. Multi-sensor cameras are calculated per imager. | 2.04.A.1 |
| Audio | Prohibited. Built-in microphones disabled. No audio captured, transmitted or stored. | 2.03.B |
| Camera streams | At least two individually configured simultaneous streams per camera | 1.02.F |
| Camera ID | 16-character alphanumeric label burned into the video signal | 1.02.E |
| Network capacity | Network capacity indicated plus 15% spare. Does not include additional video storage. | 1.02.A |

**Derived values for the calculator (arithmetic only, no bitrate assumed):**

| Profile | Schedule | Average frame rate |
|---|---|---|
| Motion profile | 16 h at 15 fps plus 8 h at 5 fps | 11.67 fps (280 frame-hours/24 h) |
| Constant profile | 24 h at 15 fps | 15 fps |

Bitrate per stream is not given in the documents. It must come from your calculator or the camera datasheets at each stream's resolution.

---

## 3. Recording architecture, failover and redundancy (ADD 15)

| Requirement | Detail | Spec ref |
|---|---|---|
| Recording appliances | Server-based recording and storage appliances, sized for camera count, recording parameters and retention | 2.04.A, 2.06.B |
| Archiver failover | 1 failover archiver for every 2 primary archivers (primary count N means failover count = ceil(N/2)) | 2.04.A.2 |
| Failover behavior | Automatic, no operator intervention. Loss of any recording appliance must not interrupt recording. | 2.04.A.2 |
| Storage arrays | RAID 60, all drive bays fully populated | 2.04.A.3 |
| Directory servers | Dedicated Security Center Directory servers, with 1:1 failover Directory servers | 2.04.A.4 |
| Warranty | Minimum 5-year next business day hardware warranty with keep-your-drive | 2.04.A.5 |
| Recorder network | Each recording appliance connects to the video core switches with redundant 10/25GbE connections | 2.04.A.6 |
| Cluster file system | Removed from this project (Elmore baseline, except recording is server-based). Owner may add it later by change order. | 2.06.B |
| VMS sizing | Camera count proposed plus possible future expansion. ESC supplies all camera licenses. | 2.06.A.3, 2.06.A.5 |
| Core and edge network | Cisco Catalyst 9500 core, Meraki Enterprise edge, hardened managed switches for outside field cabinets | 2.07 |

**Count rule for the quote:** archiver count is an output of the storage and throughput calculation. Once primary archivers N is known, add ceil(N/2) failover archivers. Directory servers are a minimum of 1 primary plus 1 failover (OPEN: confirm minimum count).

---

## 4. Camera summary by model and quantity

Quantities are final per the quote sheet. Mount counts are listed in Appendix A.

| # | Mfr | Model | Spec type | Cameras | Imagers | Streams | Resolution per stream |
|---|---|---|---|---|---|---|---|
| 1 | Hanwha | XNV-C6083R | 2MP dome | 524 | 1 | 524 | 1920x1080 |
| 2 | Hanwha | XNV-C8083R | 6MP dome | 147 | 1 | 147 | 3328x1872 |
| 3 | Hanwha | XNV-C9083R | 4K/8MP dome | 128 | 1 | 128 | 3840x2160 |
| 4 | Hanwha | PNM-C7083RVD | 2x2MP dual dome | 85 | 2 | 170 | 1920x1080 |
| 5 | Hanwha | PNM-7082RVD | 2x2MP (OPEN: not in spec) | 4 | 2 | 8 | 1920x1080 (assumed) |
| 6 | Hanwha | PNM-C12083RVD | 2x6MP dual dome | 16 | 2 | 32 | 3328x1872 |
| 7 | Hanwha | PNM-C16083RVQ | 4x4MP quad dome, HPoE | 29 | 4 | 116 | 2592x1520 |
| 8 | Hanwha | PNM-9085RQZ | 4x5MP quad dome, HPoE | 240 | 4 | 960 | 2560x1920 |
| 9 | Hanwha | XNF-8010RV | "6MP" fisheye | 25 | 1 | 25 | 2048x2048 |
| 10 | Hanwha | XNF-9010RV | "12MP" fisheye | 1 | 1 | 1 | 3008x3008 |
| 11 | Hanwha | TNV-C7013RC | 3MP anti-ligature | 282 | 1 | 282 | 2048x1536 |
| 12 | Hanwha | TNV-8011C | 5MP anti-ligature | 57 | 1 | 57 | 2592x1944 |
| 13 | Axis | Q8752-E | Bi-spectral PTZ (perimeter thermal) | 9 | 2 | 18 | 9 visible 2MP, 9 thermal SVGA |
| 14 | Axis | Q1800-LE | 2MP LPR bullet | 1 | 1 | 1 | 1920x1080 |
| | | **Total** | | **1,548** | | **2,469** | |

Cell and non-cell split (relevant because cell cameras record 24 h at 15 fps):

| Model | Non-cell | Cell | Total |
|---|---|---|---|
| TNV-8011C (5MP) | 10 | 47 | 57 |
| TNV-C7013RC (3MP) | 145 | 137 | 282 |

---

## 5. Streams grouped by resolution

One stream per imager, recorded at each camera's maximum resolution.

| Resolution | MP class | Streams | Source models |
|---|---|---|---|
| 1920x1080 | 2MP | 712 | XNV-C6083R 524, PNM-C7083RVD 170, PNM-7082RVD 8, Q8752-E visible 9, Q1800-LE 1 |
| SVGA (thermal) | n/a | 9 | Q8752-E thermal imager |
| 2048x1536 | 3MP | 282 | TNV-C7013RC |
| 2592x1520 | 4MP | 116 | PNM-C16083RVQ (4 per camera) |
| 2560x1920 | 5MP | 960 | PNM-9085RQZ (4 per camera) |
| 2592x1944 | 5MP | 57 | TNV-8011C |
| 3328x1872 | 6MP | 179 | XNV-C8083R 147, PNM-C12083RVD 32 |
| 3840x2160 | 8MP / 4K | 128 | XNV-C9083R |
| 2048x2048 | fisheye | 25 | XNF-8010RV |
| 3008x3008 | fisheye | 1 | XNF-9010RV |
| | **Total** | **2,469** | |

---

## 6. Streams grouped by recording profile

| Profile | Streams | Composition |
|---|---|---|
| Constant, 24 h at 15 fps | 202 | 47 TNV-8011C cell, 137 TNV-C7013RC cell, 18 Q8752-E streams (9 cameras x 2 imagers) |
| Motion profile, 16 h at 15 fps plus 8 h at 5 fps | 2,267 | All other streams |
| **Total** | **2,469** | |

---

## 7. Calculator seed rows

One row per model and recording profile. Retention is 90 days and compression is H.265-20 for all rows.

| Row | Model | Cameras | Imagers | Streams | Resolution | Profile |
|---|---|---|---|---|---|---|
| 1 | XNV-C6083R | 524 | 1 | 524 | 1920x1080 | Motion |
| 2 | XNV-C8083R | 147 | 1 | 147 | 3328x1872 | Motion |
| 3 | XNV-C9083R | 128 | 1 | 128 | 3840x2160 | Motion |
| 4 | PNM-C7083RVD | 85 | 2 | 170 | 1920x1080 | Motion |
| 5 | PNM-7082RVD | 4 | 2 | 8 | 1920x1080 | Motion |
| 6 | PNM-C12083RVD | 16 | 2 | 32 | 3328x1872 | Motion |
| 7 | PNM-C16083RVQ | 29 | 4 | 116 | 2592x1520 | Motion |
| 8 | PNM-9085RQZ | 240 | 4 | 960 | 2560x1920 | Motion |
| 9 | XNF-8010RV | 25 | 1 | 25 | 2048x2048 | Motion |
| 10 | XNF-9010RV | 1 | 1 | 1 | 3008x3008 | Motion |
| 11 | TNV-C7013RC non-cell | 145 | 1 | 145 | 2048x1536 | Motion |
| 12 | TNV-C7013RC cell | 137 | 1 | 137 | 2048x1536 | Constant |
| 13 | TNV-8011C non-cell | 10 | 1 | 10 | 2592x1944 | Motion |
| 14 | TNV-8011C cell | 47 | 1 | 47 | 2592x1944 | Constant |
| 15 | Q8752-E visible | 9 | 1 | 9 | 1920x1080 | Constant |
| 16 | Q8752-E thermal | 9 | 1 | 9 | SVGA | Constant |
| 17 | Q1800-LE LPR | 1 | 1 | 1 | 1920x1080 | Motion |
| | **Total** | **1,548 cameras** | | **2,469** | | |

Check: motion rows sum to 2,267 streams and constant rows sum to 202.

---

## 8. Other requirements that affect the quote

### 8.1 Spares (3.07, RFI 403 ADD 11)

- Spare cameras: at least 5% of installed cameras (78 of 1,548), and never fewer than 2 spares of each camera model. Allocation is proportional to installed quantity.
- Preliminary allocation (the 2-per-model floor raises the total to 85): XNV-C6083R 26, TNV-C7013RC 14, PNM-9085RQZ 12, XNV-C8083R 7, XNV-C9083R 6, PNM-C7083RVD 4, and 2 each for the other 8 models. The final calculation goes to the Owner in the submittal.
- Spare monitor: 1 of each type provided. Spare workstation/CPU: 1 of each type. Spare switch: 1 of each type.
- Spare optics: 5 SFP/SFP+ modules and 2 QSFP modules of each type used.

### 8.2 Evidence Archive Server (2.08)

- Minimum 250TB. Basis: 4 incidents/day, 2 h each, 6 cameras, 8MP at 15 fps H.265, stored 2 years plus 20%.
- 1:1 failover server, same size and configuration, automatic failover (ADD 15).
- Genetec Archive Transfer. Every 12 hours the system finds new footage bookmarked as protected and copies it. A failed run alerts all video stations and system administrators.
- Footage stays on the evidence server until an administrator deletes it. Alerts required for the evidence server.

### 8.3 Genetec software scope

- Security Center enterprise-level VMS, sized for cameras proposed plus future expansion. ESC supplies all camera licenses.
- Restricted Security Area (RSA) Surveillance module: map-based perimeter monitoring, plugin package license at the required tier, one connection license per tracking system, per-camera analytics licensing. Analytics run on the camera edge where supported. Part numbers and quantities are coordinated with Genetec and ADOC IT before ordering.
- NLEF (electrified fence) integration: network I/O devices at the head-end, 1 supervised input per fence zone plus 1 per tamper and trouble contact, plus 7 system-wide summary status inputs (bypass, alarm, comms failure, tamper, power loss, low battery, voltage failure).
- Event-to-action: intercom and NLEF call-up with automatic bookmarking. Video is displayed only on operator action.
- LPR: 1 Axis Q1800-LE at the Vehicle Checkpoint building. Third-party LPR software and integration are by ADOC IT. ESC provides conduit, pathway, network ports and Security Center camera licensing.
- 16-character camera IDs and intercom call-up titles programmed as approved by the Owner.

### 8.4 Workstations and monitors (2.09)

- Mini and tower workstations: 16GB DDR4 ECC, Intel Xeon 3.0GHz or higher, NVIDIA RTX A1000 class or better (4GB, 4 DisplayPort), 512GB PCIe SSD, 4 monitors, latest Windows. Specified as Genetec-branded Dell or Dell Precision.
- Monitors: 42" (3840x2160 at 60Hz), 32" (2560x1440 at 60Hz), 27" (1920x1080 at 60Hz), all DisplayPort, 16:9.
- Spot video workstation displays 4 cameras on alarm, intercom call-up and manual activation.
- Workstation and monitor quantities are on the drawings. They are not on the quantity sheet.

### 8.5 Network, power and cabling (2.07, 2.10, 2.11)

- Switches: Meraki Enterprise edge, Cisco Catalyst 9500 core (licensing coordinated with ADOC IT). Hardened field-cabinet switches equal to SISPM1040-582-LRT (8-port PoE++), -362-LRT (4-port PoE+) and -384-LRT-C (8-port PoE+).
- PNM-C16083RVQ and PNM-9085RQZ require HPoE (IEEE 802.3bt, Class 6, Type 3). Provide injectors as required.
- Surge suppression equal to Northern Technologies TCS-HWR on all exterior camera power. Power isolation transformer for each camera on an external power source.
- Cabling: CommScope Uniprise Cat 6 (6NF4-i wet rated, 65N4+ non-wet), green, 24-port minimum patch panels, voltage drop limited to 5%.
- Thermal camera and mounting hardware included for the Axis Q8752-E. Q1800-LE mounts included.

---

## 9. Deviations from the spec when quoting Arxys VideoX hardware

The spec requires the following. Each item below needs a written deviation or a compliant alternative in the bid.

| Spec clause | Requirement | Arxys impact |
|---|---|---|
| 1.01.F | Video management system sole sourced to Genetec. Recording appliances, server platform, licensing and all modules are Genetec products. No substitutes, alternates or "approved equal." | Security Center software complies. The recording hardware is named as Genetec product. |
| 1.02.B | VMS server, recorder and workstation hardware are Genetec-branded Dell or Dell equipment configured as designed by Genetec and Dell. | Arxys appliances are not Dell. Deviation required. |
| 2.04.A, 2.04.D, 2.06.B | Genetec StreamVault recording and storage appliances, sized by Genetec, Genetec-branded Dell hardware. No approved equals. | Deviation required. Needs Owner and Genetec position before bid. |
| 2.08 | Evidence Archive Server (primary and failover) | Hardware scope falls under the same Dell/Genetec language. |
| 2.09 | Workstations: Genetec-branded Dell or Dell Precision | Workstations and monitors may be outside the Arxys scope. Confirm who supplies them. |
| 2.04.A.5 | 5-year NBD warranty with keep-your-drive | Confirm Arxys can support this. |
| 1.01.E | Manufacturer of the IP video system certifies the installation | Confirm the certification path with Genetec for non-Dell hardware. |

Legal and bid-compliance review of the deviation language is needed before submission.

---

## 10. Assumptions and open items

**Assumptions used in this document (confirmed with you):**

1. One recorded stream per imager. The second configurable camera stream is live-view only. Total recorded streams: 2,469.
2. "H.265-20" is H.265 at compression/quality level 20.
3. Storage inputs only. No bitrate or terabyte estimate is included.
4. Arxys VideoX hardware is being quoted. Requirements are listed neutrally with a deviation list.

**Assumptions I made (change them if wrong):**

5. Q8752-E counts as 2 streams per camera (visible and thermal), both at constant 24 h at 15 fps. The sheet shows resolution as "(PTZ) 2MP+SVGA".
6. Recording resolution uses the resolution stated in the spec for each model. The spec says "maximum resolution capability," so datasheet maxima should be confirmed.
7. The 15% network spare is a throughput and switch/port margin. It does not add cameras or storage. License count follows the camera count plus the spec's allowance for future expansion (OPEN: ask whether Genetec licenses should include 15% headroom).

**OPEN items:**

| # | Item | Why it matters |
|---|---|---|
| A | The sheet lists PNM-7082RVD (4 cameras). The spec lists PNM-C7083RVD only. | Model, resolution and imager count must be confirmed. It is carried here as 2x2MP at 1920x1080. |
| B | Fisheye labels disagree with pixel counts: XNF-8010RV "6MP" at 2048x2048 (about 4.2MP), XNF-9010RV "12MP" at 3008x3008 (about 9MP). | Affects the resolution input for 26 streams. |
| C | Thermal imager recording resolution for the Q8752-E (shown as SVGA). | Needed for the 9 thermal streams. |
| D | The quote sheet has no building, IDF or location grouping. | Archiver grouping and failover pairing may need a location split from the drawings. |
| E | Genetec license basis for multi-imager cameras (per imager or per camera). | Multi-imager cameras make up 1,304 of the 2,469 streams. |
| F | Minimum Directory server count, and whether Directory failover needs its own license tier. | Spec says dedicated Directory servers with 1:1 failover. |
| G | Elmore baseline design documents. | The addendum names Elmore as the baseline design, except for the recording architecture. Other carry-over requirements are unknown. |
| H | Workstation, monitor and spot monitor quantities, switches, and RSA/NLEF license quantities. | These come from the drawings. They are not on the quantity sheet. |
| I | Cluster file system change order. | Owner may reintroduce it later, which would change the recording architecture and cost. |

---

## Appendix A. Mount breakdown by model (from quote sheet)

Mount codes: C ceiling, W wall, XW exterior wall, P pole, PEND pendant, PARAPET parapet, CRNR interior corner, XCRNR exterior corner.

| Model | Mount breakdown | Total |
|---|---|---|
| Q1800-LE | P 1 | 1 |
| Q8752-E | P 9 | 9 |
| PNM-7082RVD | C 4 | 4 |
| PNM-9085RQZ | C 27, P 18, PARAPET 66, PEND 79, XCRNR 50 | 240 |
| PNM-C7083RVD | C 71, W 10, XCRNR 4 | 85 |
| PNM-C12083RVD | P 2, W 14 | 16 |
| PNM-C16083RVQ | C 27, PEND 2 | 29 |
| TNV-8011C | CRNR 57 (10 non-cell, 47 cell) | 57 |
| TNV-C7013RC | CRNR 282 (145 non-cell, 137 cell) | 282 |
| XNF-8010RV | C 25 | 25 |
| XNF-9010RV | C 1 | 1 |
| XNV-C6083R | C 186, P 71, W 265, XW 2 | 524 |
| XNV-C8083R | C 29, P 5, W 103, XW 10 | 147 |
| XNV-C9083R | P 41, W 36, XCRNR 2, XW 49 | 128 |

**Issued correction on the quote sheet:** Camera IDs N1-S14 and N1-S15 (XNV-C9083R) changed from schedule mount XW to P per CA/AS floor plans and adjacent pole-mounted cameras. Qty shift: 2. Project total is unchanged at 1,548.
