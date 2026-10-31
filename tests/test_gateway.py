import os
import sys
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gateway import app, PATHS


def test_public_assets_and_private_file_blocking():
    with TestClient(app) as client:
        for p in ('/', '/index.html', '/styles.css', '/app.js', '/templates/mockup_luxury_float.svg', '/assets/atherious-labs.svg'):
            assert client.get(p).status_code == 200
        for p in ('/gateway.py','/.env.example','/requirements.txt','/tests/test_gateway.py'):
            assert client.get(p).status_code == 404


def test_authentication_required_for_all_gateway_data():
    with patch.dict(os.environ, {'MYJERSEY_ACCESS_TOKEN': 'example-test-key'}, clear=False):
        with TestClient(app) as client:
            assert client.get('/api/status').status_code == 401
            assert client.get('/api/status',headers={'X-Workspace-Key':'wrong'}).status_code == 401
            good={'X-Workspace-Key':'example-test-key'}
            j=client.get('/api/status',headers=good)
            assert j.status_code == 200
            assert j.json()['source']=='live_health_requests'
            assert all(v['state']=='not_configured' for v in j.json()['engines'].values())
            assert client.post('/api/engine/autofly/api/autofly/jobs/from-brief',headers=good,json={}).status_code == 503
            assert client.get('/api/engine/frame/README.md',headers=good).status_code == 404
            assert client.get('/api/engine/assets/v1/jobs/test/download/../../etc/passwd',headers=good).status_code in (400,404)


def test_only_shipped_frameforge_template_paths():
    import re
    valid=['mockup_luxury_float','mockup_stadium_hero','mockup_editorial_launch','video_luxury_360','video_stadium_reveal','video_kinetic_social']
    assert all((Path(__file__).parents[1]/'templates'/f'{x}.svg').is_file() for x in valid)
    patterns=[p for method,p in PATHS['frame'] if method=='GET']
    assert all(any(re.fullmatch(pattern,'api/frameforge/templates/'+x+'/preview.svg') for pattern in patterns) for x in valid)
