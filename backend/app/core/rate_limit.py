from collections import OrderedDict, deque
from time import monotonic
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

class AuthRateLimit(BaseHTTPMiddleware):
    """Bounded per-process limiter; production deployment uses one worker."""
    def __init__(self, app):
        super().__init__(app)
        self.attempts = OrderedDict()

    async def dispatch(self, request, call_next):
        if request.method == 'POST' and request.url.path in {
            '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/invites'
        }:
            key = (request.client.host if request.client else 'unknown', request.url.path)
            now = monotonic()
            queue = self.attempts.setdefault(key, deque())
            self.attempts.move_to_end(key)
            while queue and queue[0] <= now - 60:
                queue.popleft()
            if len(queue) >= 10:
                return JSONResponse({'detail': 'Слишком много попыток. Подождите минуту.'}, 429, headers={'Retry-After': '60'})
            queue.append(now)
            while len(self.attempts) > 10000:
                self.attempts.popitem(last=False)
        return await call_next(request)
