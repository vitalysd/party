"""Single-process call signalling, matching the application's WebSocket deployment."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from fastapi import HTTPException
from app.core.sockets import manager
from app.core.voice_rooms import close_voice_room

logger = logging.getLogger(__name__)

class CallRegistry:
    def __init__(self):
        self.calls = {}
        self.user_calls = {}
        self.timers = {}
        self.lock = asyncio.Lock()

    async def notify(self, call):
        await manager.broadcast_to_users({'type': 'CALL_CHANGED', 'data': call}, [call['caller_id'], call['callee_id']])

    async def start(self, channel_id, caller, callee):
        async with self.lock:
            if caller.id in self.user_calls or callee.id in self.user_calls:
                raise HTTPException(409, 'Один из участников уже в звонке')
            if not manager.is_user_online(callee.id):
                raise HTTPException(409, 'Собеседник сейчас не в сети')
            if len(self.calls) >= 10000:
                raise HTTPException(503, 'Слишком много звонков. Повторите позже.')
            call = {'id': str(uuid4()), 'channel_id': channel_id, 'caller_id': caller.id, 'callee_id': callee.id,
                    'caller_name': caller.display_name, 'callee_name': callee.display_name,
                    'status': 'ringing', 'version': 1,
                    'expires_at': (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()}
            self.calls[call['id']] = call
            self.user_calls[caller.id] = self.user_calls[callee.id] = call['id']
            self.timers[call['id']] = asyncio.create_task(self.expire(call['id']))
        await self.notify(call)
        return call

    async def expire(self, call_id):
        try:
            await asyncio.sleep(30)
            await self.finish(call_id, reason='timeout')
        except asyncio.CancelledError:
            pass

    async def accept(self, call_id, user_id):
        async with self.lock:
            call = self.calls.get(call_id)
            if not call or call['callee_id'] != user_id:
                raise HTTPException(404, 'Звонок не найден')
            if call['status'] == 'ringing':
                if datetime.fromisoformat(call['expires_at']) <= datetime.now(timezone.utc):
                    raise HTTPException(410, 'Время ожидания звонка истекло')
                call = {**call, 'status': 'accepted', 'version': 2, 'expires_at': None}
                self.calls[call_id] = call
                timer = self.timers.pop(call_id, None)
                if timer: timer.cancel()
        await self.notify(call)
        return call

    async def finish(self, call_id, user_id=None, reason='ended'):
        async with self.lock:
            call = self.calls.get(call_id)
            if not call or (user_id is not None and user_id not in (call['caller_id'], call['callee_id'])):
                if user_id is not None: raise HTTPException(404, 'Звонок не найден')
                return
            self.calls.pop(call_id)
            for participant_id in (call['caller_id'], call['callee_id']):
                self.user_calls.pop(participant_id, None)
            timer = self.timers.pop(call_id, None)
            if timer and timer is not asyncio.current_task(): timer.cancel()
            ended = {**call, 'status': 'ended', 'version': call['version'] + 1, 'reason': reason}
        await self.notify(ended)
        if call['status'] == 'accepted':
            try:
                await asyncio.wait_for(close_voice_room('call:' + call_id), timeout=5)
            except Exception:
                logger.exception('Failed to close ended call %s', call_id)
        return ended

    def current(self, user_id):
        return self.calls.get(self.user_calls.get(user_id))

    async def offline(self, user_id):
        call = self.current(user_id)
        if call: await self.finish(call['id'], reason='offline')

    async def shutdown(self):
        for call_id in list(self.calls): await self.finish(call_id, reason='server_restart')

calls = CallRegistry()
