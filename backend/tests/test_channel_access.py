import unittest
import json
import tempfile
import asyncio
from uuid import uuid4
from pathlib import Path
import jwt
from unittest.mock import patch, AsyncMock
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI, WebSocketDisconnect
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy import delete, select, func

from app.api.deps import get_current_user, get_db
from app.api.v1.channels import router as channels_router
from app.api.v1.messages import router as messages_router
from app.core.database import Base
from app.models import Channel, ChannelMember, Message, User
from app.api.websocket import websocket_endpoint
from app.core.sockets import ConnectionManager
from app.api.v1.files import router as files_router, legacy_router
from app.api.v1.livekit import router as livekit_router
from app.api.file_access import validate_avatar
from app.core.config import settings


class ChannelAccessTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.voice_close_patch = patch('app.api.v1.channels.close_voice_room', new_callable=AsyncMock)
        self.voice_close = self.voice_close_patch.start()
        self.addCleanup(self.voice_close_patch.stop)
        self.uploads = tempfile.TemporaryDirectory()
        self.upload_patch = patch.object(settings, 'UPLOAD_DIR', self.uploads.name)
        self.upload_patch.start()
        self.engine = create_async_engine('sqlite+aiosqlite:///:memory:')
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.sessions() as db:
            self.member = User(id='member', username='member', display_name='Member', hashed_password='unused')
            self.outsider = User(id='outsider', username='outsider', display_name='Outsider', hashed_password='unused')
            db.add_all([self.member, self.outsider,
                        Channel(id='private', name='Private', is_direct=True),
                        Channel(id='public', name='Public', is_direct=False)])
            await db.flush()
            db.add(ChannelMember(channel_id='private', user_id='member'))
            db.add(Message(id='secret', channel_id='private', sender_id='member', content='Secret'))
            start = datetime(2026, 1, 1, tzinfo=timezone.utc)
            for i in range(60):
                db.add(Message(id=f'm{i:02}', channel_id='public', sender_id='member',
                               content=str(i), created_at=start + timedelta(seconds=i)))
            await db.commit()
        self.current_user = self.outsider
        app = FastAPI()
        app.include_router(channels_router)
        app.include_router(messages_router)
        app.include_router(files_router, prefix='/api/v1')
        app.include_router(legacy_router)
        app.include_router(livekit_router)
        self.app = app

        async def database():
            async with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = database
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = AsyncClient(transport=ASGITransport(app=app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        await self.engine.dispose()
        self.upload_patch.stop()
        self.uploads.cleanup()

    async def test_room_management_permissions_and_validation(self):
        for data in ({'name': '   '}, {'name': 'a' * 101}, {'name': 'Room', 'type': 'invalid'}):
            self.assertEqual((await self.client.post('/channels', json=data)).status_code, 422)
        response = await self.client.post('/channels', json={'name': ' Чайхана ', 'icon': 'coffee'})
        self.assertEqual(response.status_code, 201, response.text)
        room = response.json()
        self.assertEqual(room['name'], 'Чайхана')
        self.assertEqual(room['members'][0]['role'], 'owner')
        path = '/channels/' + room['id']
        self.assertEqual((await self.client.patch(path, json={'icon': 'music'})).json()['icon'], 'music')
        self.current_user = self.member
        self.assertEqual((await self.client.patch(path, json={'icon': 'star'})).status_code, 403)
        self.assertEqual((await self.client.delete(path)).status_code, 403)
        self.assertEqual((await self.client.delete('/channels/private')).status_code, 404)
        self.current_user = self.outsider
        self.assertEqual((await self.client.delete(path)).status_code, 204)
        self.assertEqual((await self.client.get(path)).status_code, 404)

    async def test_admin_can_delete_populated_room(self):
        from app.models.upload import UploadedFile
        self.current_user.is_admin = True
        async with self.sessions() as db:
            await db.execute(__import__('sqlalchemy').text('PRAGMA foreign_keys=ON'))
            db.add(UploadedFile(key='room-file', owner_id='member', channel_id='public',
                                filename='x.txt', content_type='text/plain', size=1))
            await db.commit()
        response = await self.client.delete('/channels/public')
        self.assertEqual(response.status_code, 204, response.text)
        async with self.sessions() as db:
            self.assertIsNone(await db.get(UploadedFile, 'room-file'))
            self.assertEqual(await db.scalar(select(func.count()).select_from(Message).where(Message.channel_id == 'public')), 0)

    async def test_delete_text_room_closes_voice_and_removes_disk_files(self):
        from app.models.upload import UploadedFile
        self.current_user.is_admin = True
        target = Path(self.uploads.name) / 'owned-file'
        target.write_bytes(b'file')
        async with self.sessions() as db:
            db.add(UploadedFile(key=target.name, owner_id='member', channel_id='public', filename='x', content_type='text/plain', size=4))
            await db.commit()
        response = await self.client.delete('/channels/public')
        self.assertEqual(response.status_code, 204, response.text)
        self.voice_close.assert_awaited_once_with('channel:public')
        self.assertFalse(target.exists())

    async def test_dm_is_delivered_to_members_outside_active_chat(self):
        async with self.sessions() as db:
            db.add(ChannelMember(channel_id='private', user_id='outsider'))
            await db.commit()
        with patch('app.api.v1.messages.manager.broadcast_to_users', new_callable=AsyncMock) as delivery, patch('app.api.v1.messages.manager.broadcast_to_channel', new_callable=AsyncMock) as public:
            response = await self.client.post('/channels/private/messages', json={'content': 'Background DM'})
            self.assertEqual(response.status_code, 201, response.text)
            self.assertEqual(set(delivery.await_args.args[1]), {'member', 'outsider'})
            public.assert_not_awaited()

    async def test_upload_quota_rejects_extra_file_and_cleans_partial_file(self):
        with patch.object(settings, 'MAX_USER_UPLOAD_BYTES', 5):
            first = await self.client.post('/api/v1/files/upload', data={'channel_id': 'public'}, files={'file': ('a.txt', b'1234', 'text/plain')})
            second = await self.client.post('/api/v1/files/upload', data={'channel_id': 'public'}, files={'file': ('b.txt', b'567', 'text/plain')})
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 507, second.text)
        self.assertEqual(len(list(Path(self.uploads.name).iterdir())), 1)

    async def test_cleanup_keeps_referenced_and_fresh_uploads(self):
        from app.models.upload import UploadedFile
        from app.core.storage import cleanup_uploads
        import os
        old = datetime.now(timezone.utc) - timedelta(days=3)
        unused, used, fresh, orphan = [uuid4().hex for _ in range(4)]
        for key in [unused, used, fresh, orphan]:
            (Path(self.uploads.name) / key).write_bytes(b'data')
        os.utime(Path(self.uploads.name) / orphan, (old.timestamp(), old.timestamp()))
        async with self.sessions() as db:
            for key in [unused, used, fresh]:
                db.add(UploadedFile(key=key, owner_id='member', channel_id='public', filename='x', content_type='text/plain', size=4, created_at=datetime.now(timezone.utc) if key == fresh else old))
            db.add(Message(id='file-ref', channel_id='public', sender_id='member', content='', attachments=[{'url': '/api/v1/files/' + used}]))
            await db.commit()
            self.assertEqual(await cleanup_uploads(db), 2)
        self.assertTrue((Path(self.uploads.name) / used).is_file())
        self.assertTrue((Path(self.uploads.name) / fresh).is_file())
        self.assertFalse((Path(self.uploads.name) / unused).exists())
        self.assertFalse((Path(self.uploads.name) / orphan).exists())

    async def test_outsider_cannot_access_private_channel(self):
        response = await self.client.get('/channels')
        self.assertEqual([c['id'] for c in response.json()], ['public'])
        for path in ['/channels/private', '/channels/private/messages', '/channels/missing/messages']:
            self.assertEqual((await self.client.get(path)).status_code, 404)
        self.assertEqual((await self.client.post('/channels/private/messages', json={'content': 'x'})).status_code, 404)
        self.assertEqual((await self.client.post('/messages/secret/reactions', json={'emoji': '👍'})).status_code, 404)

    async def test_member_can_read_send_and_toggle_reaction(self):
        self.current_user = self.member
        self.assertEqual((await self.client.get('/channels/private')).status_code, 200)
        response = await self.client.get('/channels/private/messages')
        self.assertEqual(response.json()[0]['content'], 'Secret')
        response = await self.client.post('/channels/private/messages', json={'content': 'Reply', 'reply_to_id': 'secret'})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['reply_to']['content'], 'Secret')
        response = await self.client.post('/messages/secret/reactions', json={'emoji': '👍'})
        self.assertEqual(len(response.json()['reactions']), 1)
        response = await self.client.post('/messages/secret/reactions', json={'emoji': '👍'})
        self.assertEqual(response.json()['reactions'], [])

    async def test_cross_channel_reply_is_rejected(self):
        # Reject even for a member who can read both channels.
        for user in [self.member, self.outsider]:
            self.current_user = user
            response = await self.client.post('/channels/public/messages', json={'content': 'leak', 'reply_to_id': 'secret'})
            self.assertEqual(response.status_code, 404)

    async def test_history_returns_latest_page_in_order(self):
        response = await self.client.get('/channels/public/messages?limit=50')
        self.assertEqual([m['content'] for m in response.json()], [str(i) for i in range(10, 60)])
        response = await self.client.get('/channels/public/messages', params={'limit': 10, 'before': '2026-01-01T00:00:10Z'})
        self.assertEqual([m['content'] for m in response.json()], [str(i) for i in range(10)])

    async def test_self_dm_is_rejected(self):
        response = await self.client.post('/channels/dm/outsider')
        self.assertEqual(response.status_code, 400)

    async def test_websocket_checks_subscription_and_typing_access(self):
        for user_id, permitted in [('outsider', False), ('member', True)]:
            manager = ConnectionManager()

            class Socket:
                def __init__(self):
                    self.events = iter([
                        '[]', '{"data": null}', '{"type": []}',
                        json.dumps({'type': 'SUBSCRIBE_CHANNEL', 'data': {'channel_id': 'private'}}),
                        json.dumps({'type': 'TYPING', 'data': {'channel_id': 'private'}}),
                        json.dumps({'type': 'VOICE_STATE', 'data': {'channel_id': 'private'}}),
                    ])
                    self.received = []
                    self.was_subscribed = False

                async def accept(self):
                    pass

                async def send_text(self, text):
                    self.received.append(json.loads(text))

                async def send_json(self, value):
                    self.received.append(value)

                async def receive_text(self):
                    try:
                        return next(self.events)
                    except StopIteration:
                        self.was_subscribed = self in manager.channel_subscribers.get('private', set())
                        raise WebSocketDisconnect()

            socket = Socket()
            with patch('app.api.websocket.AsyncSessionLocal', self.sessions), \
                 patch('app.api.websocket.decode_access_token', return_value=user_id), \
                 patch('app.api.websocket.manager', manager):
                await websocket_endpoint(socket, token='test')
            self.assertEqual(socket.was_subscribed, permitted)
            self.assertEqual(any(e['type'] == 'USER_TYPING' for e in socket.received), permitted)
            self.assertEqual(any(e['type'] == 'VOICE_STATE_UPDATED' for e in socket.received), permitted)
            self.assertEqual(sum(e['type'] == 'ERROR' for e in socket.received), 0 if permitted else 3)
            self.assertEqual(manager.channel_subscribers, {})

    async def test_legacy_cross_channel_reply_does_not_leak(self):
        async with self.sessions() as db:
            db.add(Message(id='legacy', channel_id='public', sender_id='member',
                           content='Old reply', reply_to_id='secret'))
            await db.commit()
        response = await self.client.get('/channels/public/messages')
        legacy = next(m for m in response.json() if m['id'] == 'legacy')
        self.assertIsNone(legacy['reply_to'])
        self.assertIsNone(legacy['reply_to_id'])
        response = await self.client.post('/messages/legacy/reactions', json={'emoji': '👍'})
        self.assertIsNone(response.json()['reply_to'])

    async def test_livekit_token_is_scoped_to_authorized_channel(self):
        response = await self.client.post('/livekit/token', json={'channel_id': 'private'})
        self.assertEqual(response.status_code, 404)
        self.current_user = self.member
        response = await self.client.post('/livekit/token', json={'channel_id': 'private'})
        self.assertEqual(response.status_code, 409, response.text)
        with patch('app.api.v1.livekit.calls.current', return_value={'id': 'test-call', 'channel_id': 'private', 'status': 'accepted'}):
            response = await self.client.post('/livekit/token', json={'channel_id': 'private'})
        self.assertEqual(response.status_code, 200, response.text)
        payload = jwt.decode(response.json()['token'], settings.LIVEKIT_API_SECRET, algorithms=['HS256'])
        self.assertEqual(payload['sub'], 'member')
        self.assertEqual(payload['video']['room'], 'call:test-call')
        self.assertLessEqual(payload['exp'] - payload['nbf'], 300)
        response = await self.client.post('/livekit/token', json={'room_name': 'arbitrary', 'participant_name': 'fake'})
        self.assertEqual(response.status_code, 422)

    async def test_private_file_upload_download_and_forged_attachment(self):
        response = await self.client.post('/api/v1/files/upload',
            data={'channel_id': 'private'}, files={'file': ('secret.txt', b'secret', 'text/plain')})
        self.assertEqual(response.status_code, 404)
        self.current_user = self.member
        response = await self.client.post('/api/v1/files/upload',
            data={'channel_id': 'private'}, files={'file': ('secret.txt', b'secret', 'text/plain')})
        self.assertEqual(response.status_code, 200, response.text)
        attachment = response.json()
        response = await self.client.get(attachment['url'])
        self.assertEqual(response.content, b'secret')
        self.assertEqual(response.headers['cache-control'], 'private, no-store')
        self.assertIn('attachment', response.headers['content-disposition'])
        response = await self.client.post('/channels/private/messages', json={'attachments': [attachment]})
        self.assertEqual(response.status_code, 201, response.text)
        # A member cannot publish a private file into a public channel either.
        response = await self.client.post('/channels/public/messages', json={'attachments': [attachment]})
        self.assertEqual(response.status_code, 404)
        self.current_user = self.outsider
        self.assertEqual((await self.client.get(attachment['url'])).status_code, 404)
        self.assertEqual((await self.client.get('/uploads/' + attachment['key'])).status_code, 404)
        self.app.dependency_overrides.pop(get_current_user)
        self.assertEqual((await self.client.get(attachment['url'])).status_code, 401)

    async def test_upload_size_limit_and_obsolete_public_upload_route(self):
        with patch.object(settings, 'MAX_UPLOAD_BYTES', 3):
            response = await self.client.post('/api/v1/files/upload',
                data={'channel_id': 'public'}, files={'file': ('big.txt', b'1234', 'text/plain')})
        self.assertEqual(response.status_code, 413)
        self.assertEqual(list(Path(self.uploads.name).iterdir()), [])
        self.assertEqual((await self.client.post('/api/v1/files/presigned-url')).status_code, 410)
        response = await self.client.post('/api/v1/files/upload', files={'file': ('x', b'x')})
        self.assertEqual(response.status_code, 400)

    async def test_avatar_is_shared_but_private_attachment_cannot_become_avatar(self):
        self.current_user = self.member
        response = await self.client.post('/api/v1/files/upload',
            data={'purpose': 'avatar'}, files={'file': ('face.png', b'image', 'image/png')})
        avatar = response.json()
        self.current_user = self.outsider
        self.assertEqual((await self.client.get(avatar['url'])).status_code, 200)
        async with self.sessions() as db:
            await validate_avatar(db, avatar['url'], 'member')
            from fastapi import HTTPException
            with self.assertRaises(HTTPException):
                await validate_avatar(db, avatar['url'], 'outsider')
        self.current_user = self.member
        response = await self.client.post('/api/v1/files/upload',
            data={'channel_id': 'private'}, files={'file': ('private.png', b'private', 'image/png')})
        async with self.sessions() as db:
            with self.assertRaises(HTTPException):
                await validate_avatar(db, response.json()['url'], 'member')

    async def test_legacy_upload_requires_channel_access(self):
        key = 'member_old.txt'
        Path(self.uploads.name, key).write_text('legacy', encoding='utf-8')
        async with self.sessions() as db:
            db.add(Message(id='legacy-file', channel_id='private', sender_id='member',
                attachments=[{'url': f'http://138.124.80.26:8000/uploads/{key}'}]))
            await db.commit()
        self.assertEqual((await self.client.get('/uploads/' + key)).status_code, 404)
        self.current_user = self.member
        self.assertEqual((await self.client.get('/uploads/' + key)).text, 'legacy')

    async def test_file_access_follows_membership_and_revocation(self):
        self.current_user = self.member
        response = await self.client.post('/api/v1/files/upload', data={'channel_id': 'private'},
            files={'file': ('private.txt', b'private', 'text/plain')})
        url = response.json()['url']
        async with self.sessions() as db:
            db.add(ChannelMember(channel_id='private', user_id='outsider'))
            await db.commit()
        self.current_user = self.outsider
        self.assertEqual((await self.client.get(url)).status_code, 200)
        async with self.sessions() as db:
            await db.execute(delete(ChannelMember).where(ChannelMember.channel_id == 'private'))
            await db.commit()
        self.assertEqual((await self.client.get(url)).status_code, 404)
        self.current_user = self.member
        self.assertEqual((await self.client.get(url)).status_code, 404)
        self.assertEqual((await self.client.post('/livekit/token', json={'channel_id': 'private'})).status_code, 404)

    async def test_idempotent_send_reuses_message_and_detects_changed_payload(self):
        data = {'content': 'once', 'client_request_id': str(uuid4())}
        with patch('app.api.v1.messages.manager.broadcast_to_channel', new_callable=AsyncMock) as broadcast:
            first = await self.client.post('/channels/public/messages', json=data)
            second = await self.client.post('/channels/public/messages', json=data)
            self.assertEqual(first.status_code, 201, first.text)
            self.assertEqual(first.json()['id'], second.json()['id'])
            self.assertEqual(second.json()['client_request_id'], data['client_request_id'])
            self.assertEqual(broadcast.await_count, 1)
        changed = await self.client.post('/channels/public/messages', json={**data, 'content': 'different'})
        self.assertEqual(changed.status_code, 409)
        self.current_user = self.member
        other_sender = await self.client.post('/channels/public/messages', json=data)
        self.assertNotEqual(first.json()['id'], other_sender.json()['id'])
        another_channel = await self.client.post('/channels/private/messages', json=data)
        self.assertEqual(another_channel.status_code, 409)

    async def test_idempotent_replay_still_requires_access(self):
        self.current_user = self.member
        data = {'content': 'private', 'client_request_id': str(uuid4())}
        self.assertEqual((await self.client.post('/channels/private/messages', json=data)).status_code, 201)
        async with self.sessions() as db:
            await db.execute(delete(ChannelMember).where(ChannelMember.channel_id == 'private'))
            await db.commit()
        self.assertEqual((await self.client.post('/channels/private/messages', json=data)).status_code, 404)

    async def test_concurrent_retries_commit_only_one_message(self):
        # Separate connections to a real temporary database exercise the unique constraint.
        engine = create_async_engine('sqlite+aiosqlite:///' + str(Path(self.uploads.name) / 'race.db'))
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            async with sessions() as db:
                db.add_all([User(id='outsider', username='outsider', display_name='User', hashed_password='x'),
                            Channel(id='public', name='Public', is_direct=False)])
                await db.commit()

            async def database():
                async with sessions() as db:
                    yield db

            self.app.dependency_overrides[get_db] = database
            from app.api.v1.messages import find_previous_send
            both_read = asyncio.Event()
            reads = 0

            async def synchronize_first_reads(*args):
                nonlocal reads
                result = await find_previous_send(*args)
                if result is None:
                    reads += 1
                    if reads == 2:
                        both_read.set()
                    await asyncio.wait_for(both_read.wait(), 5)
                return result

            data = {'content': 'race', 'client_request_id': str(uuid4())}
            with patch('app.api.v1.messages.find_previous_send', side_effect=synchronize_first_reads), \
                 patch('app.api.v1.messages.manager.broadcast_to_channel', new_callable=AsyncMock) as broadcast:
                first, second = await asyncio.gather(*[
                    self.client.post('/channels/public/messages', json=data) for _ in range(2)
                ])
                self.assertEqual(first.status_code, 201, first.text)
                self.assertEqual(second.status_code, 201, second.text)
                self.assertEqual(first.json()['id'], second.json()['id'])
                self.assertEqual(broadcast.await_count, 1)
            async with sessions() as db:
                self.assertEqual(await db.scalar(select(func.count()).select_from(Message)), 1)
        finally:
            await engine.dispose()

    async def test_cursor_does_not_skip_equal_timestamps(self):
        async with self.sessions() as db:
            for i in range(7):
                db.add(Message(id=f'tie{i}', channel_id='public', sender_id='member',
                    content=f'tie{i}', created_at=datetime(2027, 1, 1, 0, 0, 0, 123456, tzinfo=timezone.utc)))
            await db.commit()
        ids = []
        params = {'limit': 3}
        for _ in range(30):
            response = await self.client.get('/channels/public/messages', params=params)
            self.assertEqual(response.status_code, 200, response.text)
            page = response.json()
            if not page:
                break
            ids.extend(m['id'] for m in page)
            params['before_id'] = page[0]['id']
        self.assertEqual(len(ids), 67)
        self.assertEqual(len(set(ids)), 67)
        self.assertTrue({f'tie{i}' for i in range(7)}.issubset(ids))
        response = await self.client.get('/channels/public/messages', params={'before_id': 'secret'})
        self.assertEqual(response.status_code, 404)
