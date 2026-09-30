import asyncio
from typing import Dict, Set, Any
import json


class EventBroker:
    """Pub/Sub broker for real-time SSE event distribution."""

    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}

    def subscribe(self, run_id: str) -> asyncio.Queue:
        if run_id not in self._subscribers:
            self._subscribers[run_id] = set()
        q = asyncio.Queue(maxsize=100)
        self._subscribers[run_id].add(q)
        return q

    def unsubscribe(self, run_id: str, q: asyncio.Queue):
        if run_id in self._subscribers:
            self._subscribers[run_id].discard(q)
            if not self._subscribers[run_id]:
                del self._subscribers[run_id]

    async def publish(self, run_id: str, event_type: str, data: Dict[str, Any]):
        if run_id in self._subscribers:
            message = {"event": event_type, "data": data}
            for q in list(self._subscribers[run_id]):
                try:
                    q.put_nowait(message)
                except asyncio.QueueFull:
                    pass

    def publish_sync(self, run_id: str, event_type: str, data: Dict[str, Any]):
        """Publish from synchronous worker thread via asyncio event loop."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(self.publish(run_id, event_type, data), loop)
        except Exception:
            pass


broker = EventBroker()
