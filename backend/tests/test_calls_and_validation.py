import unittest
from unittest.mock import AsyncMock, patch
from datetime import datetime, timedelta, timezone
from pydantic import ValidationError
from app.schemas.user import UserCreate, UserProfileUpdate
from app.api.v1.calls import router as calls_router
from app.core.calls import CallRegistry
from app.core.sockets import ConnectionManager
from app.models import ChannelMember, User
import test_channel_access as fixtures

class Socket:
    def __init__(self): self.messages = []
    async def accept(self): pass
    async def send_text(self, value): self.messages.append(value)

class CallTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.fixture = fixtures.ChannelAccessTests(methodName='test_outsider_cannot_access_private_channel')
        await self.fixture.asyncSetUp()
        self.client = self.fixture.client
        self.fixture.app.include_router(calls_router)
        self.registry = CallRegistry()
        self.manager = ConnectionManager()
        self.caller_socket, self.callee_socket = Socket(), Socket()
        await self.manager.connect(self.caller_socket, 'member')
        await self.manager.connect(self.callee_socket, 'outsider')
        async with self.fixture.sessions() as db:
            db.add(ChannelMember(channel_id='private', user_id='outsider'))
            self.third = User(id='third', username='third', display_name='Third', hashed_password='unused')
            db.add(self.third)
            await db.commit()
        self.patches = [patch('app.api.v1.calls.calls', self.registry), patch('app.api.v1.livekit.calls', self.registry), patch('app.core.calls.manager', self.manager), patch('app.core.calls.close_voice_room', new_callable=AsyncMock)]
        for item in self.patches: item.start()
        self.fixture.current_user = self.fixture.member

    async def asyncTearDown(self):
        await self.registry.shutdown()
        for item in reversed(self.patches): item.stop()
        await self.fixture.asyncTearDown()
        self.fixture.doCleanups()

    async def test_accept_reject_access_and_token_consent(self):
        self.assertEqual((await self.client.post('/livekit/token', json={'channel_id':'private'})).status_code, 409)
        response = await self.client.post('/calls', json={'channel_id':'private'})
        self.assertEqual(response.status_code, 201, response.text)
        call = response.json()
        self.assertTrue(self.callee_socket.messages)
        self.assertEqual((await self.client.post('/calls', json={'channel_id':'private'})).status_code, 409)
        self.assertEqual((await self.client.post('/calls/'+call['id']+'/accept')).status_code, 404)
        self.fixture.current_user = self.third
        self.assertEqual((await self.client.post('/calls/'+call['id']+'/end')).status_code, 404)
        self.fixture.current_user = self.fixture.outsider
        self.assertEqual((await self.client.post('/calls/'+call['id']+'/accept')).json()['status'], 'accepted')
        self.assertEqual((await self.client.post('/livekit/token', json={'channel_id':'private'})).status_code, 200)
        self.assertEqual((await self.client.post('/calls/'+call['id']+'/end')).json()['status'], 'ended')
        self.assertIsNone(self.registry.current('member'))
        self.assertEqual((await self.client.post('/livekit/token', json={'channel_id':'private'})).status_code, 409)

    async def test_expired_and_offline_calls(self):
        response = await self.client.post('/calls', json={'channel_id':'private'})
        call = response.json()
        self.registry.calls[call['id']]['expires_at'] = (datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
        self.fixture.current_user = self.fixture.outsider
        self.assertEqual((await self.client.post('/calls/'+call['id']+'/accept')).status_code, 410)
        await self.registry.finish(call['id'], reason='timeout')
        self.assertIn('timeout', self.caller_socket.messages[-1])
        self.manager.disconnect(self.callee_socket, 'outsider')
        self.fixture.current_user = self.fixture.member
        self.assertEqual((await self.client.post('/calls', json={'channel_id':'private'})).status_code, 409)

    async def test_room_and_outsider_cannot_create_private_call(self):
        self.assertEqual((await self.client.post('/calls', json={'channel_id':'public'})).status_code, 400)
        self.fixture.current_user = self.third
        self.assertEqual((await self.client.post('/calls', json={'channel_id':'private'})).status_code, 404)

class ValidationTests(unittest.TestCase):
    def test_registration_and_profile_validation(self):
        valid = {'username':' User ', 'display_name':' Name ', 'password':'safe-password', 'invite_code':'invite'}
        self.assertEqual(UserCreate(**valid).username, 'User')
        for invalid in [{'username':'  '}, {'display_name':' '}, {'password':''}, {'password':'short'}, {'password':'я'*37}, {'username':'x'*51}]:
            with self.assertRaises(ValidationError): UserCreate(**{**valid, **invalid})
        for invalid in [{'status':'invalid'}, {'custom_activity':'x'*151}, {'display_name':'   '}, {'avatar_url':'x'*501}]:
            with self.assertRaises(ValidationError): UserProfileUpdate(**invalid)
