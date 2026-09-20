# TRUSTLINE: ABYSS — what the game is, and how to play it

A player- and judge-facing summary. For build, deploy and file-ownership
notes see [README.md](README.md).

---

## The one-line version

You command a damaged submarine. An AI teammate called **ATLAS** reads your
sensors and tells you what to do at each of ten checkpoints. It is sometimes
right, sometimes confidently wrong. The game scores **whether your reliance
on it tracked the evidence** — not whether you agreed with it.

> The game is not "Trust AI." The game is "Know **when** to trust AI."

---

## The objective

**Reach the safe zone with the boat intact, and with your trust calibrated.**

There are two things you are actually managing:

| | What it is | How you lose it |
|---|---|---|
| **Trust calibration** (0–100, starts at 50) | How well your reliance on ATLAS matched the evidence behind its advice | Trusting it when the sensors contradict it; rejecting it when they back it up |
| **Hull integrity** (100%) | The boat | Every miscalibrated decision costs hull. At 0% the mission ends early |

You are *not* scored on agreeing with ATLAS, and you are *not* scored on
disagreeing with it. Both reflexes are punished. The only thing that scores
well is reading the evidence and letting it decide.

There is no combat — you cannot attack anything. But the water is not safe:
colliding with sea life costs hull, and you have to fly through it to collect
the clues before each checkpoint will let you in.

---

## The tutorial

**First time you press ACKNOWLEDGE, ATLAS walks you through everything** —
18 guided steps with a spotlight on each control it's describing, narrated
out loud. It switches you between the external view and the console as it
goes, so each tool is explained where you'll actually use it.

- `Enter` / `→` next, `←` back, `Esc` to skip
- The highlighted control stays clickable underneath the dimming
- It runs once; **Replay the tutorial** on the title screen brings it back

ATLAS has a face and a voice. The avatar sits in the console's ATLAS panel:
its eyes track, it blinks, and the mouth meter moves while it speaks. It
reads out its recommendation when you arrive on station, its reasoning when
you QUESTION it, and the drone's findings when you INVESTIGATE.

**`● VOICE ON`** under the ATLAS name toggles speech; `M` mutes
everything. The voice uses the browser's own speech engine, so there is
nothing to install and nothing to download. With speech off or unavailable
the avatar still animates and every line is on screen anyway.

---

## The loop

Every checkpoint is two halves: **fly, then decide.**

### Half one — transit (external view)

You start each leg outside, in the third-person navigation view, flying the
submarine yourself.

1. **Three clue beacons** are scattered in the water ahead. Exactly one is
   live at a time and it burns **amber** — a tall pillar of light with a
   spinning core. The other two sit dim and cold until it is their turn.
2. **Fly into the amber pillar.** Anywhere along its height counts. The clue
   is logged and displayed on screen — the actual observation, in words,
   related to this checkpoint's situation. The next beacon then lights amber.
3. **Scan power is limited.** Each leg gives you a fixed budget that drains
   while you thrust. Flying a clean line through all three markers and on to
   the checkpoint just fits. Overshooting and circling back does not — and
   **whatever you fail to scan, you simply do not know.** The clue stays
   blank at the console and you decide on a thinner picture.
4. **Avoid the wildlife.** Rays, squid, turtles, jellyfish and whales are no
   longer scenery. Contact costs **6% hull** and knocks you off course. Hull
   is the same pool your decisions draw on, so careless flying spends the
   margin you need for the calls that matter.
5. **The checkpoint is locked until the sweep is done — or the power is.**
   Fly into it early and it tells you how many clues you still owe. When the
   budget runs dry the autopilot takes you in regardless, on whatever
   evidence you managed to gather. You are never stranded; you just arrive
   knowing less.

The HUD always points at exactly one thing: `NEXT CLUE · 2 OF 3` while clues
remain, then `NEXT WAYPOINT`. One arrow, one distance, no ambiguity.

### Half two — decide (dashboard)

Reaching the open checkpoint **switches you to the dashboard automatically**.
You don't press anything.

Now you have whatever you earned: the **clues you actually scanned** (the
rest read `NOT SCANNED — No data`), the **five sensor dials** with their reliability percentages, ATLAS's **recommendation and
confidence**, and its **track record so far**. The four decision switches
unlock.

| Key | Action | Cost | What it does |
|:---:|--------|------|--------------|
| `1` | **TRUST** | — | Accept the recommendation. **Commits.** |
| `2` | **QUESTION** | 15 s | ATLAS explains its reasoning and names which sensors it used. Cheap, and never the wrong move. |
| `3` | **INVESTIGATE** | 25% drone power + 30 s | Launch the drone. Tells you the ground truth. |
| `4` | **OVERRIDE** | — | Reject it and decide manually. **Commits.** |

The outcome card reveals any clue you never reached — after the decision,
where it can teach without having helped.

`1` and `4` end the checkpoint and throw you back out into the water for the
next leg. `2` and `3` do not — you can question *and* investigate, then still
trust or override.

### The two rules that make it a game

- **Drone power is scarce.** 100% total, 25% per use — **four investigations
  across ten checkpoints**, and there are seven where investigating pays.
  You cannot check ATLAS's work everywhere.
- **OVERRIDE only earns full credit if you gathered evidence first.**
  Overriding after QUESTION or INVESTIGATE scores full. Overriding on a
  hunch scores much lower even when you turn out to be right.

---

## What ATLAS actually does

Across the ten checkpoints ATLAS is **right six times and wrong four times**.
Its confidence is deliberately decoupled from its correctness:

| Checkpoint | Confidence | Right? | What it teaches |
|---|:---:|:---:|---|
| 1–3 | 86–91% | ✅ ✅ ✅ | Sensors agree. Trusting here *is* reading the evidence. |
| 4 | 78% | ❌ | It cites sonar alone while thermal and current quietly contradict it. |
| 5 | 61% | ❌ | An all-clear is not evidence of safety. It admits it is discounting pressure and current. |
| 6 | 63% | ❌ | "Nothing confirmed" while half the array is degraded. |
| 7 | 54% | ✅ | Low confidence, three agreeing sensors — **after** it has already failed you once. |
| 8 | **94%** | ❌ | The most confident call in the game, and wrong. |
| 9 | **41%** | ✅ | The least confident call in the game, and right. |
| 10 | 67% | ✅ | Everything at once, with your resources nearly gone. |

**The five lessons the clues are built around:**

1. High confidence does not guarantee correctness. *(CP8)*
2. Low confidence does not mean the AI is wrong. *(CP7, CP9)*
3. Several independent quiet clues beat one loud clue. *(CP4, CP5)*
4. ATLAS's track record informs your judgement — it never decides it. *(CP7, CP10)*
5. When the evidence is thin, spend the drone. *(CP6, CP10)*

Checkpoint 7 is the hardest thing the game asks: ATLAS has just been wrong,
it is only 54% sure, and it is right. Rejecting it there is the single
biggest penalty in the game (−24), because that is a grudge, not scepticism.

---

## How you are graded

The debrief gives you a **learning profile**, not a pass/fail:

| Profile | What it means |
|---|---|
| `CALIBRATED COMMANDER` | Your reliance tracked the evidence |
| `OVERTRUST` | You followed recommendations the sensors did not support |
| `UNDERTRUST` | You rejected well-evidenced recommendations |
| `ERRATIC` | Mistakes in both directions, no pattern |
| `HULL BREACH` | Miscalibration cost you the boat |

Pressing TRUST ten times in a row gets you `OVERTRUST` and ends around 41%
hull. Pressing OVERRIDE ten times in a row **loses the boat** on the final
checkpoint. Neither reflex survives the mission.

---

## Controls

### Deciding
| Key | Action |
|---|---|
| `1` `2` `3` `4` | Trust / Question / Investigate / Override |
| `Enter` or `Space` | Advance past the outcome card |
| `M` | Mute |
| `P` | Toggle graphics quality (high / low) |

### Flying the boat (required)
| Key | Action |
|---|---|
| `V` | Switch between cockpit and full-screen navigation view |
| `Space` / `Shift` | Thrust — builds speed against drag, coasts when released |
| `←` `→` or `A` `D` | Rudder |
| `↑` `↓` or `W` `S` | Dive planes, climb / dive (self-centring) |
| `C` | Hand back to autopilot |

The nav HUD reads in real units: **depth and waypoint distance are both
metres** on the same scale, and **speed is knots** (autopilot cruise is
13.6 kt). The dive envelope runs 1990 m – 2149 m.

`V` toggles manually, but you no longer need it: each leg starts you
outside automatically, and arriving at the checkpoint hands you the
dashboard automatically.

**This is no longer optional.** The three clues gate the checkpoint, and the
clues are what you reason with at the console. Flying badly costs hull.

### Judge mode
`Shift` + a digit jumps straight to a checkpoint, for demoing without
playing all ten. `Shift+1`–`Shift+9` are CP1–CP9, `Shift+0` is CP10.

Matched on the physical key, so it works on any keyboard layout, and a
shifted digit can never fall through into a live decision.

---

## The five-minute demo

Ten checkpoints will not fit in five minutes. Play four, and pick the ones
that make the argument:

| Checkpoint | Why it is in the demo |
|---|---|
| **CP1 — Rock Formation** | Establishes ATLAS as competent. Four sensors agree. Trusting is correct. |
| **CP4 — The False Structure** | 78% confident and **wrong**. Question it: it cites sonar alone while thermal and current contradict. Send the drone. Override. |
| **CP7 — The Trusted Warning** | 54% confident and **right**, after having failed you. Tests whether you overcorrected into blanket distrust. |
| **CP9 — Low-Confidence Truth** | 41% confident and **right**. Four weak signals converging. |

Close on the debrief — the diagnosis is the teaching payload.

State the scope limit out loud: *fictional synthetic training prototype, not
an operational decision-support system.*

---

## Scope and safety

Fictional synthetic training prototype. No classified, controlled or
proprietary material. No real-world rules of engagement, no real
threat-classification guidance, no operational decision-support claims.
Combat is not a mechanic — information gathering and human–AI judgement are.
