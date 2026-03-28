"""
FastAPI backend for Life Lens.

Serves the Quest app, dashboard API, and local media assets over the same LAN.

Usage:
    pip install fastapi uvicorn
    cd vr-app
    uvicorn server:app --host 0.0.0.0 --port 8000
"""

import json
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

app = FastAPI(title="VR Therapy Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
ASSETS_DIR = BASE_DIR / "assets"
DATA_DIR = BASE_DIR / "data"
SESSIONS_DIR = DATA_DIR / "sessions"
PATIENTS_FILE = DATA_DIR / "patients.json"

DATA_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


class StagePayload(BaseModel):
    id: str
    title: str = Field(min_length=1)
    scene: str = Field(min_length=1)
    video_url: str = Field(min_length=1)
    image_url: str = ""
    duration_minutes: int = Field(default=5, ge=1, le=60)
    therapist_goal: str = ""
    script: str = Field(min_length=1)


class SessionPayload(BaseModel):
    title: str = Field(min_length=1)
    patient_id: str = Field(min_length=1)
    patient_name: str = ""
    description: str = ""
    music_url: str = ""
    opening_prompt: str = ""
    status: str = "draft"
    stages: List[StagePayload] = Field(min_length=1)


def _session_path(session_id: str) -> Path:
    return SESSIONS_DIR / f"{session_id}.json"


def _read_json(path: Path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text())


def _write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2))


def _load_patient_index():
    return _read_json(PATIENTS_FILE, {})


def _save_patient_index(index) -> None:
    _write_json(PATIENTS_FILE, index)


def _load_session(session_id: str):
    session_file = _session_path(session_id)
    if not session_file.exists():
        raise HTTPException(status_code=404, detail="Session not found")
    return _read_json(session_file, {})


def _session_summary(session):
    return {
        "id": session["id"],
        "title": session["title"],
        "patient_id": session["patient_id"],
        "patient_name": session.get("patient_name", ""),
        "status": session.get("status", "draft"),
        "stage_count": len(session.get("stages", [])),
        "updated_at": session.get("updated_at"),
    }


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
# Session API for therapist dashboard + Quest runtime
# ——————————————————————————————————————
@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    return _load_session(session_id)


@app.post("/sessions", status_code=201)
async def create_session(payload: SessionPayload):
    session_id = f"session-{uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    session = {
        "id": session_id,
        "title": payload.title,
        "patient_id": payload.patient_id,
        "patient_name": payload.patient_name,
        "description": payload.description,
        "music_url": payload.music_url,
        "opening_prompt": payload.opening_prompt,
        "status": payload.status,
        "stages": [stage.model_dump() for stage in payload.stages],
        "created_at": now,
        "updated_at": now,
        "gemini_script": {
            "opening_prompt": payload.opening_prompt,
            "stages": [
                {"scene": stage.scene, "script": stage.script}
                for stage in payload.stages
            ],
        },
    }

    _write_json(_session_path(session_id), session)

    patient_index = _load_patient_index()
    patient_sessions = patient_index.setdefault(
        payload.patient_id,
        {
            "patient_id": payload.patient_id,
            "patient_name": payload.patient_name,
            "session_ids": [],
        },
    )
    patient_sessions["patient_name"] = payload.patient_name
    patient_sessions["session_ids"] = list(
        dict.fromkeys([session_id] + patient_sessions["session_ids"])
    )
    _save_patient_index(patient_index)

    return session


@app.get("/patients/{patient_id}/sessions")
async def list_patient_sessions(patient_id: str):
    patient_index = _load_patient_index()
    patient = patient_index.get(patient_id)
    if not patient:
        return {
            "patient_id": patient_id,
            "patient_name": "",
            "sessions": [],
        }

    sessions = []
    for session_id in patient.get("session_ids", []):
        session_file = _session_path(session_id)
        if session_file.exists():
            sessions.append(_session_summary(_read_json(session_file, {})))

    sessions.sort(key=lambda item: item.get("updated_at", ""), reverse=True)
    return {
        "patient_id": patient_id,
        "patient_name": patient.get("patient_name", ""),
        "sessions": sessions,
    }


# ——————————————————————————————————————
# Serve frontend static files (index.html, main.js)
# ——————————————————————————————————————
@app.get("/main.js")
async def serve_js():
    return FileResponse(BASE_DIR / "main.js", media_type="application/javascript")


@app.get("/three.min.js")
async def serve_three():
    return FileResponse(BASE_DIR / "three.min.js", media_type="application/javascript")


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
