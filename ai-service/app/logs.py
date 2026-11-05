import threading
from datetime import datetime, timezone

from pymongo import MongoClient

from app.config import settings

_client = None


def get_collection():
    global _client
    if _client is None:
        _client = MongoClient(settings.mongo_url, serverSelectionTimeoutMS=2000)
    return _client["doubtzen"]["agent_logs"]


def _write(doc):
    try:
        get_collection().insert_one(doc)
    except Exception as e:
        print("Agent log skipped:", str(e)[:100])


def log_event(user_id, question, tool, sources, routing_ms):
    doc = {
        "user_id": user_id,
        "question": question[:500],
        "tool": tool,
        "sources": sources,
        "routing_ms": routing_ms,
        "created_at": datetime.now(timezone.utc),
    }
    threading.Thread(target=_write, args=(doc,), daemon=True).start()