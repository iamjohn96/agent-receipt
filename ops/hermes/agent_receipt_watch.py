#!/usr/bin/env python3
"""Agent Receipt pain-signal watcher (Hermes cron pre-run script).

Collects NEW posts/issues where a coding agent may have deleted/lost files,
from HN (Algolia), GitHub issues, and Reddit. Prints candidates to stdout for
the Hermes agent to classify. Prints NOTHING when there are no new candidates,
so the cron tick stays silent (Hermes watchdog pattern).

Usage:
  python3 agent_receipt_watch.py            # normal run (updates seen-state)
  python3 agent_receipt_watch.py --dry-run  # show candidates, don't update state
  python3 agent_receipt_watch.py --hours 72 # widen lookback window
  python3 agent_receipt_watch.py --reset    # clear seen/pending state

Stdlib only. State: ~/.hermes/scripts/.agent_receipt_seen.json (+ .agent_receipt_pending.json)

Two-phase commit: a batch is only marked "seen" after Hermes reports the run
that consumed it as ok (jobs.json last_status == "ok", no delivery error).
If that run failed (model error, Telegram error), the batch is re-emitted.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

UA = "agent-receipt-watch/0.1 (+https://www.npmjs.com/package/@jonnylab/agent-receipt)"
STATE_PATH = os.path.expanduser("~/.hermes/scripts/.agent_receipt_seen.json")
PENDING_PATH = os.path.expanduser("~/.hermes/scripts/.agent_receipt_pending.json")
JOBS_PATH = os.path.expanduser("~/.hermes/cron/jobs.json")
SCRIPT_NAME = "agent_receipt_watch.py"
STATE_MAX = 3000

AGENT_TERMS = ["claude code", "codex", "cursor agent", "coding agent", "ai agent"]
LOSS_TERMS = ["deleted", "rm -rf", "wiped", "lost files", "undo", "rewind", "restore"]

# GitHub: repos where the pain is most concrete (PLAN.md §3 priority 1)
GH_QUERIES = [
    'repo:anthropics/claude-code is:issue (rewind OR checkpoint OR undo OR restore) (bash OR deleted OR "rm -rf")',
    'repo:openai/codex is:issue (undo OR restore OR revert) (deleted OR "rm -rf" OR lost)',
]
EXCLUDE_AUTHORS = {"jonnylab"}  # our own posts
REDDIT_SUBS = ["ClaudeAI", "ChatGPTCoding", "cursor"]
REDDIT_QUERY = '(deleted OR "rm -rf" OR wiped OR undo OR rewind) (claude OR codex OR agent)'


def fetch_json(url, headers=None, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def hn(since_ts, errors):
    out = []
    for a in AGENT_TERMS:
        for l in LOSS_TERMS:
            q = urllib.parse.urlencode({
                "query": f'"{a}" "{l}"',
                "tags": "(story,comment)",
                "numericFilters": f"created_at_i>{since_ts}",
                "hitsPerPage": 20,
            })
            try:
                data = fetch_json(f"https://hn.algolia.com/api/v1/search_by_date?{q}")
            except Exception as e:  # noqa: BLE001
                errors.append(f"hn {a}/{l}: {e}")
                continue
            for h in data.get("hits", []):
                if h.get("author") in EXCLUDE_AUTHORS:
                    continue
                oid = h.get("objectID")
                title = h.get("title") or h.get("story_title") or ""
                text = (h.get("comment_text") or h.get("story_text") or "")[:400]
                out.append({
                    "id": f"hn:{oid}",
                    "source": "HN",
                    "title": title,
                    "snippet": strip_html(text),
                    "url": f"https://news.ycombinator.com/item?id={oid}",
                    "created": h.get("created_at", ""),
                    "match": f"{a} + {l}",
                })
    return out


def github(since_ts, errors):
    out = []
    since = time.strftime("%Y-%m-%d", time.gmtime(since_ts))
    headers = {"Accept": "application/vnd.github+json"}
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        headers["Authorization"] = f"Bearer {tok}"
    for q in GH_QUERIES:
        params = urllib.parse.urlencode({"q": f"{q} created:>={since}", "sort": "created", "order": "desc", "per_page": 20})
        try:
            data = fetch_json(f"https://api.github.com/search/issues?{params}", headers)
        except Exception as e:  # noqa: BLE001
            errors.append(f"github: {e}")
            continue
        for it in data.get("items", []):
            out.append({
                "id": f"gh:{it.get('id')}",
                "source": "GitHub",
                "title": it.get("title", ""),
                "snippet": (it.get("body") or "")[:400],
                "url": it.get("html_url", ""),
                "created": it.get("created_at", ""),
                "match": q.split(" ")[0],
            })
    return out


def reddit(since_ts, errors):
    out = []
    for sub in REDDIT_SUBS:
        params = urllib.parse.urlencode({"q": REDDIT_QUERY, "restrict_sr": 1, "sort": "new", "t": "week", "limit": 25})
        try:
            data = fetch_json(f"https://www.reddit.com/r/{sub}/search.json?{params}")
        except Exception as e:  # noqa: BLE001
            errors.append(f"reddit r/{sub}: {e}")
            continue
        for c in data.get("data", {}).get("children", []):
            d = c.get("data", {})
            if d.get("created_utc", 0) < since_ts:
                continue
            out.append({
                "id": f"rd:{d.get('id')}",
                "source": f"Reddit r/{sub}",
                "title": d.get("title", ""),
                "snippet": (d.get("selftext") or "")[:400],
                "url": "https://www.reddit.com" + d.get("permalink", ""),
                "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(d.get("created_utc", 0))),
                "match": "reddit search",
            })
    return out


def strip_html(s):
    import html
    import re
    return html.unescape(re.sub(r"<[^>]+>", " ", s)).strip()


def _load(path, default):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return default


def _save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


def load_state():
    return _load(STATE_PATH, [])


def save_state(seen):
    _save(STATE_PATH, seen[-STATE_MAX:])


def _parse_ts(s):
    from datetime import datetime
    try:
        return datetime.fromisoformat(s).timestamp()
    except Exception:  # noqa: BLE001
        return None


def previous_run_verdict(emitted_at):
    """'ok' | 'failed' | 'unknown' for the Hermes run that consumed the pending batch."""
    data = _load(JOBS_PATH, None)
    if data is None:
        return "unknown"
    jobs = data.get("jobs", []) if isinstance(data, dict) else data
    jobs = [j for j in jobs if os.path.basename(str(j.get("script") or "")) == SCRIPT_NAME]
    if not jobs:
        return "unknown"
    j = max(jobs, key=lambda x: _parse_ts(x.get("last_run_at") or "") or 0)
    last = _parse_ts(j.get("last_run_at") or "")
    if last is None or last < emitted_at:
        return "unknown"  # consuming run hasn't been recorded yet
    if j.get("last_status") == "ok" and not j.get("last_delivery_error"):
        return "ok"
    return "failed"


def settle_pending(seen, dry):
    """Commit or drop the previous batch based on how its Hermes run ended."""
    pending = _load(PENDING_PATH, None)
    if not pending:
        return seen, None
    verdict = previous_run_verdict(pending.get("emitted_at", 0))
    if dry:
        return seen, verdict
    if verdict == "ok":
        seen = seen + pending.get("ids", [])
        save_state(seen)
        os.remove(PENDING_PATH)
    elif verdict == "failed":
        os.remove(PENDING_PATH)  # not committed -> items get re-emitted below
    else:  # unknown (manual run outside Hermes, or jobs.json unreadable): keep old behaviour
        age = time.time() - pending.get("emitted_at", 0)
        if age > 6 * 3600:
            seen = seen + pending.get("ids", [])
            save_state(seen)
            os.remove(PENDING_PATH)
    return seen, verdict


def main():
    dry = "--dry-run" in sys.argv
    hours = 36
    if "--hours" in sys.argv:
        hours = int(sys.argv[sys.argv.index("--hours") + 1])
    since_ts = int(time.time()) - hours * 3600

    errors = []
    items = hn(since_ts, errors) + github(since_ts, errors) + reddit(since_ts, errors)

    if "--reset" in sys.argv:
        for pth in (STATE_PATH, PENDING_PATH):
            if os.path.exists(pth):
                os.remove(pth)
        print("state reset")
        return

    seen, verdict = settle_pending(load_state(), dry)
    pending_ids = set((_load(PENDING_PATH, None) or {}).get("ids", []))
    if dry and verdict == "failed":
        pending_ids = set()  # a real run would re-emit these
    seen_set = set(seen) | pending_ids
    new, ids = [], set()
    for it in items:
        if it["id"] in seen_set or it["id"] in ids:
            continue
        ids.add(it["id"])
        new.append(it)

    if not dry and new:
        prev = _load(PENDING_PATH, None) or {}
        ids_all = prev.get("ids", []) + [it["id"] for it in new]
        _save(PENDING_PATH, {"ids": ids_all, "emitted_at": time.time()})

    if dry:
        print(f"[dry-run] lookback={hours}h candidates={len(new)} errors={len(errors)} prev_run={verdict}")
        for e in errors:
            print(f"  error: {e}")

    if not new:
        return  # empty stdout -> silent Hermes tick

    print(f"NEW_CANDIDATES={len(new)}")
    for i, it in enumerate(new, 1):
        print(f"\n[{i}] {it['source']} | {it['created']} | match: {it['match']}")
        print(f"title: {it['title']}")
        if it["snippet"]:
            print(f"snippet: {it['snippet']}")
        print(f"url: {it['url']}")
    # Source errors are only printed alongside real candidates (never alone),
    # so a flaky source can't cause noisy alerts.
    if errors and not dry:
        print(f"\n(source errors this run: {len(errors)})")


if __name__ == "__main__":
    main()
