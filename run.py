"""Start the HR Approval Dashboard web server."""

from __future__ import annotations

import os
import socket
from datetime import datetime
from pathlib import Path

import uvicorn
from dotenv import load_dotenv

load_dotenv()

ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / "logs"


def get_local_ips() -> list[str]:
    ips: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            ips.append(sock.getsockname()[0])
    except OSError:
        pass

    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass

    return ips or ["127.0.0.1"]


def log_startup(host: str, port: int) -> None:
    LOG_DIR.mkdir(exist_ok=True)
    log_file = LOG_DIR / "server.log"
    ips = get_local_ips()
    lines = [
        f"[{datetime.now().isoformat(timespec='seconds')}] Server started on {host}:{port}",
        f"  Local:   http://127.0.0.1:{port}",
    ]
    for ip in ips:
        lines.append(f"  Network: http://{ip}:{port}")
    message = "\n".join(lines) + "\n"

    try:
        with log_file.open("a", encoding="utf-8") as fh:
            fh.write(message)
    except OSError:
        pass

    if os.environ.get("HR_APPROVE_SILENT") != "1":
        print(message)


if __name__ == "__main__":
    host = os.getenv("DASHBOARD_HOST", "0.0.0.0")
    port = int(os.getenv("DASHBOARD_PORT", "8000"))
    log_startup(host, port)
    uvicorn.run("app.main:app", host=host, port=port, reload=False)
