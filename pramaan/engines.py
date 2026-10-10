"""One adapter per answer engine, all normalised to the same shape."""
from . import serp, sources

ENGINES = [
    ("google_ai_mode", "Google AI Mode"),
    ("google_ai_overview", "Google AI Overview"),
    ("bing_copilot", "Bing Copilot"),
    ("brave_ai_mode", "Brave AI Mode"),
]
OFFICIAL_SITES = ["gov.in", "nic.in", "rbi.org.in", "who.int"]


def _blocks(node, out, refs=None):
    """Walk any text_blocks tree and collect every snippet with its citation indexes."""
    if isinstance(node, list):
        for item in node:
            _blocks(item, out, refs)
    elif isinstance(node, dict):
        idx = list(node.get("reference_indexes") or [])
        idx += [c.get("reference_index") for c in node.get("citations") or [] if isinstance(c, dict)]
        if isinstance(node.get("snippet"), str):
            text = node["snippet"].replace("**", "").replace("__", "").strip()
            out.append({"text": text, "refs": [i for i in idx if i is not None]})
        if isinstance(node.get("table"), list):
            for row in node["table"]:
                if isinstance(row, list):
                    out.append({"text": " | ".join(str(c) for c in row), "refs": []})
        for k, v in node.items():
            if k not in ("snippet", "table", "references", "citations") and isinstance(v, (list, dict)):
                _blocks(v, out, refs)
    return out


def _refs(items):
    out = []
    for i, r in enumerate(items or []):
        link = r.get("link") or ""
        out.append({"index": r.get("index", i), "title": r.get("title") or r.get("source") or link,
                    "link": link, "domain": sources.domain(link), "kind": sources.kind(link)})
    return out


def _answer(engine, label, data, meta, header=None):
    blocks = _blocks(data.get("text_blocks") or [], [])
    if header:
        blocks.insert(0, {"text": header.strip(), "refs": []})
    refs = _refs(data.get("references"))
    text = "\n".join(b["text"] for b in blocks if b["text"])
    err = data.get("error")
    return {"engine": engine, "label": label, "status": "ok" if text else ("error" if err else "no_answer"),
            "error": err if not text else None, "text": text, "blocks": blocks, "references": refs, **meta}


def _empty(engine, label, msg, status="error"):
    return {"engine": engine, "label": label, "status": status, "error": msg, "text": "", "blocks": [],
            "references": [], "mode": None, "fetched_at": None}


def google_ai_mode(q):
    data, meta = serp.search({"engine": "google_ai_mode", "q": q, "gl": "in", "hl": "en"})
    return _answer("google_ai_mode", "Google AI Mode", data, meta)


def bing_copilot(q):
    data, meta = serp.search({"engine": "bing_copilot", "q": q})
    return _answer("bing_copilot", "Bing Copilot", data, meta, header=data.get("header"))


def brave_ai_mode(q):
    data, meta = serp.search({"engine": "brave_ai_mode", "q": q, "country": "in", "language": "en"})
    return _answer("brave_ai_mode", "Brave AI Mode", data, meta)


def google(q):
    """Plain Google India search: organic results plus the AI Overview, if Google shows one."""
    data, meta = serp.search({"engine": "google", "q": q, "gl": "in", "hl": "en", "google_domain": "google.co.in"})
    ov = data.get("ai_overview") or {}
    if ov.get("page_token") and not ov.get("text_blocks"):
        # The overview loads separately; its token expires in minutes, so fetch it now.
        try:
            ov, _ = serp.search({"engine": "google_ai_overview", "page_token": ov["page_token"]})
            ov = ov.get("ai_overview", ov)
        except serp.NoData:
            ov = {}
    overview = _answer("google_ai_overview", "Google AI Overview", ov, meta)
    if overview["status"] == "no_answer":
        overview["error"] = "Google showed no AI Overview for this query in India"
    return data, meta, overview


def official(q):
    """Organic results restricted to official domains: the yardstick the engines are compared with."""
    sites = " OR ".join(f"site:{s}" for s in OFFICIAL_SITES)
    data, meta = serp.search({"engine": "google", "q": f"{q} ({sites})", "gl": "in", "hl": "en",
                              "google_domain": "google.co.in"})
    return data, meta


def organic_evidence(*datas):
    seen, out = set(), []
    for data in datas:
        for r in (data or {}).get("organic_results") or []:
            link = r.get("link") or ""
            if link in seen:
                continue
            seen.add(link)
            snippet = " ".join(filter(None, [r.get("snippet")] + [
                h for h in (r.get("snippet_highlighted_words") or []) if h not in (r.get("snippet") or "")]))
            out.append({"title": r.get("title") or link, "link": link, "domain": sources.domain(link),
                        "kind": sources.kind(link), "snippet": snippet, "date": r.get("date")})
    return out
