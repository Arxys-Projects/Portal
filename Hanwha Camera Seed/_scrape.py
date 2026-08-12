#!/usr/bin/env python3
"""Pull max resolution for Hanwha models from the official hanwhavision.com
product pages.

The product pages are Next.js RSC: the spec table never appears in the
server-rendered DOM (so a markdown-converting fetch sees nothing), but the
underlying data IS present in the static HTML inside self.__next_f flight
chunks. This reads the Resolution spec row from there, which is the same
value the rendered spec table shows.

Resolution row = the spec whose SpecLabelCode is NW-SPCD059002. Its Value is a
descending, comma-separated list of WxH; the brief wants the FIRST (highest).

Official source only — no reseller listings.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import time

BASE = "https://www.hanwhavision.com/us/products/product-details/"
RES_CODE = "NW-SPCD059002"
WH = re.compile(r"^(\d{3,5})\s*[xX]\s*(\d{3,5})$")


def fetch(model: str) -> str | None:
    url = BASE + model.lower()
    for attempt in range(3):
        p = subprocess.run(
            ["curl", "-sL", "--max-time", "45", "-A",
             "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
             url],
            capture_output=True, text=True,
        )
        if p.returncode == 0 and len(p.stdout) > 5000:
            return p.stdout
        time.sleep(1.5 * (attempt + 1))
    return None


def unescape(h: str) -> str:
    # Flight chunks are JSON-string-escaped inside <script> bodies.
    h = h.replace('\\"', '"').replace("\\\\", "\\")
    h = h.replace("\\u003c", "<").replace("\\u003e", ">").replace("\\u0026", "&")
    h = h.replace("\\r", " ").replace("\\n", " ").replace("\\t", " ")
    return h


def channels_for(text: str, code: str) -> list[dict]:
    """Return every {ChannelNo, Value} recorded under a given SpecLabelCode."""
    out = []
    for m in re.finditer(r'"SpecLabelCode"\s*:\s*"' + re.escape(code) + r'"', text):
        seg = text[m.start(): m.start() + 4000]
        ch_no = re.search(r'"ChannelNo"\s*:\s*(\d+)', seg)
        val = re.search(r'"Value"\s*:\s*"([^"]*)"', seg)
        if val:
            out.append({
                "channel": int(ch_no.group(1)) if ch_no else 0,
                "value": val.group(1),
            })
    return out


def parse_model(model: str) -> dict:
    html = fetch(model)
    if html is None:
        return {"model": model, "ok": False, "error": "fetch failed"}
    text = unescape(html)

    title = re.search(r'"children"\s*:\s*"([^"]*?' + re.escape(model) + r'[^"]*?)"', text)
    rows = channels_for(text, RES_CODE)
    if not rows:
        return {
            "model": model, "ok": False, "error": "no Resolution spec row",
            "title": title.group(1) if title else None,
        }

    per_channel = []
    for r in rows:
        first = r["value"].split(",")[0].strip()
        m = WH.match(first)
        if not m:
            continue
        per_channel.append({
            "channel": r["channel"],
            "width": int(m.group(1)),
            "height": int(m.group(2)),
            "full_list": r["value"][:180],
        })
    if not per_channel:
        return {"model": model, "ok": False, "error": "Resolution row unparseable",
                "raw": rows[0]["value"][:180]}

    # Distinct channels = independent imagers reporting their own resolution.
    by_ch: dict[int, dict] = {}
    for c in per_channel:
        by_ch.setdefault(c["channel"], c)
    chans = sorted(by_ch.values(), key=lambda c: c["channel"])
    top = max(chans, key=lambda c: c["width"] * c["height"])

    return {
        "model": model,
        "ok": True,
        "max_width": top["width"],
        "max_height": top["height"],
        "mp": round(top["width"] * top["height"] / 1e6, 2),
        "channel_count": len(chans),
        "channels": chans,
        "title": title.group(1) if title else None,
        "source_url": BASE + model.lower(),
    }


def main():
    models = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_flag = [a for a in sys.argv[1:] if a.startswith("--out=")]
    results = []
    for i, mdl in enumerate(models, 1):
        r = parse_model(mdl)
        results.append(r)
        if r["ok"]:
            print(f"[{i}/{len(models)}] {mdl}: {r['max_width']}x{r['max_height']} "
                  f"({r['mp']}MP) ch={r['channel_count']}", flush=True)
        else:
            print(f"[{i}/{len(models)}] {mdl}: FAIL {r['error']}", flush=True)
    if out_flag:
        path = out_flag[0].split("=", 1)[1]
        with open(path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nwrote {path}")


if __name__ == "__main__":
    main()
