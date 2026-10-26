import unittest
import logging
from app.core.logging import RedactTokenFilter

class LoggingTests(unittest.TestCase):
    def test_websocket_tokens_are_redacted(self):
        record = logging.LogRecord('uvicorn.error', logging.INFO, '', 0, 'WebSocket %s accepted', ('/ws?token=secret-token&other=value',), None)
        RedactTokenFilter().filter(record)
        self.assertNotIn('secret-token', record.getMessage())
        self.assertIn('other=value', record.getMessage())
