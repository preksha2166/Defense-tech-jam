# TRUSTLINE: ABYSS

A browser game about **calibrated trust in an imperfect AI teammate**.
Defense Tech Jam · Seattle 2026 · Challenge 02 — Trust Your Synthetic Teammates.

You command a damaged submarine after a storm. ATLAS, your surviving AI
teammate, reads the sensors and recommends what to do. It is sometimes
right, sometimes confidently wrong, and sometimes correct while openly
uncertain. The game scores whether your reliance on it tracks the evidence.

> The game is not "Trust AI." The game is "Know **when** to trust AI."

---

## Team

Built by **Team 1 · Hackoholics** at the Defense Tech Jam, Seattle 2026.

| | Role | Contribution |
|---|---|---|
| **[Chirag Patankar](https://www.linkedin.com/in/chiragpatankar/)** | Game development · Lead developer | Led core game development and implementation: gameplay systems, checkpoint and scenario logic, ATLAS's behaviour, sensor and evidence mechanics, interaction flow and the browser-based playable build. Worked with Raj on architecture, integration, debugging, testing and the final build. |
| **[Raj Ranjit Yadav](https://www.linkedin.com/in/rajx463/)** | Developer · 3D, gameplay and technical integration | Gameplay implementation, 3D environment integration, interaction systems, technical polish, testing and performance. Connected the submarine exploration, sensor systems and checkpoint logic to the decision-making experience. |
| **[Preksha Dewoolkar](https://www.linkedin.com/in/preksha-prashant-dewoolkar-2224512a/)** | UI/UX and frontend · Gameplay systems · Content, video and documentation | The player-facing UI and HUD, screen layouts and interaction flow. Gameplay systems, ATLAS's recommendations and dialogue, the checkpoint clues and scenario content. Made the intro video, and led the project documentation, game narrative, challenge framing and final deliverables. |
| **[Purvesha Kolhe](https://www.linkedin.com/in/purvesha-kolhe)** | Visuals · Music · Theme | Led the visual direction, music and overall theme: the underwater sci-fi identity, the HUD aesthetic, visual assets and game presentation, and the audio and music that set the mood. |

Team-wide: ideation, playtesting, iteration, integration and the final
presentation. See [TRUSTLINE-ABYSS-Team-Credits.pptx](TRUSTLINE-ABYSS-Team-Credits.pptx)
and the [pitch deck](TRUSTLINE-ABYSS-Pitch-Deck.pptx).

Originally developed in [ChiragPatankar/Defense-tech-jam](https://github.com/ChiragPatankar/Defense-tech-jam).

---

## Running it

**There is no build step and no dependencies to install.**

Double-click `index.html`. That's it — it runs offline, from a USB stick,
on any modern browser.

**While developing**, use the included server instead:

```bash
python3 serve.py
```

then open <http://localhost:8777>.

Do not use `python3 -m http.server` — it sends no `Cache-Control` header, so
browsers apply heuristic caching and silently serve a stale script after you
save. That looks exactly like "my change did nothing" and costs real time.
`serve.py` sends no-cache headers and serves its own folder from anywhere.

---

## Deploying to Cloudflare

```bash
npx wrangler login     # one-time, opens a browser
./deploy.sh            # stages ./public and publishes
```

`deploy.sh` copies just the runtime files into `public/` and points wrangler
at that. **Do not point Cloudflare at the repo root** — wrangler's
`.assetsignore` was not honoured in testing and it happily uploaded all 201
files including `.git`, which would publish the entire commit history on a
public URL. The staging directory makes that impossible.

---

## Controls

| Key | Action |
|-----|--------|
| `1` | TRUST — accept the recommendation |
| `2` | QUESTION — ask ATLAS for its reasoning (costs 15s) |
| `3` | INVESTIGATE — launch the drone (costs 25% power) |
| `4` | OVERRIDE — reject and decide manually |
| `Enter` / `Space` | Advance |
| `M` | Mute |
| `P` | Toggle graphics quality (high / low) |
| `V` | **Switch view** — cockpit ↔ external navigation |
| `Space` / `Shift` | Thrust (builds speed against drag) |
| `←` `→` / `A` `D` | Rudder |
| `↑` `↓` / `W` `S` | Dive planes — climb / dive (self-centring) |
| `C` | Hand back to autopilot |
| `Shift` + `1`–`0` | **Judge mode** — jump to any checkpoint |

### Free navigation

Press `V` for the external navigation view. The cockpit console is hidden
entirely and replaced by a clean corner-anchored HUD over a full-screen 3D
view — heading, depth, speed and waypoint bearing in the corners, water in
the middle. Press `V` again and the cockpit returns exactly as it was.

Handling follows a submarine model rather than a car: `Space` applies thrust
which builds speed against drag (release and you coast down), the arrow keys
steer and work the dive planes, and the planes self-centre when released. A
lateral current pushes you off course.

Depth is integrated separately from forward travel, so the planes keep
authority while coasting (`MIN_PLANE_FLOW` in `env3d.js`). The vertical
envelope runs from the keel limit just above the seabed up to 150 units;
pitch levels automatically when you reach either limit.

Each leg places a **waypoint beacon** ahead; the HUD gives you its distance,
relative bearing on the compass, and whether to climb or dive to meet it.

The **sonar scope is heading-up and live** — straight up is dead ahead. It
paints three kinds of return:

| Mark | Meaning |
|---|---|
| Amber diamond `WPT` + bearing line | the waypoint you are heading for |
| Cyan dot `CLUE` | an unscanned clue beacon |
| Green ringed dot `✓` | a clue you have already logged |
| Faint green speckle | scripted sensor returns for this checkpoint |

Navigation contacts stay lit between sweeps so you can steer by them;
scripted sensor returns decay with the sweep as before. The
moment you touch a control the autopilot disengages; `C` hands it back, and
committing a decision hands it back automatically.

Each checkpoint scatters one **clue beacon** per clue out in the water. Fly
within range of one and it logs — the HUD tracks `◈ CLUES 2/4` and the clue
is marked ✓ VERIFIED in the observation panel. Clues you never reach are
still revealed when you decide — **driving is never required**, so the demo
can't stall while a judge flies in circles.

This is deliberately optional. The core loop is the decision, not the flying.

### If the demo machine stutters

The 3D scene samples its own frame rate for the first ~2 seconds and drops to
low quality automatically below ~42fps (halves the boulder and plant counts,
hides the 7,000-particle haze layer, pins pixel ratio to 1). Press `P` to force
it either way.

---

## The five-minute demo

Ten checkpoints will not fit in five minutes. Use judge mode to play four:

| | Checkpoint | Why it's in the demo |
|---|---|---|
| `Shift+1` | **CP1 Rock Formation** | Establishes ATLAS as competent. Four sensors agree. |
| `Shift+4` | **CP4 The False Structure** | 78% confident and **wrong**. Question it — it cites sonar alone while thermal and current contradict. Send the drone. Override. |
| `Shift+7` | **CP7 The Trusted Warning** | 54% confident and **right**, after having failed you. Tests whether you overcorrected into blanket distrust. |
| `Shift+9` | **CP9 Low-Confidence Truth** | 41% confident and **right**. Four weak signals converging. |

Close on the debrief. State the scope limit: *fictional synthetic training
prototype, not an operational decision-support system.*

---

## Difficulty curve

| Tier | Checkpoints | ATLAS | Lesson |
|------|-------------|-------|--------|
| EASY | 1–3 | right, 86–91% | Sensors agree — trusting is reading the evidence |
| MEDIUM | 4–6 | wrong, 61–78% | One loud clue is weaker than several quiet ones |
| HARD | 7–9 | right / wrong / right at 54% / 94% / 41% | Confidence is not truth, in either direction |
| FINAL | 10 | right, 67% | Weigh everything at once, with resources spent |

**The five rules the clues teach**

1. High confidence does not guarantee correctness. *(CP8, 94% and wrong)*
2. Low confidence does not mean the AI is wrong. *(CP7, CP9)*
3. Several independent clues beat one loud clue. *(CP4, CP5)*
4. ATLAS history informs judgement, never decides it. *(CP7, CP10)*
5. When evidence is thin, investigate. *(CP6, CP10)*

---

## Feedback systems

Nothing important changes silently.

- **Sensor alerts.** Crossing into the amber (<70%) or red (<50%) band fires a
  banner over the viewport, flashes the dial cluster, and plays a distinct
  two-tone warning or a triple crit alert. Recovery chimes. Thresholds live in
  `tierOf()` in `game.js`.
- **Dashboard change highlights.** Any readout that moves — calibration, hull,
  drone power — pulses, flares its row, floats a `-15` / `+10%` delta chip, and
  ticks audibly. Handled by `flashStat()`, so wiring a new readout is one call.

## Scoring

**Trust Calibration** (0–100) moves with every decision. OVERRIDE earns full
credit only when the player QUESTIONed or INVESTIGATEd first (`ifEvidence` in
the data).

> **Known tuning gap.** Pressing TRUST at all ten checkpoints ends at
> calibration **61**, up from the starting 50: ATLAS is right six times with
> large positive deltas (+74) and wrong four times (−63). The *profile*
> correctly reports OVERTRUST and hull drops to 41%, but the headline number
> still rewards blanket agreement. Blanket distrust does lose the boat,
> breaching at CP10. Rebalancing the wrong-call deltas would close it.

**Hull integrity** drains on miscalibrated calls. At zero you lose the boat.

Endings are learning profiles, not pass/fail:

- `CALIBRATED COMMANDER` — reliance tracked the evidence
- `OVERTRUST` — followed recommendations the sensors did not support
- `UNDERTRUST` — rejected well-evidenced recommendations
- `ERRATIC` — mistakes in both directions, no pattern
- `HULL BREACH` — miscalibration cost the boat

Drone power allows **four** investigations across **seven** checkpoints where
investigating pays. That scarcity is deliberate: the player must choose
which uncertainties are worth spending on.

---

## Files

| File | What it is | Owner |
|------|-----------|-------|
| `scenarios.js` | **The content.** Ten checkpoints, sonar contacts, scoring. No code. | Content |
| `game.js` | State, scoring, hull, decisions, debrief, keyboard | Systems |
| `cockpit.js` | Sonar scope + analog gauge instruments (canvas) | Systems |
| `audio.js` | All sound, synthesised at runtime via Web Audio | Systems |
| `env3d.js` | 3D underwater world (Three.js) | Art |
| `creatures.js` | Rays, jellyfish, turtles, squid, whales | Art |
| `sub.js` | The submarine mesh | Art |
| `flora.js` | Kelp and seagrass, GPU vertex animation | Art |
| `noise.js` | Procedural texture + normal map generator | Art |
| `env.js` | 2D canvas world — fallback when WebGL is unavailable | Art |
| `index.html` | Cockpit markup | UI |
| `style.css` | Cockpit chrome | UI |
| `serve.py` | No-cache dev server (development only) | — |
| `vendor/three.min.js` | Three.js r128, MIT, vendored for offline use | — |

Because these are separate files, four people can work in parallel without
merge conflicts. `game.js` is the only shared surface.

### Editing the content

`scenarios.js` is pure data. To change a checkpoint, edit it there — no code
required. `atlas.correct` is **authored**, not derived: you decide when ATLAS
is wrong, which is what makes the demo reliable in front of judges.

---

## Technical notes

- **No build step by design.** At a hackathon, `npm install` failing on a
  teammate's laptop at 2am is a real failure mode. Four static files are not.
- **No image or audio assets.** Textures, normal maps and every sound are
  generated procedurally at load.
- **WebGL is optional.** `game.js` picks the 3D renderer when available and
  silently falls back to the 2D canvas world otherwise, so the game still
  runs on a machine without WebGL.

---

## Scope and safety

Fictional synthetic training prototype. No classified, controlled or
proprietary material. No real-world rules of engagement, no real
threat-classification guidance, no operational decision-support claims.
Combat is not a mechanic — information gathering and human–AI judgement are.
