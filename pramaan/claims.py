"""Deterministic numeric-claim extraction and comparison.

An answer engine's prose is split into sentences; every number is read with its
unit (handling ranges like "70-100 mg/dL", Indian money words like "₹7 lakh"),
and the sentence most relevant to the question supplies the engine's key claim.
"""
import re

UNIT_ALIASES = {
    "%": "%", "percent": "%", "per cent": "%", "pc": "%",
    "mg/dl": "mg/dL", "mmol/l": "mmol/L", "mmhg": "mmHg",
    "year": "years", "years": "years", "yrs": "years", "yr": "years",
    "month": "months", "months": "months", "week": "weeks", "weeks": "weeks",
    "day": "days", "days": "days", "hour": "hours", "hours": "hours",
    "km/h": "km/h", "kmph": "km/h", "kg": "kg", "mg": "mg", "ml": "ml",
}
MONEY_WORDS = {"lakh": 1e5, "lakhs": 1e5, "lac": 1e5, "lacs": 1e5, "crore": 1e7, "crores": 1e7,
               "cr": 1e7, "thousand": 1e3, "k": 1e3}

NUM = r"\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?"
TOKEN = re.compile(
    r"(?P<cur>₹|rs\.?|inr|rupees)?\s?(?P<num>" + NUM + r")\s?"
    r"(?P<mul>lakhs?|lacs?|crores?|cr\b|thousand|k\b)?\s?"
    r"(?P<unit>%|per ?cent|pc\b|mg/dl|mmol/l|mmhg|years?\b|yrs?\b|months?\b|weeks?\b|days?\b|hours?\b"
    r"|km/h|kmph|kg\b|mg\b|ml\b|rupees)?",
    re.I)
RANGE_GLUE = re.compile(r"^\s*(?:-|–|—|to|and|or)\s*$", re.I)

EXPECT = [  # (unit, question keywords)
    ("mg/dL", ["sugar", "glucose", "cholesterol", "triglyceride", "hba1c"]),
    ("mmHg", ["blood pressure", "bp "]),
    ("km/h", ["speed limit", "speed"]),
    ("%", ["rate", "interest", "percent", "%", "gst", "inflation", "repo", "tds", "contribution",
           "dearness", "cess", "return", "share", "reservation", "quota", "turnout"]),
    ("₹", ["fine", "penalty", "price", "cost", "fee", "limit", "salary", "income", "exemption",
           "deduction", "rebate", "amount", "rupees", "₹", "pension", "wage", "subsidy", "cover",
           "loan", "challan", "insurance", "mrp", "stipend", "allowance"]),
    ("weeks", ["weeks", "maternity", "pregnan"]),
    ("years", ["age", "years", "old", "tenure", "jail", "imprisonment", "term", "retirement"]),
    ("days", ["days", "notice period"]),
]
STOP = set("what is the a an of in for to and or on by under with how much many current currently "
           "india indian latest new as per according does do i my are was be per".split())


def keywords(question):
    return [w for w in re.findall(r"[a-z0-9₹%]+", question.lower()) if w not in STOP and len(w) > 1]


def expected_unit(question):
    q = " " + question.lower() + " "
    for unit, words in EXPECT:
        if any(w in q for w in words):
            return unit
    return None


def sentences(text):
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z₹\d(])|\n+|\s•\s", text or "")
    return [p.strip(" -*•\t") for p in parts if p and len(p.strip()) > 3]


def _value(num, mul):
    v = float(num.replace(",", ""))
    if mul:
        v *= MONEY_WORDS.get(mul.lower().rstrip("."), 1)
    return v


def numbers(sentence):
    """All (value, unit, span_text) in a sentence; range starts inherit the end's unit."""
    found = []
    for m in TOKEN.finditer(sentence):
        cur, num, mul, unit = m.group("cur"), m.group("num"), m.group("mul"), m.group("unit")
        u = UNIT_ALIASES.get((unit or "").lower().replace(" ", ""), UNIT_ALIASES.get((unit or "").lower()))
        if (unit or "").lower() == "rupees" or cur or (mul and not u):
            u = "₹"
        v = _value(num, mul)
        if not u and 1900 <= v <= 2100 and "." not in num and "," not in num:
            continue  # a year, not a quantity
        found.append({"value": v, "unit": u or "", "text": m.group(0).strip(), "start": m.start(), "end": m.end()})
    for a, b in zip(found, found[1:]):
        if not a["unit"] and b["unit"] and RANGE_GLUE.match(sentence[a["end"]:b["start"]] or "x"):
            a["unit"], a["range_with"] = b["unit"], b["value"]
            b["range_with"] = a["value"]
    return found


def extract(text, question):
    """Return {key: claim|None, values: [...]} for one engine's answer."""
    unit = expected_unit(question)
    kws = keywords(question)
    # "per 10 grams" in the question: a figure "per gram" answers a different question.
    per = re.search(r"\bper\s+((?:\d+(?:\.\d+)?\s*)?[a-z]+)", question.lower())
    per = re.sub(r"s$", "", per.group(1)).replace(" ", "") if per else None
    best, values = None, []
    # Answer engines lead with their direct answer, so the key claim is the first
    # figure in the expected unit that sits in a sentence about the question.
    # Later figures (conditions, exceptions, targets for patients) stay as context.
    for i, s in enumerate(sentences(text)):
        low = s.lower()
        on_topic = any(k in low for k in kws)
        for j, n in enumerate(numbers(s)):
            if unit and n["unit"] != unit:
                continue
            if not unit and not n["unit"]:
                continue
            values.append(n["value"])
            score = (100 if on_topic else 0) - i - j * 0.01
            if per:
                after = re.sub(r"[\s,]", "", s[n["end"]:n["end"] + 30].lower())
                if re.match(r"(?:per|for|/)(?:a|one)?" + re.escape(per), after):
                    score += 50
                elif re.match(r"(?:per|/)", after):
                    score -= 50
            if best is None or score > best["score"]:
                best = {**n, "sentence": s, "score": score}
    if best:
        best = {k: best[k] for k in ("value", "unit", "text", "sentence") if k in best} | (
            {"range_with": best["range_with"]} if "range_with" in best else {})
    return {"key": best, "values": sorted(set(values)), "unit": unit}


def same(a, b, unit=""):
    if a is None or b is None:
        return False
    tol = 0.01 if unit == "%" else max(abs(a), abs(b)) * 0.01
    return abs(a - b) <= tol


def same_claim(a, b):
    """Two claims agree if they share a unit and any endpoint ("70–100" vs "below 100")."""
    if not a or not b or a["unit"] != b["unit"]:
        return False
    ends_a = [a["value"]] + ([a["range_with"]] if a.get("range_with") is not None else [])
    ends_b = [b["value"]] + ([b["range_with"]] if b.get("range_with") is not None else [])
    return any(same(x, y, a["unit"]) for x in ends_a for y in ends_b)


MONTHS = {m: i for i, m in enumerate(
    "jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
DATE = re.compile(
    r"(?:(?P<d1>\d{1,2})(?:st|nd|rd|th)?\s+(?P<m1>[A-Za-z]{3,9})\.?,?\s+(?P<y1>(?:19|20)\d\d))"
    r"|(?:(?P<m2>[A-Za-z]{3,9})\.?\s+(?P<d2>\d{1,2})(?:st|nd|rd|th)?,?\s+(?P<y2>(?:19|20)\d\d))"
    r"|(?:(?P<m3>[A-Za-z]{3,9})\s+(?P<y3>(?:19|20)\d\d))"
    r"|(?:(?:act|amendment|since|from|effective|in|of|budget)\s*,?\s*(?P<y4>(?:19|20)\d\d))", re.I)


def latest_date(text):
    """Most recent date mentioned in text, as (YYYY-MM-DD, original text), or None."""
    best = None
    for m in DATE.finditer(text or ""):
        g = m.groupdict()
        mon_name = (g["m1"] or g["m2"] or g["m3"] or "")[:3].lower()
        if mon_name and mon_name not in MONTHS:
            continue
        year = int(g["y1"] or g["y2"] or g["y3"] or g["y4"])
        mon = MONTHS.get(mon_name, 1)
        day = int(g["d1"] or g["d2"] or 1)
        iso = f"{year:04d}-{mon:02d}-{min(day, 28 if mon == 2 else 30):02d}"
        if best is None or iso > best[0]:
            best = (iso, m.group(0).strip())
    return best


def fmt(v, unit):
    if v is None:
        return "—"
    if unit == "₹":
        if v >= 1e7 and v % 1e5 == 0:
            return f"₹{v / 1e7:g} crore"
        if v >= 1e5 and v % 1e3 == 0:
            return f"₹{v / 1e5:g} lakh"
        whole, frac = f"{v:.2f}".split(".")
        head, tail = whole[:-3], whole[-3:]
        head = ",".join([head[max(i - 2, 0):i] for i in range(len(head), 0, -2)][::-1])  # Indian grouping
        return f"₹{head + ',' if head else ''}{tail}" + ("" if frac == "00" else f".{frac}")
    num = f"{v:g}"
    return f"{num}%" if unit == "%" else f"{num} {unit}".strip()
