# VR Therapy App — Tech Stack

## Overview

A WebXR meditation therapy app for Meta Quest. Therapists prescribe multi-scene sessions with AI-guided voice meditation. Patients complete sessions at home in VR.

---

## Frontend — Meta Quest WebXR App

**Language:** Vanilla JavaScript

**Libraries:**
- **Three.js** — 3D rendering, 360 sphere mesh, video textures, crossfade transitions
- **WebXR API** — built into Meta Browser, handles VR mode and headset tracking
- **Web Audio API** — background music playback, audio ducking when Gemini speaks
- **Gemini Live Multimodal API** — real time voice, mic input, `switch_scene` tool calling

**File Structure:**
```
vr-app/
├── index.html          ← minimal HTML, single start button
├── main.js             ← entry point, ties all managers together
├── sceneManager.js     ← 360 sphere, video preloading, crossfade transitions
├── audioManager.js     ← background music, audio ducking
├── geminiManager.js    ← Gemini Live connection, tool calling
└── assets/
    ├── meadow.mp4
    ├── ocean.mp4
    └── music.mp3
```

**How the managers connect:**
```
main.js
├── creates sceneManager, audioManager, geminiManager
├── passes sceneManager.switchScene → geminiManager as callback
├── passes audioManager.duckDown/duckUp → geminiManager as callbacks
└── coordinates startup sequence

geminiManager
└── receives switch_scene tool call from Gemini
    └── fires callback → sceneManager.switchScene()
        └── Three.js crossfades to new 360 video

geminiManager
└── fires onSpeakStart / onSpeakEnd callbacks
    └── audioManager ducks music down / back up
```

**Startup sequence:**
```
1. User clicks "Begin Session"
2. Fetch session config from FastAPI
3. sceneManager preloads all video files
4. audioManager loads music file
5. First scene fades in + music starts
6. Gemini Live connects with session script as system prompt
7. Session begins
```

---

## Frontend — Therapist Dashboard

**Framework:** React

**Key features:**
- Stage-by-stage session builder
- Per stage: choose scene, write Gemini instructions
- Assign sessions to patients
- Saves session config to backend via FastAPI

> Not the focus for the hackathon demo — can be a simple form or hardcoded config initially.

---

## Backend

**Framework:** FastAPI (Python)

**Database:** Local file system (SQLite or flat JSON for hackathon)

**Key endpoints:**
```
GET  /sessions/:id       ← Quest app fetches session config on load
POST /sessions           ← Dashboard creates a new session
GET  /patients/:id/sessions  ← Dashboard lists assigned sessions
```

**Static file serving:**
- FastAPI mounts local assets folder
- 360 videos, images, and audio files served directly via URL
- Quest app fetches files over local WiFi network

**Network requirement:**
- Quest and laptop must be on same WiFi network
- FastAPI runs on something like `192.168.x.x:8000`
- That URL is what the Quest app hits for config and files

---

## AI & Media

| Tool | Purpose |
|---|---|
| **Gemini Live** | Real time voice guidance, follows session script, calls `switch_scene` tool |
| **Gemini Image Gen** | Generate 360 equirectangular environment images |
| **Veo** | Generate short looping 360 videos (10-15 sec seamless loops) |
| **Lyria** | Generate ambient background music per session |

**Gemini Live — how it works:**
- Connects directly from Quest app to Google's servers via WebSocket
- Full session script sent as system prompt on connect
- Gemini follows script per stage but responds naturally to patient
- When ready to transition, Gemini calls `switch_scene` tool with scene name
- Quest app receives tool call event → fires Three.js crossfade

**Session script structure sent to Gemini:**
```json
{
  "stages": [
    { "scene": "meadow",   "script": "Begin in the meadow. Guide breathing..." },
    { "scene": "ocean",    "script": "Transition to the ocean. Deepen relaxation..." },
    { "scene": "mountain", "script": "Rise to the mountains. Final grounding..." }
  ]
}
```

---

## Data Flow

```
Therapist Dashboard (React)
│
│  POST /sessions  (script + stage config)
▼
FastAPI Backend
│  stores session config
│  serves video/audio files
│
│  GET /sessions/:id
▼
Meta Quest WebXR App
│
├── sceneManager  ←── video files from FastAPI /files/
├── audioManager  ←── music file from FastAPI /files/
└── geminiManager ←── connects directly to Google Gemini Live
                       (bypasses FastAPI — direct WebSocket to Google)
```

---

## 360 Video Strategy

**Format:** Equirectangular, 2:1 aspect ratio (e.g. 3840x1920)

**Approach:** Short seamless loops (10-15 seconds)
- Subtle motion only — swaying leaves, drifting clouds, rippling water
- Camera completely stationary (any movement causes VR sickness)
- Loop begins and ends in same state

**File sizes (approx):**
| Quality | Size |
|---|---|
| 1080p 360° loop | 20-50MB |
| 4K 360° loop | 80-150MB |

**Preloading strategy:**
- All stage videos preloaded on session start
- Loading screen shown while buffering ("Preparing your session...")
- By the time headset is on, everything is ready
- Scene switches are instant — no loading gaps mid-session

---

## Key Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| VR framework | Three.js + WebXR | Best Meta Browser support, large ecosystem |
| Backend | FastAPI | Already set up by teammate |
| Scene switching trigger | Gemini tool calling | Cleaner than transcript listening |
| Video strategy | Short looping clips | Small file size, instant scene switches |
| Audio mixing | Web Audio API gain nodes | Native ducking control |
| API key security | Gemini called client-side for hackathon | Fine for demo, move server-side for production |
