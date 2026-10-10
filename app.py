"""Pramaan web app: python app.py, then open http://127.0.0.1:8000"""
import json
import queue
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from pramaan import check, serp

ROOT = Path(__file__).resolve().parent
app = FastAPI(title="Pramaan", description="Ask once. See where AI search disagrees.")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(ROOT / "static" / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/api/check")
def api_check(q: str = Query(..., min_length=5, max_length=300)):
    report = check.run(q)
    if not any(a["status"] == "ok" for a in report["answers"]) and not serp.has_key():
        raise HTTPException(404, "Not recorded yet. Add SERPAPI_API_KEY to .env to run new questions live, "
                                 "or pick one of the recorded questions.")
    return report


@app.get("/api/check/stream")
def api_check_stream(q: str = Query(..., min_length=5, max_length=300)):
    """Server-sent events: one event per engine as it answers, then the full report."""
    events = queue.Queue()

    def work():
        try:
            report = check.run(q, on_event=events.put)
            if not any(a["status"] == "ok" for a in report["answers"]) and not serp.has_key():
                events.put({"type": "error", "detail": "Not recorded yet. Add SERPAPI_API_KEY to .env to run new "
                                                       "questions live, or pick one of the recorded questions."})
            else:
                events.put({"type": "report", "report": report})
        except Exception as e:  # surface the failure to the page instead of a silent hang
            events.put({"type": "error", "detail": str(e)})
        events.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while (ev := events.get()) is not None:
            yield f"data: {json.dumps(ev, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


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
