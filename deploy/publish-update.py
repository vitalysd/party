"""Publish an uploaded signed release atomically. Run on the VPS in /opt/pati.

Usage: python3 deploy/publish-update.py /root/pati-release-1.1.1
Upload the folder produced by frontend/scripts/build-windows.ps1 first.
"""
import json
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

root = Path('/opt/pati/updates')
source = Path(sys.argv[1]).resolve()
manifest = json.loads((source / 'latest.json').read_text(encoding='utf-8'))
version = manifest['version']
assert re.fullmatch(r'\d+\.\d+\.\d+', version), 'Invalid version'
platform = manifest['platforms']['windows-x86_64']
url = urlparse(platform['url'])
name = f'pati_{version}_x64-setup.exe'
assert url.scheme == 'https' and url.netloc == '31-172-67-27.sslip.io'
assert url.path == f'/updates/{version}/{name}'
assert (source / name).stat().st_size > 0
assert (source / (name + '.sig')).read_text().strip() == platform['signature']
root.mkdir(exist_ok=True)
destination = root / version
assert not destination.exists(), 'Published versions are immutable; increase the version'
staging = root / f'.{version}.incoming'
staging.mkdir(exist_ok=False)
for filename in [name, name + '.sig']:
    shutil.copy2(source / filename, staging / filename)
staging.rename(destination)
# Files must be reachable before latest.json starts advertising the new release.
temporary = root / '.latest.json.tmp'
temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
temporary.replace(root / 'latest.json')
print(f'Published {version}')
