"""Pramaan as an MCP tool, so an AI agent can cross-check a number before it states it.

Claude Code:  claude mcp add pramaan -- python /path/to/pramaan/mcp_server.py
"""
from mcp.server.mcpserver import MCPServer

from pramaan import check, claims

server = MCPServer(
    name="pramaan",
    instructions="Before stating a number about Indian health, money, tax, law or prices, call cross_check. "
                 "Report disagreement and the official page instead of picking one figure silently.")


@server.tool()
def cross_check(question: str) -> dict:
    """Ask Google AI Mode, Google AI Overview, Bing Copilot and Brave AI Mode the same question (live, via
    SerpApi), compare the numbers they give, and set them against official Indian pages with dates."""
    r = check.run(question)
    v = r["verdict"]
    o = r["official"]
    return {
        "verdict": v["code"], "summary": v["title"], "note": v["note"],
        "answers": [{"engine": a["label"], "figure": claims.fmt(a["claim"]["value"], a["claim"]["unit"])
                     if a["claim"] else None, "quote": (a["claim"] or {}).get("sentence"),
                     "official_citations": a["official_citations"], "citations": len(a["references"]),
                     "match": a["match"]} for a in r["answers"]],
        "official": {"figure": claims.fmt(o["value"], o["unit"]), "quote": o["sentence"], "url": o["link"],
                     "date": o.get("date")} if o else None,
        "hijacked_results": [e["link"] for e in r["evidence"] if e["kind"] == "hijacked"],
    }


if __name__ == "__main__":
    server.run("stdio")
