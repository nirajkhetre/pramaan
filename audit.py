"""Ask every benchmark question to all engines and write the scorecard.

python audit.py            # uses recordings where present, live SerpApi otherwise
python audit.py --fresh    # ignore recordings (costs ~6 searches per question)
"""
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from pramaan import check, claims, engines, serp, sources

ROOT = Path(__file__).resolve().parent


def cell_label(c):
    if not c:
        return None
    if c.get("range_with") is not None:
        lo, hi = sorted([c["value"], c["range_with"]])
        if c["unit"] == "₹":
            return f"{claims.fmt(lo, '₹')}–{claims.fmt(hi, '₹')}"
        return f"{lo:g}–{claims.fmt(hi, c['unit'])}"
    return claims.fmt(c["value"], c["unit"])


def main(fresh=False):
    qs = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
    if fresh:
        serp.search.__defaults__ = (True,)
    with ThreadPoolExecutor(3) as ex:
        reports = list(ex.map(check.run, [item["q"] for item in qs]))
    for i, (item, r) in enumerate(zip(qs, reports), 1):
        v = r["verdict"]
        print(f"[{i}/{len(qs)}] {v['code']:<20} {item['q']}")
        for a in r["answers"]:
            print(f"      {a['label']:<20} {claims.fmt((a['claim'] or {}).get('value'), (a['claim'] or {}).get('unit', '')):<16} {a['match']}")
        o = r["official"]
        print(f"      {'official':<20} {claims.fmt(o['value'], o['unit']) if o else '—'}  {o['domain'] if o else ''}")

    eng = []
    for eid, label in engines.ENGINES:
        rows = [next(a for a in r["answers"] if a["engine"] == eid) for r in reports]
        eng.append({"engine": eid, "label": label,
                    "answered": sum(a["status"] == "ok" for a in rows),
                    "numbered": sum(bool(a["claim"]) for a in rows),
                    "matched": sum(a["match"] == "matches_official" for a in rows),
                    "differed": sum(a["match"] == "differs" for a in rows),
                    "citations": sum(len(a["references"]) for a in rows),
                    "official_citations": sum(a["official_citations"] for a in rows)})

    codes = [r["verdict"]["code"] for r in reports]
    comparable = len([c for c in codes if c != "insufficient"])
    split, verified, conflict = codes.count("split"), codes.count("consensus_official"), codes.count("consensus_conflict")
    agree = comparable - split
    kinds = {k: sum(a["citation_mix"][k] for r in reports for a in r["answers"]) for k in sources.KINDS}
    cites = sum(kinds.values()) or 1
    pct = {k: round(v / cites * 100) for k, v in kinds.items()}
    hijacked = len({e["link"] for r in reports for e in r["evidence"] if e["kind"] == "hijacked"})
    cited_hijacked = sorted({(a["label"], r["question"]) for r in reports for a in r["answers"]
                             if a["citation_mix"]["hijacked"]})
    headline = (f"Four AI search engines agreed on the number for {agree} of {comparable} everyday Indian questions. "
                f"But only {pct['official']}% of their {cites} citations were official sources, while "
                f"{pct['commercial']}% were companies selling loans, insurance, lab tests or medicines.")
    if cited_hijacked:
        who = sorted({w for w, _ in cited_hijacked})
        headline += (f" {' and '.join(who)} cited a hijacked page (spam injected into a university site) "
                     f"as a source on {len(cited_hijacked)} question{'s' if len(cited_hijacked) > 1 else ''}.")
    subline = (f"An official page in Google's results stated the engines' figure on {verified} questions. On "
               f"{conflict}, the top official page gave a different figure. Pramaan shows its date and wording so "
               f"you can see whether the page is outdated."
               + (f" Google's results also included {hijacked} hijacked pages: real sites serving spam injected from another host."
                  if hijacked else ""))
    out = {"run_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "engines": eng,
           "summary": {"headline": headline, "subline": subline, "split": split, "conflict": conflict,
                       "verified": verified, "comparable": comparable, "agree": agree,
                       "citation_kinds": kinds, "citation_pct": pct, "hijacked": hijacked},
           "questions": [{
               "question": r["question"], "verdict": r["verdict"]["code"],
               "official": claims.fmt(r["official"]["value"], r["official"]["unit"]) if r["official"] else None,
               "official_link": r["official"]["link"] if r["official"] else None,
               "cells": [{"engine": a["engine"], "match": a["match"], "label": cell_label(a["claim"])}
                         for a in r["answers"]]} for r in reports]}
    (ROOT / "audit").mkdir(exist_ok=True)
    (ROOT / "audit" / "results.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
    print("\n" + headline + "\n" + subline)


if __name__ == "__main__":
    main(fresh="--fresh" in sys.argv)
