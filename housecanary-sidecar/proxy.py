"""
Auth-gated reverse proxy in front of housecanary-mcp (the third-party PyPI
package that wraps HouseCanary's Analytics API as ~180 MCP tools).

Why this exists: housecanary-mcp ships with no authentication of its own on
the HTTP endpoint it serves - confirmed by reading its source
(housecanary_mcp/server.py). The only credentials it takes are the
HouseCanary API username/password, which it uses to call HouseCanary's API,
not to protect the MCP endpoint. Deployed as-is on a public URL, anyone who
finds it could list and call every tool, and every call bills against the
HouseCanary account.

This process spawns housecanary-mcp as a child bound to loopback only, and
reverse-proxies bearer-token-authenticated, rate-limited requests to it -
the same posture as the main FUB MCP server in ../src/index.js.
"""

import asyncio
import hmac
import os
import subprocess
import time
from contextlib import asynccontextmanager

import httpx
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, StreamingResponse
from starlette.routing import Route

INTERNAL_HOST = "127.0.0.1"
INTERNAL_PORT = 8123
MCP_PATH = "/mcp"
INTERNAL_URL = f"http://{INTERNAL_HOST}:{INTERNAL_PORT}"

AUTH_TOKENS = [t.strip() for t in os.environ.get("MCP_AUTH_TOKENS", "").split(",") if t.strip()]
AUTH_REQUIRED = bool(AUTH_TOKENS)

RATE_LIMIT_WINDOW_S = 60
RATE_LIMIT_MAX = 120
_hits: dict[str, tuple[int, float]] = {}

HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailers", "transfer-encoding", "upgrade", "content-length",
    # Starlette/uvicorn set these on the outgoing response themselves;
    # forwarding the upstream's copies too would just duplicate them.
    "date", "server",
}


def _client_ip(request: Request) -> str:
    # Railway terminates TLS in front of us and sets X-Forwarded-For, same
    # as the main app's `app.set("trust proxy", 1)` in src/index.js.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limited(ip: str) -> bool:
    now = time.monotonic()
    count, reset_at = _hits.get(ip, (0, now + RATE_LIMIT_WINDOW_S))
    if now >= reset_at:
        count, reset_at = 0, now + RATE_LIMIT_WINDOW_S
    count += 1
    _hits[ip] = (count, reset_at)
    return count > RATE_LIMIT_MAX


def _token_matches(token: str) -> bool:
    # Compare against every configured token (no early return) so response
    # time doesn't leak how close an invalid token got - same rationale as
    # timingSafeEqualStr in ../src/authUtils.js.
    token_bytes = token.encode()
    matched = False
    for valid in AUTH_TOKENS:
        if hmac.compare_digest(token_bytes, valid.encode()):
            matched = True
    return matched


_http_client: httpx.AsyncClient | None = None
_child: subprocess.Popen | None = None


async def _wait_for_internal_server(timeout_s: float = 30.0) -> None:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        try:
            _, writer = await asyncio.open_connection(INTERNAL_HOST, INTERNAL_PORT)
            writer.close()
            await writer.wait_closed()
            return
        except OSError:
            await asyncio.sleep(0.5)
    raise RuntimeError("housecanary-mcp did not start listening in time")


@asynccontextmanager
async def lifespan(_app: Starlette):
    global _http_client, _child

    env = os.environ.copy()
    env["FASTMCP_TRANSPORT"] = "http"
    env["FASTMCP_HOST"] = INTERNAL_HOST
    env["FASTMCP_PORT"] = str(INTERNAL_PORT)
    env["FASTMCP_STREAMABLE_HTTP_PATH"] = MCP_PATH
    env.setdefault("FASTMCP_SHOW_SERVER_BANNER", "false")

    _child = subprocess.Popen(["housecanary-mcp"], env=env)
    try:
        await _wait_for_internal_server()
    except RuntimeError:
        _child.kill()
        raise

    _http_client = httpx.AsyncClient(base_url=INTERNAL_URL, timeout=60.0)
    try:
        yield
    finally:
        await _http_client.aclose()
        _child.terminate()
        try:
            _child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            _child.kill()


async def health(_request: Request) -> JSONResponse:
    return JSONResponse({"status": "ok"})


async def proxy_mcp(request: Request):
    if AUTH_REQUIRED:
        header = request.headers.get("authorization", "")
        token = header[7:] if header.startswith("Bearer ") else None
        if not token or not _token_matches(token):
            return JSONResponse(
                {"jsonrpc": "2.0", "error": {"code": -32001, "message": "Unauthorized"}, "id": None},
                status_code=401,
            )

    if _rate_limited(_client_ip(request)):
        return JSONResponse(
            {"error": "too_many_requests", "error_description": "Rate limit exceeded, try again later."},
            status_code=429,
        )

    body = await request.body()
    forward_headers = {
        k: v for k, v in request.headers.items()
        if k.lower() not in HOP_BY_HOP and k.lower() != "host"
    }

    upstream_request = _http_client.build_request(
        request.method, MCP_PATH, headers=forward_headers, content=body
    )
    upstream_response = await _http_client.send(upstream_request, stream=True)

    response_headers = {
        k: v for k, v in upstream_response.headers.items()
        if k.lower() not in HOP_BY_HOP
    }

    async def body_stream():
        try:
            async for chunk in upstream_response.aiter_raw():
                yield chunk
        finally:
            await upstream_response.aclose()

    return StreamingResponse(
        body_stream(),
        status_code=upstream_response.status_code,
        headers=response_headers,
    )


app = Starlette(
    lifespan=lifespan,
    routes=[
        Route("/health", health, methods=["GET"]),
        Route(MCP_PATH, proxy_mcp, methods=["GET", "POST", "DELETE"]),
    ],
)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
