"""
FastAPI backend for VR Therapy app.

Serves the frontend files and video assets to the Quest browser over local WiFi.

Usage:
    pip install fastapi uvicorn
    cd vr-app
    uvicorn server:app --host 0.0.0.0 --port 8000

Then open http://<your-local-ip>:8000 on the Quest browser.
"""

import os
import socket
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).parent.parent / ".env")

app = FastAPI(title="VR Therapy Server")

BASE_DIR = Path(__file__).parent
ASSETS_DIR = BASE_DIR / "assets"


@app.get("/api/config")
async def get_config():
    key = os.getenv("GEMINI_API_KEY", "")
    return JSONResponse({"geminiApiKey": key})


# ——————————————————————————————————————
# Video streaming with Range request support
# (Quest browser needs this for <video> seeking/looping)
# ——————————————————————————————————————
@app.get("/assets/{filename:path}")
async def serve_asset(filename: str, request: Request):
    file_path = ASSETS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        return HTMLResponse("Not found", status_code=404)

    file_size = file_path.stat().st_size
    content_type = "video/mp4" if filename.endswith(".mp4") else "application/octet-stream"

    range_header = request.headers.get("range")
    if range_header:
        # Parse "bytes=start-end"
        range_spec = range_header.replace("bytes=", "")
        parts = range_spec.split("-")
        start = int(parts[0])
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        length = end - start + 1

        def stream():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    data = f.read(chunk_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        return StreamingResponse(
            stream(),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Cache-Control": "no-cache",
            },
        )

    # Full file response
    return FileResponse(file_path, media_type=content_type)


# ——————————————————————————————————————
# Serve frontend static files (index.html, main.js)
# ——————————————————————————————————————
@app.get("/main.js")
async def serve_js():
    return FileResponse(BASE_DIR / "main.js", media_type="application/javascript")


@app.get("/three.min.js")
async def serve_three():
    return FileResponse(BASE_DIR / "three.min.js", media_type="application/javascript")


@app.get("/sceneManager.js")
async def serve_scene():
    return FileResponse(BASE_DIR / "sceneManager.js", media_type="application/javascript")


@app.get("/audioManager.js")
async def serve_audio():
    return FileResponse(BASE_DIR / "audioManager.js", media_type="application/javascript")


@app.get("/geminiManager.js")
async def serve_gemini():
    return FileResponse(BASE_DIR / "geminiManager.js", media_type="application/javascript")


@app.get("/")
async def serve_index():
    return FileResponse(BASE_DIR / "index.html", media_type="text/html")


# ——————————————————————————————————————
# Startup info
# ——————————————————————————————————————
@app.on_event("startup")
async def startup():
    # Find local IP for Quest access
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
    except Exception:
        local_ip = "localhost"

    print("\n" + "=" * 50)
    print("  VR Therapy Server Running")
    print(f"  Local:   http://localhost:8000")
    print(f"  Network: http://{local_ip}:8000")
    print()
    print("  Open the Network URL on your Meta Quest browser")
    print("=" * 50 + "\n")

    # Check for video file
    video_path = ASSETS_DIR / "video.mp4"
    if not video_path.exists():
        print("  WARNING: No video.mp4 found in assets/")
        print(f"  Place a 360 equirectangular MP4 at: {video_path}")
        print()
