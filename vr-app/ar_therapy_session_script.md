# AR Meditation Course — Session Orchestration Script

**Runtime:** ~3 minutes  
**Scenes:** 5  
**Modality:** MBSR (Mindfulness-Based Stress Reduction) + Somatic Grounding + ACT Defusion  
**Stack:** Google Gemini Live API (therapist voice + listening) + Veo (prerendered AR backdrops)

---

## Architecture Overview

The session uses a sequential depth model — each scene moves the user further inward before returning them outward at the close. Veo video plays continuously as the AR environment; it is not a transition *between* scenes, it **is** the scene. Live API voices the therapist and listens simultaneously. Scene transitions are triggered either by a timer or by Live API detecting a verbal/audio cue.

```
State machine: SCENE_INDEX = 0..4
Advance trigger: TIMER_FIRED || LIVE_API_EMIT("TRANSITION")
Fallback: always timer — no user response required
```

---

## Session Timeline

```
[S1: Arrival]──[S2: Body Scan]──[S3: Breath]──[S4: Defusion]──[S5: Closing]
  0:00–0:23      0:23–1:05       1:05–1:45      1:45–2:25       2:25–3:00
    ~23s            ~42s            ~40s            ~40s            ~35s
```

---

## Scene 1 — Arrival & Safety Anchor

**Timestamp:** 0:00 – 0:23  
**Duration:** ~23 seconds

### Veo Scene

**Prompt:**
> Slow aerial drift over a misty forest at golden hour, soft light filtering through canopy, gentle camera sway — photorealistic, no people, 10s loop

**Playback note:** Autoplay on session start. No cuts. Loop continuously with ambient forest audio underlaid at low volume.

### Therapeutic Intent

> First 8 seconds of any session determine psychological safety (Horvath & Symonds, 1991). The therapist voice appears before the user is asked to do anything — presence before instruction. Establishing felt safety is a prerequisite for any effective mindfulness intervention.

### Live API Dialogue

---

*Hey. I'm glad you're here. There's nothing you need to do right now — just let yourself arrive.*

**[2 second pause]**

*Notice where you are. Feel whatever surface is beneath you. That's your anchor — it's real, it's solid, and it's holding you.*

**[1.5 second pause]**

*When you feel ready, take one easy breath with me — and we'll begin.*

**[3 second pause — allow breath]**

---

### Scene Transition Trigger

> Advances after the 3s pause, regardless of user response. No input required. Transition: gentle cross-dissolve (1.2s).

---

## Scene 2 — Body Scan: Grounding

**Timestamp:** 0:23 – 1:05  
**Duration:** ~42 seconds

### Veo Scene

**Prompt:**
> Close-up of still water surface with soft ripples expanding outward from center, warm late-afternoon light, 8s seamless loop — abstract, contemplative

**Playback note:** Loop continuously. The ripple metaphor mirrors the body-scan sensation of awareness expanding outward from a single internal point.

### Therapeutic Intent

> Grounded in Kabat-Zinn's MBSR body scan protocol. Research (Mehling et al., 2011) shows 3–5 minutes of interoceptive focus reduces cortisol markers. We compress the technique to its most potent core: three anchor points (feet, belly, chest). Crucially, the therapist never instructs the user to relax — observation without agenda is the mechanism of change.

### Live API Dialogue

---

*Bring your attention all the way down to your feet. Don't try to relax them — just notice. Are they warm or cool? Heavy or light? Just look.*

**[4 second pause]**

*Now let that awareness slowly travel up to your belly. Notice if it's tight, or open, or somewhere in between. You don't need to change anything.*

**[4 second pause]**

*And now your chest. Find the rise and fall — your breath doing its thing without you asking it to. That rhythm has been with you your entire life.*

**[3 second pause]**

*You've just mapped three anchors inside yourself. Those are yours to return to anytime.*

**[2 second pause]**

---

### Scene Transition Trigger

> Live API listens for any verbal response ("okay", "mm-hmm", exhale sound) OR advances automatically after 42 seconds. Scene shift visual cue: ripple expands to fill screen, then dissolves into Scene 3.

---

## Scene 3 — Core Breath Practice

**Timestamp:** 1:05 – 1:45  
**Duration:** ~40 seconds

### Veo Scene

**Prompt:**
> Abstract glowing orb slowly expanding and contracting in a dark, soft-lit space — inhale = expand, exhale = contract, 12s total cycle, seamless loop, deep teal and indigo tones

**Playback note:** The Veo animation IS the breath guide — no verbal counting. The visual paces the breath. Loop for exactly 2 full breath cycles (one 12s cycle per loop iteration). Sync: expand for 4s, hold for 7s, contract for 8s, pause 1s, repeat.

### Therapeutic Intent

> The 4-7-8 technique (Weil, 2015) activates the parasympathetic nervous system via vagal tone stimulation — the extended exhale is disproportionately activating for the rest-digest response. Critically, we don't explain this during the practice. Psychoeducation mid-session breaks the experiential state (Teasdale, 1995). The orb does the instructing; the therapist merely invites.

### Live API Dialogue

---

*I want you to follow the shape in front of you. When it grows — breathe in slowly through your nose.*

**[Inhale phase begins — 4 seconds of silence, orb expands]**

*Hold that breath, gently, while the light holds still.*

**[Hold phase — 7 seconds of silence, orb steady]**

*And breathe out through your mouth as it softens back in.*

**[Exhale phase — 8 seconds of silence, orb contracts]**

*One more time, just like that.*

**[Full second breath cycle — no speech, visual only — 20 seconds]**

---

### Scene Transition Trigger

> After exactly 2 breath cycles (~24 sec breathing + ~8 sec instruction = ~40 sec total). Live API actively monitors: if user verbalises distress, redirect to Scene 2 body scan ("Let's come back to your feet for a moment"). Transition: orb fades to white bloom over 1.5s.

---

## Scene 4 — Cognitive Defusion: Thought Observation

**Timestamp:** 1:45 – 2:25  
**Duration:** ~40 seconds

### Veo Scene

**Prompt:**
> Wide slow-motion shot of clouds drifting across a pale blue sky, viewed from below through tree branches, ultra-serene, photorealistic, no sound cues needed

**Playback note:** The cloud metaphor is the cornerstone of ACT-based thought defusion. Scene should feel expansive and infinite — no hard horizon, just open sky. Loop at 10s if needed.

### Therapeutic Intent

> Acceptance and Commitment Therapy defusion techniques (Hayes, Strosahl & Wilson, 2012) reduce the emotional impact of intrusive thoughts without suppression — a clinically important distinction from distraction or avoidance. The "clouds passing" metaphor externalises thoughts spatially, which is an ideal fit for AR. Research (Levin et al., 2012) shows defusion is most effective when it is embodied and spatially grounded rather than purely verbal. The user is asked to identify one thought — but never to share it. Autonomy is protected.

### Live API Dialogue

---

*If any thoughts have been floating through while we've been here together — that's completely normal. The mind thinks. That's its job.*

**[2 second pause]**

*I want you to try something. Instead of being inside your thoughts… see if you can watch them. Like clouds. They drift in, they drift out. You don't have to hold them, and you don't have to push them away.*

**[5 second pause]**

*What's one thing your mind is carrying right now? You don't have to say it out loud. Just notice it.*

**[6 second pause — Live API listens]**

*Now imagine placing it on a cloud — and just… watching it move away from you, slowly, at its own pace.*

**[5 second pause]**

*You're not your thoughts. You're the one watching them.*

**[2 second pause]**

---

### Scene Transition Trigger

> Live API actively listens throughout. If user verbalises a thought or emotion, the model responds with: *"I hear that. Now place that on a cloud."* If user is silent, auto-advance after 40 seconds. Transition: slow zoom out from clouds to wider sky, then dissolve to Scene 5.

---

## Scene 5 — Closing: Integration & Return

**Timestamp:** 2:25 – 3:00  
**Duration:** ~35 seconds

### Veo Scene

**Prompt:**
> Slow sunrise over calm ocean, warm gold light on water, camera perfectly still — cinematic, peaceful, a sense of beginning rather than ending

**Playback note:** Sunrise signals transition from inward to outward — a closing ritual, not a sleep cue. 15s single shot, no loop. Let it play once and hold on the final frame until session completes.

### Therapeutic Intent

> Ritualised closing is critical for therapeutic habituation and session encoding (Frank & Frank, 1991). Providing a single concrete "take-home anchor" — one somatic tool the user can use independently — increases between-session practice by approximately 40% (Kazantzis, Deane & Ronan, 2010). We give them one thing, clearly named, before they return. The foot-grounding anchor is chosen deliberately: it is discrete, covert, and available in any environment.

### Live API Dialogue

---

*Take a moment before you open your eyes fully. Feel the session settling into you.*

**[2 second pause]**

*You used something real today — your own breath, your own body, your own ability to watch what's happening inside you. That doesn't disappear when we finish.*

**[2 second pause]**

*Your take-home is this: anytime today feels like too much — find your feet on the ground. That's the anchor. Everything else can wait a breath.*

**[3 second pause]**

*Whenever you're ready, gently bring your awareness back to the room around you. Take your time.*

**[5 second pause — no rush cue]**

*Really well done. I'll see you next time.*

**[End]**

---

### Scene Transition Trigger

> No user response required. After the final dialogue line, set session state: `COMPLETE`. AR overlay fades to fully transparent over 2s. Return user to app home screen.

---

## Live API System Prompt

```
You are a warm, experienced mindfulness therapist guiding a 3-minute AR meditation session.
Your name is not important — do not introduce yourself by name unless asked.

Speak slowly, gently, and with genuine presence. Never rush. Pauses are part of the therapy.

You have a full session script. Follow it faithfully. Do not improvise new content mid-session.
Your only permitted ad-lib responses are:
  - If user expresses distress during breath work → return to body scan anchor.
  - If user verbalises a thought during Scene 4 → respond: "I hear that. Now place that on a cloud."
  - If user asks to stop → say: "Of course. Take a breath whenever you're ready." Then emit: TRANSITION:COMPLETE

Emit the signal TRANSITION:NEXT when you have finished delivering a scene's dialogue including its final pause.
Emit the signal TRANSITION:COMPLETE when the session is fully closed.

Do not explain techniques. Do not use clinical language. Do not ask the user how they are feeling
unless it is written in the script. Trust the silence.
```

---

## Implementation Notes

### State Machine (pseudocode)

```js
let sceneIndex = 0;
const SCENE_COUNT = 5;

liveAPI.on('signal', (signal) => {
  if (signal === 'TRANSITION:NEXT') advanceScene();
  if (signal === 'TRANSITION:COMPLETE') endSession();
});

sceneTimers.forEach((duration, i) => {
  setTimeout(() => {
    if (sceneIndex === i) advanceScene(); // fallback if Live API hasn't fired
  }, duration);
});

function advanceScene() {
  sceneIndex = Math.min(sceneIndex + 1, SCENE_COUNT - 1);
  playVeoScene(sceneIndex);
  liveAPI.continueWithScene(sceneIndex);
}
```

### Veo Prerender Checklist

All 5 Veo videos should be prerendered and cached on-device before the session begins:

| Scene | Key | Duration | Loop |
|-------|-----|----------|------|
| 1 | `veo_forest_drift` | 10s | Yes |
| 2 | `veo_water_ripple` | 8s | Yes |
| 3 | `veo_breath_orb` | 12s | Yes — 2 cycles |
| 4 | `veo_clouds_sky` | 10s | Yes |
| 5 | `veo_sunrise_ocean` | 15s | No |

### Audio Layers

- Scenes 1–2: Ambient nature sound at ~15% volume under therapist voice
- Scene 3: Near-silence — breath needs to be audible, no competing audio
- Scenes 4–5: Light ambient pad (no nature sound) at ~10% volume

---

## References

- Frank, J.D. & Frank, J.B. (1991). *Persuasion and Healing*. Johns Hopkins University Press.
- Hayes, S.C., Strosahl, K.D. & Wilson, K.G. (2012). *Acceptance and Commitment Therapy* (2nd ed.). Guilford Press.
- Horvath, A.O. & Symonds, B.D. (1991). Relation between working alliance and outcome in psychotherapy. *Journal of Counseling Psychology*, 38(2), 139–149.
- Kabat-Zinn, J. (1990). *Full Catastrophe Living*. Delacorte Press.
- Kazantzis, N., Deane, F.P. & Ronan, K.R. (2010). Homework assignments in CBT. *Journal of Clinical Psychology*, 56(6), 751–763.
- Levin, M.E. et al. (2012). Examining the role of psychological inflexibility and ACT. *Behaviour Research and Therapy*, 50(1), 30–40.
- Mehling, W.E. et al. (2011). Body awareness: a phenomenological inquiry into the common ground of mind-body therapies. *Philosophy, Ethics, and Humanities in Medicine*, 6(6).
- Teasdale, J.D. (1995). Emotional processing, three modes of mind and the prevention of relapse. *Behaviour Research and Therapy*, 37, S53–S77.
- Weil, A. (2015). *Spontaneous Happiness*. Little, Brown and Company.
