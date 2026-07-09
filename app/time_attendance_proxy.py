"""Reverse proxy to the Time Attendance Node service."""

from __future__ import annotations

import os

import httpx
from fastapi import Request, Response
from fastapi.responses import JSONResponse

TIME_ATTENDANCE_URL = os.getenv("TIME_ATTENDANCE_URL", "http://127.0.0.1:8011").rstrip("/")
TIME_ATTENDANCE_PATH = os.getenv("TIME_ATTENDANCE_PATH", "/hr-approve").rstrip("/")

_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
}


def _build_upstream_url(path: str, query: str) -> str:
    suffix = path.strip("/")
    upstream_path = TIME_ATTENDANCE_PATH if not suffix else f"{TIME_ATTENDANCE_PATH}/{suffix}"
    url = f"{TIME_ATTENDANCE_URL}{upstream_path}"
    if query:
        url = f"{url}?{query}"
    return url


def _forward_headers(request: Request) -> dict[str, str]:
    return {
        key: value
        for key, value in request.headers.items()
        if key.lower() not in _HOP_BY_HOP and key.lower() != "host"
    }


def _response_headers(headers: httpx.Headers) -> dict[str, str]:
    return {
        key: value
        for key, value in headers.items()
        if key.lower() not in _HOP_BY_HOP
    }


async def proxy_time_attendance(request: Request, path: str = "") -> Response:
    url = _build_upstream_url(path, request.url.query)
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=False) as client:
            upstream = await client.request(
                request.method,
                url,
                headers=_forward_headers(request),
                content=await request.body(),
            )
    except httpx.ConnectError:
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Time Attendance is not running. "
                    "Start it with: pm2 start ecosystem.config.cjs "
                    "or: cd services/time-attendance && npm start"
                ),
            },
        )
    except httpx.HTTPError as exc:
        return JSONResponse(
            status_code=502,
            content={"detail": f"Time Attendance proxy error: {exc}"},
        )

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=_response_headers(upstream.headers),
        media_type=upstream.headers.get("content-type"),
    )
