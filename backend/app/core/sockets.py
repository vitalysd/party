from __future__ import annotations

import json
import logging
from typing import Dict, Set, Any, TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # user_id -> set of active WebSockets (allows multiple tabs/devices per user)
        self.active_user_connections: Dict[str, Set[WebSocket]] = {}
        # Subscriptions belong to a tab/device, not to the entire user.
        self.channel_subscribers: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        if user_id not in self.active_user_connections:
            self.active_user_connections[user_id] = set()
        self.active_user_connections[user_id].add(websocket)
        logger.info(f"User {user_id} connected via WebSocket. Active sessions: {len(self.active_user_connections[user_id])}")

    def disconnect(self, websocket: WebSocket, user_id: str):
        if user_id in self.active_user_connections:
            self.active_user_connections[user_id].discard(websocket)
            if not self.active_user_connections[user_id]:
                del self.active_user_connections[user_id]
        
        for channel_id in list(self.channel_subscribers):
            self.unsubscribe_channel(channel_id, websocket)
        logger.info(f"User {user_id} disconnected from WebSocket.")

    def subscribe_channel(self, channel_id: str, websocket: WebSocket):
        if channel_id not in self.channel_subscribers:
            self.channel_subscribers[channel_id] = set()
        self.channel_subscribers[channel_id].add(websocket)

    def unsubscribe_channel(self, channel_id: str, websocket: WebSocket):
        if channel_id in self.channel_subscribers:
            self.channel_subscribers[channel_id].discard(websocket)
            if not self.channel_subscribers[channel_id]:
                del self.channel_subscribers[channel_id]

    async def send_personal_message(self, message: Dict[str, Any], user_id: str):
        await self._send(message, [
            (user_id, ws) for ws in self.active_user_connections.get(user_id, set())
        ])

    async def broadcast_to_users(self, message: Dict[str, Any], user_ids):
        await self._send(message, [
            (user_id, ws) for user_id in set(user_ids)
            for ws in self.active_user_connections.get(user_id, set())
        ])

    async def _send(self, message, connections):
        payload = json.dumps(message)
        for user_id, ws in connections:
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(ws, user_id)

    async def broadcast(self, message: Dict[str, Any]):
        await self._send(message, [
            (user_id, ws)
            for user_id, sockets in self.active_user_connections.items()
            for ws in sockets
        ])

    async def broadcast_to_channel(self, channel_id: str, message: Dict[str, Any]):
        subscribers = self.channel_subscribers.get(channel_id, set())
        await self._send(message, [
            (user_id, ws)
            for user_id, sockets in self.active_user_connections.items()
            for ws in sockets if ws in subscribers
        ])

    def is_user_online(self, user_id: str) -> bool:
        return user_id in self.active_user_connections and len(self.active_user_connections[user_id]) > 0


manager = ConnectionManager()
