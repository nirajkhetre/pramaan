"""SerpApi client with a recorder.

Every live response is saved under replay/ so the app (and judges without a key)
can re-run any recorded question with zero API calls.
"""
import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPLAY = ROOT / "replay"


def load_env():
    env = ROOT / ".env"
    for path in (env, ROOT.parent / ".env"):
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                if "=" in line and not line.lstrip().startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


load_env()


class NoData(Exception):
    pass


def _key(params):
    return hashlib.sha1(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]


def has_key():
    return bool(os.environ.get("SERPAPI_API_KEY"))


def search(params, fresh=False):
    """Return (response_json, meta). meta = {mode: live|replay, fetched_at}."""
    params = {k: v for k, v in params.items() if v is not None}
    path = REPLAY / f"{params['engine']}-{_key(params)}.json"
    if path.exists() and not (fresh and has_key()):
        rec = json.loads(path.read_text(encoding="utf-8"))
        return rec["response"], {"mode": "replay", "fetched_at": rec["fetched_at"]}
    if not has_key():
        raise NoData("No SERPAPI_API_KEY and no recorded response for this query")
    url = "https://serpapi.com/search.json?" + urllib.parse.urlencode(
        {**params, "api_key": os.environ["SERPAPI_API_KEY"]})
    try:
        with urllib.request.urlopen(url, timeout=90) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        try:
            data = json.loads(body)
        except ValueError:
            raise NoData(f"SerpApi HTTP {e.code}") from e
    if "error" in data and not any(k for k in data if k not in ("error", "search_metadata", "search_parameters")):
        # Errors are not recorded, so a later run can retry.
        return data, {"mode": "live", "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    fetched = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    text = json.dumps({"fetched_at": fetched, "params": params, "response": data}, ensure_ascii=False)
    # Recordings are committed to the public repo, so never let the key leak into one.
    text = text.replace(os.environ["SERPAPI_API_KEY"], "REDACTED")
    REPLAY.mkdir(exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return data, {"mode": "live", "fetched_at": fetched}
