import unittest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from pydantic import ValidationError
from app.core.rate_limit import AuthRateLimit
from app.core.config import Settings
from app.main import app as production_app

class ProductionGuardTests(unittest.IsolatedAsyncioTestCase):
    async def test_rate_limit_response_keeps_desktop_cors_headers(self):
        # Use the actual production middleware order without database routes.
        app = FastAPI()
        for middleware in reversed(production_app.user_middleware):
            app.add_middleware(middleware.cls, *middleware.args, **middleware.kwargs)

        @app.post('/api/v1/auth/login')
        async def login(): return {'ok': True}

        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            origin = production_app.user_middleware[0].kwargs['allow_origins'][0]
            for _ in range(11):
                response = await client.post('/api/v1/auth/login', headers={'Origin': origin})
            self.assertEqual(response.status_code, 429)
            self.assertEqual(response.headers.get('access-control-allow-origin'), origin)
            self.assertEqual(response.headers.get('retry-after'), '60')

    def test_default_secrets_rejected_in_production(self):
        with self.assertRaises(ValidationError):
            Settings(_env_file=None, ENVIRONMENT='production')

    async def test_auth_limit_does_not_block_health_or_other_clients(self):
        app = FastAPI()
        app.add_middleware(AuthRateLimit)
        @app.post('/api/v1/auth/login')
        async def login(): return {'ok': True}
        @app.get('/health')
        async def health(): return {'ok': True}
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            for _ in range(10):
                self.assertEqual((await client.post('/api/v1/auth/login')).status_code, 200)
            self.assertEqual((await client.post('/api/v1/auth/login')).status_code, 429)
            self.assertEqual((await client.get('/health')).status_code, 200)
        async with AsyncClient(transport=ASGITransport(app=app, client=('10.0.0.2', 5000)), base_url='http://test') as client:
            self.assertEqual((await client.post('/api/v1/auth/login')).status_code, 200)
