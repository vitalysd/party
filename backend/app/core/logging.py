import logging
import re

class RedactTokenFilter(logging.Filter):
    def filter(self, record):
        message = record.getMessage()
        redacted = re.sub(r'([?&]token=)[^&\s\"\']+', r'\1[redacted]', message)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True

def configure_log_redaction():
    for name in ('uvicorn.error', 'uvicorn.access'):
        logger = logging.getLogger(name)
        if not any(isinstance(item, RedactTokenFilter) for item in logger.filters):
            logger.addFilter(RedactTokenFilter())
