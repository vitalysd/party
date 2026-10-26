"""Regression checks in a dedicated disposable PostgreSQL database, never the live DB."""
import os
os.environ['DATABASE_URL'] = os.environ['DATABASE_URL'].rsplit('/', 1)[0] + '/pati_fixes_verify'
os.environ['UPLOAD_DIR'] = '/tmp/pati-fixes-uploads'
import asyncio, json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from alembic import command
from alembic.config import Config
from sqlalchemy import text, select
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.core.sockets import manager
from app.core.calls import calls
from app.core.storage import cleanup_uploads
from app.models.upload import UploadedFile

class Socket:
    def __init__(self): self.messages=[]
    async def accept(self): pass
    async def send_text(self, message): self.messages.append(json.loads(message))

async def prepare():
    assert engine.url.database == 'pati_fixes_verify'
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Simulate the old production table so the additive migration is exercised.
        await conn.execute(text('ALTER TABLE uploaded_files DROP COLUMN created_at'))
    await engine.dispose()

async def main():
    assert engine.url.database == 'pati_fixes_verify'
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://verify') as client:
        async def register(name, code):
            response=await client.post('/api/v1/auth/register',json={'username':name,'display_name':name,'password':'Integration-only-password-394','invite_code':code})
            assert response.status_code == 201, (response.status_code,response.text)
            return response.json()
        admin=await register('verify-admin', settings.BOOTSTRAP_INVITE_CODE)
        ah={'Authorization':'Bearer '+admin['access_token']}
        async def invited(name):
            response=await client.post('/api/v1/auth/invites',headers=ah,json={'max_uses':1})
            return await register(name,response.json()['code'])
        member=await invited('verify-member')
        outsider=await invited('verify-outsider')
        mh={'Authorization':'Bearer '+member['access_token']}; oh={'Authorization':'Bearer '+outsider['access_token']}
        a,b,c=Socket(),Socket(),Socket()
        for socket,user in [(a,admin),(b,member),(c,outsider)]: await manager.connect(socket,user['user']['id'])
        channel=(await client.post('/api/v1/channels/dm/'+member['user']['id'],headers=ah)).json()['id']
        manager.subscribe_channel(channel,a); manager.subscribe_channel('other-room',b)
        response=await client.post(f'/api/v1/channels/{channel}/messages',headers=ah,json={'content':'Background DM'})
        assert response.status_code==201,response.text
        assert any(event['type']=='NEW_MESSAGE' for event in b.messages)
        assert not any(event['type']=='NEW_MESSAGE' for event in c.messages)
        assert (await client.post('/api/v1/livekit/token',headers=ah,json={'channel_id':channel})).status_code==409
        call=(await client.post('/api/v1/calls',headers=ah,json={'channel_id':channel})).json()
        assert call['status']=='ringing'
        assert any(event['type']=='CALL_CHANGED' for event in b.messages)
        assert (await client.post(f"/api/v1/calls/{call['id']}/accept",headers=oh)).status_code==404
        assert (await client.post(f"/api/v1/calls/{call['id']}/accept",headers=mh)).json()['status']=='accepted'
        assert (await client.post('/api/v1/livekit/token',headers=ah,json={'channel_id':channel})).status_code==200
        assert (await client.post(f"/api/v1/calls/{call['id']}/end",headers=ah)).json()['status']=='ended'
        print('PASS: background DM delivery, private call signalling/consent/authorization and LiveKit close')
        room=(await client.post('/api/v1/channels',headers=ah,json={'name':'Disposable text voice room'})).json()['id']
        async def upload(contents):
            return await client.post('/api/v1/files/upload',headers=ah,data={'channel_id':room},files={'file':('test.txt',contents,'text/plain')})
        used=(await upload(b'kept data')).json()
        orphan=(await upload(b'orphan data')).json()
        assert (await client.post(f'/api/v1/channels/{room}/messages',headers=ah,json={'content':'File', 'attachments':[used]})).status_code==201
        old_quota=settings.MAX_USER_UPLOAD_BYTES
        settings.MAX_USER_UPLOAD_BYTES=1
        assert (await upload(b'exceeds quota')).status_code==507
        settings.MAX_USER_UPLOAD_BYTES=old_quota
        async with AsyncSessionLocal() as db:
            for key in [used['key'],orphan['key']]:
                row=await db.get(UploadedFile,key)
                row.created_at=datetime.now(timezone.utc)-timedelta(days=3)
            await db.commit()
            assert await cleanup_uploads(db)==1
        assert (Path(settings.UPLOAD_DIR)/used['key']).is_file()
        assert not (Path(settings.UPLOAD_DIR)/orphan['key']).exists()
        response=await client.delete('/api/v1/channels/'+room,headers=ah)
        assert response.status_code==204,response.text
        assert not (Path(settings.UPLOAD_DIR)/used['key']).exists()
        assert (await client.post('/api/v1/livekit/token',headers=ah,json={'channel_id':room})).status_code==404
        assert (await client.patch('/api/v1/users/me',headers=ah,json={'status':'invalid'})).status_code==422
        assert (await client.post('/api/v1/auth/register',json={'username':' ', 'display_name':' ', 'password':'', 'invite_code':'x'})).status_code==422
        print('PASS: PostgreSQL migration, quotas, referenced-file retention, text-room/file deletion and validation')
        for socket,user in [(a,admin),(b,member),(c,outsider)]: manager.disconnect(socket,user['user']['id'])
    await calls.shutdown()
    await engine.dispose()

asyncio.run(prepare())
command.upgrade(Config('/app/alembic.ini'), 'head')
asyncio.run(main())
