"""Run once in /opt/pati. Secrets remain on the target server."""
import json
import os
import secrets
from pathlib import Path

root = Path('/opt/pati')
assert Path.cwd() == root
os.umask(0o077)
if (root / '.env').exists():
    raise SystemExit('Existing environment preserved; review it manually')
db_password, jwt_secret, lk_secret = (secrets.token_hex(32) for _ in range(3))
lk_key = secrets.token_hex(12)
bootstrap = 'PATI-' + secrets.token_hex(12).upper()
origin = 'https://185-18-52-100.sslip.io:9443'
env = dict(ENVIRONMENT='production', AUTO_CREATE_SCHEMA='false',
    SECRET_KEY=jwt_secret, BOOTSTRAP_INVITE_CODE=bootstrap,
    POSTGRES_USER='pati_user', POSTGRES_PASSWORD=db_password, POSTGRES_DB='pati_db',
    DATABASE_URL=f'postgresql+asyncpg://pati_user:{db_password}@postgres:5432/pati_db',
    LIVEKIT_URL='http://livekit:7880', LIVEKIT_PUBLIC_URL=origin.replace('https:', 'wss:')+'/livekit',
    LIVEKIT_API_KEY=lk_key, LIVEKIT_API_SECRET=lk_secret,
    CORS_ORIGINS=json.dumps([origin, 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']), UPLOAD_DIR='/app/uploads',
    MINIO_ENDPOINT='127.0.0.1:9')
(root / '.env').write_text('\n'.join(f'{k}={v}' for k,v in env.items())+'\n')
(root / 'livekit.yaml').write_text(f'''port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50050
  use_external_ip: true
keys:
  {lk_key}: {lk_secret}
logging:
  level: warn
''')
(root / 'bootstrap-invite.txt').write_text(origin+'/?invite='+bootstrap+'\n')
(root / 'uploads').mkdir(exist_ok=True)
print('Environment and private bootstrap invitation created; secrets not printed')
