import requests
import time
from datetime import datetime
from app.core.config import WEBHOOK_URL


class AlertService:
    def __init__(self, webhook_url: str, cooldown_seconds: int = 300):
        self.webhook_url = webhook_url
        self.cooldown = cooldown_seconds
        self._last_sent = {}

    def _should_send(self, key: str) -> bool:
        now = time.time()
        last = self._last_sent.get(key, 0)

        if now - last > self.cooldown:
            self._last_sent[key] = now
            return True
        return False

    def send(self, key: str, message: str):
        if not self._should_send(key):
            return

        try:
            resp = requests.post(
                self.webhook_url,
                json={"text": message},
                timeout=5
            )
            resp.raise_for_status()

        except Exception as e:
            print(f"[ALERT ERROR] {e}")


def format_alert(alert_type: str, message: str, context: dict = None):
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    ctx_str = ""
    if context:
        ctx_str = "\n".join([f"- {k}: {v}" for k, v in context.items()])
        ctx_str = f"\nContext:\n{ctx_str}"

    return f"""[ALERT][ETL]

Type: {alert_type}
Time: {ts}

Message:
{message}{ctx_str}
"""