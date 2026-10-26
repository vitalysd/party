"""Integration checks against a dedicated disposable database, never pati_db."""
import os
os.environ['DATABASE_URL'] = os.environ['DATABASE_URL'].rsplit('/', 1)[0] + '/pati_verify'
os.environ['UPLOAD_DIR'] = '/tmp/pati-verify-uploads'
import asyncio
import uuid
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.core.config import settings
from app.core.database import engine, Base

async def main():
    assert str(engine.url).endswith('/pati_verify')
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://verify') as client:
        async def register(name, code):
            return await client.post('/api/v1/auth/register', json=dict(username=name, display_name=name, password='Integration-only-password-394', invite_code=code))
        assert (await register('forbidden', 'wrong')).status_code == 403
        admin = (await register('admin', settings.BOOTSTRAP_INVITE_CODE)).json()
        assert admin['user']['is_admin']
        ah = {'Authorization': 'Bearer '+admin['access_token']}
        invite = (await client.post('/api/v1/auth/invites', headers=ah, json={'max_uses':1})).json()['code']
        outcomes = await asyncio.gather(register('first', invite), register('second', invite))
        assert sorted(r.status_code for r in outcomes) == [201, 400], [r.status_code for r in outcomes]
        member = next(r.json() for r in outcomes if r.status_code == 201)
        assert not member['user']['is_admin']
        mh = {'Authorization': 'Bearer '+member['access_token']}
        invite = (await client.post('/api/v1/auth/invites', headers=ah, json={'max_uses':1})).json()['code']
        outsider = (await register('outsider', invite)).json()
        oh = {'Authorization': 'Bearer '+outsider['access_token']}
        path = '/api/v1/channels/dm/'+member['user']['id']
        dms = await asyncio.gather(client.post(path, headers=ah), client.post(path, headers=ah))
        assert all(r.status_code == 200 for r in dms)
        channel = dms[0].json()['id']
        assert channel == dms[1].json()['id']
        path = '/api/v1/channels/'+channel+'/messages'
        assert (await client.get(path, headers=oh)).status_code == 404
        payload = {'content':'integration message', 'client_request_id':str(uuid.uuid4())}
        sent = await asyncio.gather(client.post(path, headers=ah, json=payload), client.post(path, headers=ah, json=payload))
        assert all(r.status_code == 201 for r in sent), [r.status_code for r in sent]
        assert sent[0].json()['id'] == sent[1].json()['id']
        history = (await client.get(path, headers=mh)).json()
        assert len(history) == 1
        result = await client.post('/api/v1/files/upload', headers=ah,
            data={'channel_id':channel}, files={'file':('verify.txt',b'verified private data','text/plain')})
        assert result.status_code == 200, result.text
        file_url = result.json()['url']
        assert (await client.get(file_url, headers=mh)).content == b'verified private data'
        assert (await client.get(file_url, headers=oh)).status_code in (403,404)
        assert (await client.post('/api/v1/livekit/token', headers=mh, json={'channel_id':channel})).status_code == 200
        assert (await client.post('/api/v1/livekit/token', headers=oh, json={'channel_id':channel})).status_code == 404
        result = await client.patch('/api/v1/users/me', headers=mh, json={'custom_activity':'activity'})
        assert result.status_code == 200
        result = await client.patch('/api/v1/users/me', headers=mh, json={'custom_activity':'','avatar_url':''})
        assert result.status_code == 200 and not result.json()['custom_activity']
    await engine.dispose()
    print('PASS: PostgreSQL registration races, invite limit, DM races, idempotent send, history, private files, scoped voice tokens, profile clearing')

asyncio.run(main())
