import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException
from livekit import api
from app.api.v1.livekit import room_participants


class VoicePreviewTests(unittest.IsolatedAsyncioTestCase):
    async def test_preview_uses_real_room_and_track_mute_state(self):
        client = MagicMock()
        client.room.list_participants = AsyncMock(return_value=api.ListParticipantsResponse(participants=[
            api.ParticipantInfo(identity='alice', name='Alice', tracks=[
                api.TrackInfo(source=api.TrackSource.MICROPHONE, muted=True),
                api.TrackInfo(source=api.TrackSource.SCREEN_SHARE, muted=False),
            ])]))
        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=client)
        context.__aexit__ = AsyncMock(return_value=False)
        with patch('app.api.v1.livekit.require_channel_access', AsyncMock(return_value=SimpleNamespace(id='public', is_direct=False))), patch('app.api.v1.livekit.api.LiveKitAPI', return_value=context):
            result = await room_participants('public', SimpleNamespace(id='viewer'), None)
        self.assertEqual(client.room.list_participants.call_args.args[0].room, 'channel:public')
        self.assertEqual(result[0]['identity'], 'alice')
        self.assertTrue(result[0]['isMuted'])
        self.assertTrue(result[0]['isScreenSharing'])

    async def test_access_denied_never_contacts_voice_server(self):
        with patch('app.api.v1.livekit.require_channel_access', AsyncMock(side_effect=HTTPException(404))), patch('app.api.v1.livekit.api.LiveKitAPI') as client:
            with self.assertRaises(HTTPException):
                await room_participants('private', SimpleNamespace(id='outsider'), None)
            client.assert_not_called()

    async def test_direct_chat_preview_is_not_exposed(self):
        with patch('app.api.v1.livekit.require_channel_access', AsyncMock(return_value=SimpleNamespace(is_direct=True))), patch('app.api.v1.livekit.api.LiveKitAPI') as client:
            with self.assertRaises(HTTPException) as error:
                await room_participants('dm', SimpleNamespace(id='member'), None)
            self.assertEqual(error.exception.status_code, 400)
            client.assert_not_called()
