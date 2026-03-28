import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

const sceneOptions = [
  { value: "meadow", label: "Meadow" },
  { value: "ocean", label: "Ocean" },
  { value: "mountain", label: "Mountain" },
  { value: "forest", label: "Forest" },
  { value: "sunset", label: "Sunset" },
];

function createStage(index, overrides = {}) {
  return {
    id: `stage-${crypto.randomUUID()}`,
    title: `Stage ${index + 1}`,
    scene: sceneOptions[index]?.value ?? "meadow",
    video_url: `/assets/${sceneOptions[index]?.value ?? "meadow"}.mp4`,
    image_url: "",
    duration_minutes: 5,
    therapist_goal: "",
    script: "",
    ...overrides,
  };
}

const initialForm = {
  title: "Evening Calm Reset",
  patient_id: "patient-001",
  patient_name: "Taylor Brooks",
  description: "A gentle three-part decompression session for evening anxiety.",
  music_url: "/assets/calm-ambient.mp3",
  opening_prompt:
    "You are a calm, grounding meditation guide. Speak slowly, gently, and with reassurance. Transition only when the patient sounds ready.",
  status: "draft",
  stages: [
    createStage(0, {
      title: "Arrival",
      scene: "meadow",
      video_url: "/assets/meadow.mp4",
      therapist_goal: "Slow breathing and orient the patient into the headset.",
      script:
        "Begin in the meadow. Invite three slow breaths, soften the shoulders, and help the patient settle into the environment.",
    }),
    createStage(1, {
      title: "Release",
      scene: "ocean",
      video_url: "/assets/ocean.mp4",
      therapist_goal: "Release tension and deepen the sense of safety.",
      script:
        "Transition to the ocean. Use the rhythm of the waves to guide a longer exhale and let the patient release the day.",
    }),
    createStage(2, {
      title: "Grounding",
      scene: "mountain",
      video_url: "/assets/mountain.mp4",
      therapist_goal: "Close with steadiness and confidence.",
      script:
        "Move to the mountain. Ground attention in the body, reinforce stability, and end with a clear invitation to re-enter the room.",
    }),
  ],
};

function App() {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [lookupPatientId, setLookupPatientId] = useState(initialForm.patient_id);
  const [patientSessions, setPatientSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  useEffect(() => {
    void loadPatientSessions(lookupPatientId);
  }, []);

  async function loadPatientSessions(patientId) {
    if (!patientId.trim()) {
      setPatientSessions([]);
      return;
    }

    setLoadingSessions(true);
    try {
      const response = await fetch(
        `${API_BASE}/patients/${encodeURIComponent(patientId)}/sessions`,
      );
      const payload = await response.json();
      setPatientSessions(payload.sessions ?? []);
    } catch (error) {
      setPatientSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateStage(stageId, field, value) {
    setForm((current) => ({
      ...current,
      stages: current.stages.map((stage) =>
        stage.id === stageId ? { ...stage, [field]: value } : stage,
      ),
    }));
  }

  function addStage() {
    setForm((current) => ({
      ...current,
      stages: [...current.stages, createStage(current.stages.length)],
    }));
  }

  function duplicateStage(stageId) {
    setForm((current) => {
      const target = current.stages.find((stage) => stage.id === stageId);
      if (!target) return current;

      return {
        ...current,
        stages: [
          ...current.stages,
          createStage(current.stages.length, {
            ...target,
            id: `stage-${crypto.randomUUID()}`,
            title: `${target.title} Copy`,
          }),
        ],
      };
    });
  }

  function removeStage(stageId) {
    setForm((current) => ({
      ...current,
      stages:
        current.stages.length === 1
          ? current.stages
          : current.stages.filter((stage) => stage.id !== stageId),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setSaveResult(null);

    try {
      const response = await fetch(`${API_BASE}/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error("Failed to save session");
      }

      const payload = await response.json();
      setSaveResult({
        type: "success",
        message: `Saved ${payload.title} as ${payload.id}`,
      });
      setLookupPatientId(form.patient_id);
      await loadPatientSessions(form.patient_id);
    } catch (error) {
      setSaveResult({
        type: "error",
        message: "Could not save the session. Check that FastAPI is running on port 8000.",
      });
    } finally {
      setSaving(false);
    }
  }

  const geminiPreview = useMemo(
    () => ({
      opening_prompt: form.opening_prompt,
      stages: form.stages.map((stage) => ({
        scene: stage.scene,
        script: stage.script,
      })),
    }),
    [form],
  );

  return (
    <div className="app-shell">
      <aside className="hero-panel">
        <p className="eyebrow">Life Lens</p>
        <h1>Therapist session builder for guided VR care.</h1>
        <p className="hero-copy">
          Design the exact scene flow, therapeutic goals, and Gemini guidance
          that the Quest app should preload and run.
        </p>

        <div className="info-card">
          <span>Quest runtime</span>
          <strong>Fetches one session config before startup</strong>
          <p>
            Every stage you define here becomes both preload metadata for the
            scene manager and a script segment for Gemini Live.
          </p>
        </div>

        <div className="info-card">
          <span>Network setup</span>
          <strong>{API_BASE}</strong>
          <p>
            Point the dashboard and Quest browser at the same FastAPI host on
            local WiFi for the demo.
          </p>
        </div>
      </aside>

      <main className="workspace">
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Session</p>
              <h2>Build a patient-ready journey</h2>
            </div>
            <button className="ghost-button" type="button" onClick={addStage}>
              Add stage
            </button>
          </div>

          <form className="session-form" onSubmit={handleSubmit}>
            <div className="grid two-up">
              <label>
                Session title
                <input
                  value={form.title}
                  onChange={(event) => updateField("title", event.target.value)}
                  placeholder="After-work reset"
                />
              </label>

              <label>
                Status
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value)}
                >
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                  <option value="assigned">Assigned</option>
                </select>
              </label>

              <label>
                Patient ID
                <input
                  value={form.patient_id}
                  onChange={(event) => updateField("patient_id", event.target.value)}
                  placeholder="patient-001"
                />
              </label>

              <label>
                Patient name
                <input
                  value={form.patient_name}
                  onChange={(event) => updateField("patient_name", event.target.value)}
                  placeholder="Taylor Brooks"
                />
              </label>
            </div>

            <label>
              Session description
              <textarea
                rows="3"
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="What this session is meant to support."
              />
            </label>

            <div className="grid two-up">
              <label>
                Music asset URL
                <input
                  value={form.music_url}
                  onChange={(event) => updateField("music_url", event.target.value)}
                  placeholder="/assets/calm-ambient.mp3"
                />
              </label>

              <label>
                Opening Gemini prompt
                <textarea
                  rows="3"
                  value={form.opening_prompt}
                  onChange={(event) =>
                    updateField("opening_prompt", event.target.value)
                  }
                  placeholder="Voice, tone, pacing, and safety guidance."
                />
              </label>
            </div>

            <div className="stage-stack">
              {form.stages.map((stage, index) => (
                <article className="stage-card" key={stage.id}>
                  <div className="stage-header">
                    <div>
                      <p className="stage-kicker">Stage {index + 1}</p>
                      <input
                        className="stage-title"
                        value={stage.title}
                        onChange={(event) =>
                          updateStage(stage.id, "title", event.target.value)
                        }
                      />
                    </div>

                    <div className="stage-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => duplicateStage(stage.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => removeStage(stage.id)}
                        disabled={form.stages.length === 1}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="grid stage-grid">
                    <label>
                      Scene
                      <select
                        value={stage.scene}
                        onChange={(event) =>
                          updateStage(stage.id, "scene", event.target.value)
                        }
                      >
                        {sceneOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Video URL
                      <input
                        value={stage.video_url}
                        onChange={(event) =>
                          updateStage(stage.id, "video_url", event.target.value)
                        }
                        placeholder="/assets/meadow.mp4"
                      />
                    </label>

                    <label>
                      Preview image URL
                      <input
                        value={stage.image_url}
                        onChange={(event) =>
                          updateStage(stage.id, "image_url", event.target.value)
                        }
                        placeholder="/assets/meadow.jpg"
                      />
                    </label>

                    <label>
                      Duration (minutes)
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={stage.duration_minutes}
                        onChange={(event) =>
                          updateStage(
                            stage.id,
                            "duration_minutes",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  </div>

                  <label>
                    Therapist goal
                    <textarea
                      rows="2"
                      value={stage.therapist_goal}
                      onChange={(event) =>
                        updateStage(stage.id, "therapist_goal", event.target.value)
                      }
                      placeholder="What the patient should achieve in this moment."
                    />
                  </label>

                  <label>
                    Gemini instructions for this stage
                    <textarea
                      rows="5"
                      value={stage.script}
                      onChange={(event) =>
                        updateStage(stage.id, "script", event.target.value)
                      }
                      placeholder="Guide breathing, grounding, imagery, and transition cues."
                    />
                  </label>
                </article>
              ))}
            </div>

            <div className="submit-row">
              <button className="primary-button" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save session"}
              </button>
              {saveResult && (
                <p className={`save-message ${saveResult.type}`}>
                  {saveResult.message}
                </p>
              )}
            </div>
          </form>
        </section>

        <section className="panel side-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Assigned sessions</p>
              <h2>Patient lookup</h2>
            </div>
          </div>

          <div className="lookup-row">
            <input
              value={lookupPatientId}
              onChange={(event) => setLookupPatientId(event.target.value)}
              placeholder="patient-001"
            />
            <button
              type="button"
              className="ghost-button"
              onClick={() => loadPatientSessions(lookupPatientId)}
            >
              Load
            </button>
          </div>

          <div className="session-list">
            {loadingSessions ? (
              <p className="muted">Loading assigned sessions...</p>
            ) : patientSessions.length ? (
              patientSessions.map((session) => (
                <article className="saved-session" key={session.id}>
                  <strong>{session.title}</strong>
                  <span>{session.status}</span>
                  <p>
                    {session.stage_count} stages • Updated{" "}
                    {new Date(session.updated_at).toLocaleString()}
                  </p>
                  <code>{session.id}</code>
                </article>
              ))
            ) : (
              <p className="muted">
                No saved sessions for this patient yet. Saving from the form
                above will populate this list.
              </p>
            )}
          </div>

          <div className="preview-card">
            <p className="eyebrow">Gemini payload preview</p>
            <pre>{JSON.stringify(geminiPreview, null, 2)}</pre>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
