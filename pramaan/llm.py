"""Optional Gemini step: it proposes each engine's key number, code verifies it.

A proposal is only used if its quote appears verbatim in the engine's answer and
the number it claims can be read back out of that quote by the rule extractor.
Without GEMINI_API_KEY the app runs on rules alone.
"""
import json
import os
import re
import urllib.error
import urllib.request

from . import claims

MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")


_unavailable = False  # set once Gemini refuses the key (no credits, bad model), then rules only


def enabled():
    return bool(os.environ.get("GEMINI_API_KEY")) and os.environ.get("PRAMAAN_NO_LLM") != "1" and not _unavailable


def _norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()


def verified(p, text):
    try:
        value, quote = float(p["value"]), p["quote"]
    except (KeyError, TypeError, ValueError):
        return False
    if not quote or _norm(quote) not in _norm(text):
        return False
    return any(claims.same(n["value"], value, n["unit"]) or claims.same(n.get("range_with"), value, n["unit"])
               for n in claims.numbers(quote))


_probed = False


def probe():
    """One tiny call so the UI never claims Gemini is on when the key cannot be used."""
    global _probed
    if _probed or not enabled():
        return
    _probed = True
    propose("ping", [], [])


def propose(question, answers, evidence):
    unit = claims.expected_unit(question) or "whatever unit the question implies"
    parts = [f"QUESTION: {question}\nEXPECTED UNIT: {unit}\n"]
    for a in answers:
        if a["text"]:
            parts.append(f"=== ENGINE {a['engine']} ===\n{a['text'][:3000]}\n")
    off = "\n".join(e["snippet"] for e in evidence if e["kind"] == "official")[:3000]
    if off:
        parts.append(f"=== ENGINE official ===\n{off}\n")
    prompt = (
        "For each ENGINE block below, find the single number that most directly answers the QUESTION. "
        "Return JSON: {\"<engine id>\": {\"value\": number, \"unit\": string, \"quote\": string}}. "
        "value: plain number in base units (convert lakh=100000, crore=10000000; percent as 7.1 not 0.071). "
        "unit: one of %, ₹, mg/dL, mmHg, years, months, weeks, days, km/h, or a short unit. "
        "quote: copy the shortest exact phrase from that block that contains the number, character for character. "
        "Omit an engine if its block gives no direct numeric answer. Do not use outside knowledge.\n\n"
        + "\n".join(parts))
    body = {"contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"}}
    req = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
        data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read().decode("utf-8"))
        text = out["candidates"][0]["content"]["parts"][0]["text"]
        data = json.loads(text)
        return {k: v for k, v in data.items() if isinstance(v, dict)}
    except urllib.error.HTTPError as e:
        global _unavailable
        _unavailable = e.code in (400, 401, 402, 403, 404)
        return {}
    except Exception:
        return {}  # rules still produce a full report
