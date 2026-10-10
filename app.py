"""Pramaan web app: python app.py, then open http://127.0.0.1:8000"""
import json
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pramaan import check, serp

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="Pramaan", description="Ask once. See where AI search disagrees.")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(ROOT / "static" / "index.html")


@app.get("/api/check")
def api_check(q: str = Query(..., min_length=5, max_length=300)):
    report = check.run(q)
    if not any(a["status"] == "ok" for a in report["answers"]) and not serp.has_key():
        raise HTTPException(404, "Not recorded yet. Add SERPAPI_API_KEY to .env to run new questions live, "
                                 "or pick one of the recorded questions.")
    return report


@app.get("/api/status")
def api_status():
    check.llm.probe()
    qs = json.loads((ROOT / "questions.json").read_text(encoding="utf-8"))
    audit = ROOT / "audit" / "results.json"
    return {"live": serp.has_key(), "llm": check.llm.enabled(), "questions": qs,
            "audit": json.loads(audit.read_text(encoding="utf-8")) if audit.exists() else None}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
