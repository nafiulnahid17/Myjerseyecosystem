"""My Jersey private, read-through engine gateway. No simulation or embedded credentials.
Run: python -m uvicorn gateway:app --host 127.0.0.1 --port 8765
For remote hosts configure MYJERSEY_ACCESS_TOKEN, an authenticated reverse proxy,
per-user identity and production rate limits before exposure.
"""
import hmac
import os
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.background import BackgroundTask

ROOT = Path(__file__).resolve().parent
ENGINES = {
    "artboard": ("ARTBOARD_V031_URL", "ARTBOARD_V031_TOKEN", "/health/ready"),
    "frame": ("FRAMEFORGE_URL", "FRAMEFORGE_TOKEN", "/api/healthz"),
    "assets": ("ASSETSX_URL", "ASSETSX_TOKEN", "/health"),
    "autofly": ("AUTOFLY_URL", "AUTOFLY_TOKEN", "/api/healthz"),
}
ID = r"[A-Za-z0-9_-]{1,100}"
FILENAME = r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}"
PATHS = {
    "artboard": [
        ("POST", r"api/artboard/projects"), ("GET", rf"api/artboard/projects/{ID}"),
        ("POST", r"api/artboard/upload"), ("POST", r"api/artboard/prepare"),
        ("POST", r"api/artboard/production"), ("POST", r"api/artboard/export"),
        ("GET", rf"api/artboard/jobs/{ID}"), ("POST", rf"api/artboard/jobs/{ID}/cancel"),
        ("GET", rf"api/artboard/projects/{ID}/artifacts/(?:{FILENAME}/)*{FILENAME}"),
    ],
    "frame": [
        ("GET", r"api/frameforge/capabilities"), ("GET", r"api/frameforge/templates"),
        ("GET", rf"api/frameforge/templates/{ID}/preview\.svg"),
        ("POST", r"api/frameforge/jobs/mockup"),
        ("POST", rf"api/frameforge/jobs/{ID}/video"),
        ("GET", rf"api/frameforge/jobs/{ID}"),
        ("POST", rf"api/frameforge/jobs/{ID}/cancel"),
        ("GET", rf"api/frameforge/jobs/{ID}/output"),
    ],
    "assets": [
        ("GET", r"v1/capabilities"), ("POST", r"v1/assets"),
        ("GET", rf"v1/assets/{ID}"), ("GET", rf"v1/assets/{ID}/preview"),
        ("POST", r"v1/jobs"), ("GET", rf"v1/jobs/{ID}"),
        ("GET", rf"v1/jobs/{ID}/download/{FILENAME}"),
    ],
    "autofly": [
        ("GET", r"api/autofly/capabilities"),
        ("POST", r"api/autofly/jobs/from-brief"),
        ("POST", r"api/autofly/jobs/from-panels"),
        ("POST", r"api/autofly/jobs/from-combined"),
        ("GET", rf"api/autofly/jobs/{ID}"),
        ("POST", rf"api/autofly/jobs/{ID}/cancel"),
        ("GET", rf"api/autofly/jobs/{ID}/bundle"),
        ("GET", rf"api/autofly/jobs/{ID}/files/{FILENAME}"),
    ],
}
app = FastAPI(title="My Jersey Private Engine Gateway", docs_url=None, redoc_url=None)


def details(engine: str):
    if engine not in ENGINES:
        raise HTTPException(404, "Unknown engine")
    url_key, token_key, health = ENGINES[engine]
    url, token = os.getenv(url_key, "").strip().rstrip("/"), os.getenv(token_key, "").strip()
    parsed = urlparse(url)
    if not url or not token:
        return None
    if parsed.scheme != "https" and not (os.getenv("MYJERSEY_ALLOW_LOCAL_HTTP") == "1" and parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost"}):
        return None
    if not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        return None
    return url, token, health


def authenticate(req: Request):
    key = os.getenv("MYJERSEY_ACCESS_TOKEN", "").strip()
    if not key:
        # Refuse gateway access without explicit application authentication.
        raise HTTPException(503, "MYJERSEY_ACCESS_TOKEN is not configured")
    submitted = req.headers.get("x-workspace-key", "")
    if not hmac.compare_digest(key.encode(), submitted.encode()):
        raise HTTPException(401, "Workspace authentication required")


@app.get("/api/status")
async def status(req: Request):
    authenticate(req)
    output = {}
    async with httpx.AsyncClient(timeout=httpx.Timeout(7, connect=3), follow_redirects=False) as client:
        for name in ENGINES:
            config = details(name)
            if not config:
                output[name] = {"state": "not_configured"}
                continue
            base, secret, health = config
            headers = {"Authorization": "Bearer " + secret}
            if name == "artboard":
                principal = os.getenv("MYJERSEY_ARTBOARD_PRINCIPAL", "").strip()
                if not re.fullmatch(r"[A-Za-z0-9_:.@-]{1,128}", principal):
                    output[name] = {"state": "missing_identity"}
                    continue
                headers["X-Artboard-User"] = principal
            try:
                response = await client.get(base + health, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    # Require a specific health contract; a generic HTTP 200 is insufficient.
                    if not isinstance(data, dict):
                        output[name] = {"state": "not_ready"}
                        continue
                    expected = {"artboard": data.get("status") == "ready", "frame": data.get("status") == "ok", "assets": data.get("ok") is True, "autofly": data.get("status") == "ok"}
                    output[name] = {"state": "online" if expected[name] else "not_ready", "version": data.get("version")}
                else:
                    output[name] = {"state": "not_ready", "http_status": response.status_code}
            except (httpx.HTTPError, ValueError):
                output[name] = {"state": "unreachable"}
    return {"engines": output, "source": "live_health_requests"}


@app.api_route("/api/engine/{engine}/{path:path}", methods=["GET", "POST"])
async def proxy(engine: str, path: str, req: Request):
    authenticate(req)
    if engine not in ENGINES or not any(method == req.method and re.fullmatch(pattern, path) for method, pattern in PATHS[engine]):
        raise HTTPException(404, "Unsupported engine operation")
    config = details(engine)
    if not config:
        raise HTTPException(503, "Engine not configured with HTTPS URL and server-side token")
    base, token, _ = config
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json, application/octet-stream, image/*"}
    if engine == "artboard":
        identity = os.getenv("MYJERSEY_ARTBOARD_PRINCIPAL", "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_:.@-]{1,128}", identity):
            raise HTTPException(503, "Server-side Artboard identity is missing")
        headers["X-Artboard-User"] = identity
    if req.method == "POST":
        content_type = req.headers.get("content-type", "")
        if not (content_type.startswith("multipart/form-data;") or content_type.startswith("application/json")):
            raise HTTPException(415, "JSON or multipart data required")
        headers["Content-Type"] = content_type
        if req.headers.get("content-length") and int(req.headers["content-length"]) > 52 * 1024 * 1024:
            raise HTTPException(413, "Maximum request size exceeded")
        body = await req.body()
        if len(body) > 52 * 1024 * 1024:
            raise HTTPException(413, "Maximum request size exceeded")
    else:
        body = None
    client = httpx.AsyncClient(timeout=httpx.Timeout(310, connect=15), follow_redirects=False)
    try:
        target = base + "/" + path
        upstream = client.build_request(req.method, target, params=req.query_params, headers=headers, content=body)
        response = await client.send(upstream, stream=True)
    except httpx.HTTPError:
        await client.aclose()
        raise HTTPException(502, "Engine upstream request failed")
    async def cleanup():
        await response.aclose()
        await client.aclose()
    media_type = response.headers.get("content-type", "application/octet-stream").split(";")[0]
    outgoing = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
    if "content-disposition" in response.headers:
        outgoing["Content-Disposition"] = response.headers["content-disposition"]
    if media_type in {"image/svg+xml", "text/html", "application/pdf", "application/postscript"}:
        outgoing["Content-Security-Policy"] = "default-src 'none'; sandbox"
        outgoing["Content-Disposition"] = "attachment"
    return StreamingResponse(response.aiter_bytes(), status_code=response.status_code, media_type=media_type,
                             headers=outgoing, background=BackgroundTask(cleanup))

# Serve only explicitly authorized frontend files. Never expose .env, gateway.py,
# requirements, tests, or runtime files through the static file server.
@app.get("/", include_in_schema=False)
def frontend_index():
    return FileResponse(ROOT / "index.html", media_type="text/html", headers={"Cache-Control": "no-cache"})

@app.get("/index.html", include_in_schema=False)
def frontend_index_alias():
    return frontend_index()

@app.get("/styles.css", include_in_schema=False)
def frontend_css():
    return FileResponse(ROOT / "styles.css", media_type="text/css")

@app.get("/app.js", include_in_schema=False)
def frontend_js():
    return FileResponse(ROOT / "app.js", media_type="application/javascript")

app.mount("/templates", StaticFiles(directory=str(ROOT / "templates")), name="templates")
app.mount("/assets", StaticFiles(directory=str(ROOT / "assets")), name="assets")
