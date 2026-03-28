# Life Lens Therapist Dashboard

React dashboard for building staged VR therapy sessions and saving them to the FastAPI backend that the Quest app reads from.

## Run

1. Start the FastAPI server:

```bash
cd /Users/jeevikakiran/Documents/PersonalLearning/BuildWithGemini/lifelens/Life-Lens/vr-app
uvicorn server:app --host 0.0.0.0 --port 8000
```

2. Start the React dashboard:

```bash
cd /Users/jeevikakiran/Documents/PersonalLearning/BuildWithGemini/lifelens/Life-Lens/dashboard
npm install
npm run dev
```

3. Open the dashboard at `http://localhost:5173`.

## API shape

The dashboard writes session payloads to `POST /sessions` and expects:

- `title`, `patient_id`, `patient_name`, `description`, `music_url`, `opening_prompt`, `status`
- `stages[]` with `scene`, `video_url`, `image_url`, `duration_minutes`, `therapist_goal`, `script`

The FastAPI server persists JSON files under `vr-app/data/sessions/` and exposes:

- `GET /sessions/{id}`
- `POST /sessions`
- `GET /patients/{patient_id}/sessions`
