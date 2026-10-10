"""Ask every engine the same question and compare the numbers they give."""
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

from . import claims, engines, llm, serp, sources


def _safe(fn, *args):
    try:
        return fn(*args)
    except serp.NoData as e:
        return e
    except Exception as e:  # one engine failing must not sink the report
        return e


def _officials(evidence, question):
    """Numeric statements on official pages, in Google's ranking order, each with its date."""
    unit = claims.expected_unit(question)
    out = []
    for ev in evidence:
        if ev["kind"] != "official":
            continue
        got = claims.extract(ev["snippet"], question)
        k = got["key"]
        if k and (not unit or k["unit"] == unit):
            d = claims.latest_date(ev.get("date") or "") or claims.latest_date(ev["snippet"])
            out.append({**k, "link": ev["link"], "title": ev["title"], "domain": ev["domain"], "snippet": ev["snippet"],
                        "values": got["values"], "date": d[0] if d else None, "date_text": d[1] if d else None})
    return out


def _official_match(claim, officials):
    """The official statement that contains the claim's figure, quoted around that figure."""
    for o in officials:
        for s in claims.sentences(o["snippet"]):
            for n in claims.numbers(s):
                if claims.same_claim(claim, n):
                    return {**o, "value": n["value"], "range_with": n.get("range_with"), "text": n["text"],
                            "sentence": s}
    return None


def _mix(refs):
    c = Counter(r["kind"] for r in refs)
    return {k: c.get(k, 0) for k in sources.KINDS}


def _notice(name, res, question):
    """A small progress event for one finished call, so the UI can fill each card as its engine answers."""
    if name == "official":
        n = 0 if isinstance(res, Exception) else sum(
            1 for e in engines.organic_evidence(res[0]) if e["kind"] == "official")
        return {"type": "record", "official_pages": n}
    a = res[2] if name == "google" and not isinstance(res, Exception) else res
    eid = "google_ai_overview" if name == "google" else name
    if isinstance(a, Exception):
        return {"type": "engine", "engine": eid, "status": "error", "figure": None}
    key = claims.extract(a["text"], question)["key"]
    return {"type": "engine", "engine": eid, "status": a["status"], "mode": a.get("mode"),
            "figure": claims.fmt(key["value"], key["unit"]) if key else None}


def run(question, on_event=None):
    t0 = time.time()
    question = question.strip()
    with ThreadPoolExecutor(5) as ex:
        jobs = {ex.submit(_safe, fn, question): name for name, fn in [
            ("google", engines.google), ("official", engines.official), ("google_ai_mode", engines.google_ai_mode),
            ("bing_copilot", engines.bing_copilot), ("brave_ai_mode", engines.brave_ai_mode)]}
        done = {}
        for f in as_completed(jobs):
            done[jobs[f]] = f.result()
            if on_event:
                on_event(_notice(jobs[f], done[jobs[f]], question))

    g = done["google"]
    google_data, overview = (None, engines._empty("google_ai_overview", "Google AI Overview", str(g))) \
        if isinstance(g, Exception) else (g[0], g[2])
    off = done["official"]
    official_data = None if isinstance(off, Exception) else off[0]

    answers = []
    for (eid, label), res in zip(engines.ENGINES, [done["google_ai_mode"], overview, done["bing_copilot"],
                                                   done["brave_ai_mode"]]):
        answers.append(engines._empty(eid, label, str(res)) if isinstance(res, Exception) else res)

    evidence = engines.organic_evidence(official_data, google_data)
    officials = _officials(evidence, question)

    proposals = llm.propose(question, answers, evidence) if llm.enabled() else {}
    unit = claims.expected_unit(question)
    for a in answers:
        got = claims.extract(a["text"], question)
        a["claim"], a["values"], a["claim_source"] = got["key"], got["values"], "rules"
        p = proposals.get(a["engine"])
        if p and llm.verified(p, a["text"]):
            a["claim"] = {"value": p["value"], "unit": p["unit"], "text": p["quote"], "sentence": p["quote"]}
            a["claim_source"] = "gemini, verified against the answer text"
        unit = unit or (a["claim"] or {}).get("unit")
        if a["claim"]:
            d = claims.latest_date(a["claim"]["sentence"]) or claims.latest_date(a["text"])
            a["claim"]["date"], a["claim"]["date_text"] = (d[0], d[1]) if d else (None, None)
        a["citation_mix"] = _mix(a["references"])
        a["official_citations"] = a["citation_mix"]["official"]

    v = verdict(answers, officials)
    return {"question": question, "unit": unit, "answers": answers, "official": v.pop("official"),
            "officials": officials, "evidence": evidence[:12], "verdict": v,
            "llm": llm.enabled(), "seconds": round(time.time() - t0, 1)}


def verdict(answers, officials):
    """Group the engines' key numbers, then set them against the official pages, dates included."""
    numbered = [a for a in answers if a.get("claim")]
    groups = []
    for a in numbered:
        for g in groups:
            if claims.same_claim(g["claim"], a["claim"]):
                g["engines"].append(a["label"])
                break
        else:
            groups.append({"claim": a["claim"], "label": claims.fmt(a["claim"]["value"], a["claim"]["unit"]),
                           "engines": [a["label"]]})
    groups.sort(key=lambda g: -len(g["engines"]))
    for a in answers:
        if a["status"] != "ok":
            a["match"] = "no_answer"
        elif not a.get("claim"):
            a["match"] = "no_number"
        elif not officials:
            a["match"] = "unchecked"
        else:
            a["match"] = "matches_official" if _official_match(a["claim"], officials) else "differs"

    # The official page shown is the one backing the majority figure, else Google's top official page.
    official = (_official_match(groups[0]["claim"], officials) if groups else None) or (
        officials[0] if officials else None)
    answered = sum(1 for a in answers if a["status"] == "ok")
    note = None
    if len(numbered) < 2:
        code, title = "insufficient", "Too few engines gave a number to compare"
    elif len(groups) > 1:
        code, title = "split", f"Engines disagree: {len(groups)} different answers"
    elif any(a["match"] == "matches_official" for a in numbered):
        code, title = "consensus_official", "All engines agree, and an official page states the same figure"
    elif officials:
        code, title = "consensus_conflict", "Engines agree, but the top official page states a different figure"
        latest = max((a["claim"] for a in numbered if a["claim"].get("date")), key=lambda c: c["date"], default=None)
        eng_date, off_date = (latest or {}).get("date"), official.get("date")
        if eng_date and off_date and eng_date > off_date:
            note = (f"The engines cite a change dated {latest['date_text']}, after the official page "
                    f"({official['date_text']}). The official page is probably outdated.")
        elif eng_date and off_date and off_date > eng_date:
            note = (f"The official page ({official['date_text']}) is newer than anything the engines cite "
                    f"({latest['date_text']}). The engines may be outdated.")
        else:
            note = "No dates to settle it. Read the official quote: it may be outdated or about a different case."
    else:
        code, title = "consensus", "All engines agree. No official page in the results states a figure to check against"
    for g in groups:
        g.pop("claim")
    return {"code": code, "title": title, "note": note, "groups": groups, "answered": answered,
            "numbered": len(numbered), "official": official,
            "matches_official": sum(1 for a in answers if a.get("match") == "matches_official")}
