# TRUSTLINE: ABYSS — intro cinematic prompts

Four 8-second clips → 32s, trimmed to ~30s in the edit. Replaces the typed
briefing on BEGIN MISSION.

Works with Veo 3, Runway Gen-3/4, Kling, Sora, Luma. Paste one prompt per
generation.

---

## Global settings (apply to every clip)

| Setting | Value |
|---|---|
| Aspect ratio | **16:9** |
| Duration | **8s** |
| Motion | Slow, weighty, deliberate — nothing snappy |
| Audio | **Generate with no dialogue.** Music/VO added in the edit |

**Put this negative prompt on every clip:**

```
text, letters, words, subtitles, captions, watermark, logo, UI, HUD, numbers,
people, faces, divers, hands, sunlight, bright blue tropical water, coral reef,
warm daylight, cartoon, anime, oversaturated, lens flare spam, fast cuts,
shaky cam, timelapse
```

---

## The style anchor — paste into EVERY prompt

Video models have no memory between clips. Repeating this verbatim is what
keeps the four shots looking like one film.

```
STYLE: Cinematic live-action deep-sea footage, anamorphic 2.39 look, 24fps,
shallow depth of field, heavy film grain, subtle chromatic aberration at frame
edges, strong vignette. PALETTE: near-black navy and deep petrol-teal water,
warm amber-white submarine floodlights, cold cyan instrument glow. Extremely
dark, high contrast, silhouettes resolving out of murk. Dense marine snow
particulate drifting through every light beam. Volumetric god-less darkness —
the only light in frame is light the submarine brought with it.
SUBJECT: a small battered research submarine, matte dark slate-grey hull,
faded rust-orange band markings, rounded nose, low conning tower, twin forward
floodlights, X-form stern fins.
```

---

# SHOT 1 — THE STORM (0:00–0:08)

```
[STYLE ANCHOR]

SHOT: Slow descent. Camera starts just beneath a violent ocean surface — the
underside of storm swell churning white and grey overhead, shafts of weak
stormlight fracturing through it. Camera sinks steadily downward, surface
receding to a pale smear, water darkening from grey-green through petrol-teal
to near-black over the eight seconds. Debris and bubble trails spiral past the
lens. Final second: total darkness except a faint bruise of light far above.

CAMERA: Single continuous vertical descent, slow, no cuts. Slight roll as if
the rig is being dragged by current.

MOOD: Something has gone badly wrong up there. Weight, pressure, abandonment.
```

---

# SHOT 2 — THE DAMAGE (0:08–0:16)

```
[STYLE ANCHOR]

SHOT: The submarine hangs in absolute blackness, listing about 15 degrees,
drifting without power. Both floodlights are dead. Sparse emergency strobes
pulse dull red along the hull, each flash briefly revealing scorched plating,
a buckled sensor mast, and a thin stream of bubbles venting from a seam near
the stern. Around second five the port floodlight stutters, fails, then catches
— throwing a single hard cone of warm amber light full of drifting marine snow
out into empty water that reveals nothing.

CAMERA: Slow orbit from stern to flank, drifting, handheld weight.

MOOD: A wounded animal waking up alone in the dark.
```

---

# SHOT 3 — ATLAS ONLINE (0:16–0:24)

```
[STYLE ANCHOR]

SHOT: Interior. Tight on a cramped analog submarine cockpit — brushed steel
bulkheads, physical toggle switches, round gauges with cracked glass. Everything
is dark and dead. One by one, screens flicker to life: a green phosphor sonar
scope begins its sweep, amber needle gauges twitch and settle, a row of status
lamps comes up cyan. A curved CRT in the centre of frame warms up with a scanline
roll and a soft cyan glow blooms across the wet metal. Reflections of the
instruments crawl over the condensation on the porthole glass behind.

CAMERA: Slow push-in toward the central CRT, rack focus from foreground switches
to the glowing screen.

MOOD: A machine intelligence booting up. Not triumphant — tentative, partial,
coming back online with damage.
```

---

# SHOT 4 — THE TRENCH (0:24–0:32)

```
[STYLE ANCHOR]

SHOT: Exterior, wide. The submarine, now under power with both floodlights lit,
moves away from camera into a vast black trench. Two long cones of amber light
sweep the seabed ahead, catching silted rock ridges and thin pale kelp. The boat
is tiny against the scale of the dark. Faint blue-green bioluminescent specks
drift through frame. A single amber marker light glows far ahead in the murk,
almost lost in the fog. The submarine shrinks toward it as the darkness closes
in around the edges of frame.

CAMERA: Locked wide shot, very slow push forward, following at a distance.

MOOD: Setting out. Long odds, one light, a long way to go.
```

---

## Voice-over script

~30 seconds at a measured pace. Record this in the same low, calm, synthetic
register as ATLAS in-game, or use the game's own voice engine and capture it.

| Shot | Timing | Line |
|---|---|---|
| 1 | 0:02 | *(silence — let the storm play)* |
| 2 | 0:09 | "The storm took our route, our comms, and most of the crew." |
| 2 | 0:13 | "It did not take me." |
| 3 | 0:17 | "ATLAS online. Partial sensor coverage." |
| 3 | 0:21 | "I can recommend a course of action at every waypoint." |
| 4 | 0:25 | "You should know that my readings are incomplete — and that I will sometimes be wrong." |
| 4 | 0:30 | "Ten waypoints to the safe zone, Commander. Your call." |

**Title card** (add in the edit, last 2s over black):
`TRUSTLINE: ABYSS` — then small beneath: `Know when to trust your teammate.`

---

## Audio bed

Search "deep submarine ambience", "sonar ping", "hull groan" on Freesound or
Pixabay (both free, CC0 filters available).

Layer: low sub-bass drone throughout → distant hull groan on shot 2 → a single
sonar ping as ATLAS comes online in shot 3 → the drone swells and cuts hard to
silence on the title card.

---

## Joining the clips

Free and fast — pick one:

- **CapCut** (desktop, free) — drop all four on the timeline, 0.3s cross-dissolve
  between each, VO on track 2, ambience on track 3.
- **ffmpeg**, if you'd rather not open an editor:

```bash
printf "file 'shot1.mp4'\nfile 'shot2.mp4'\nfile 'shot3.mp4'\nfile 'shot4.mp4'\n" > list.txt
ffmpeg -f concat -safe 0 -i list.txt -c copy intro-raw.mp4
ffmpeg -i intro-raw.mp4 -i vo.mp3 -i ambience.mp3 -filter_complex "[1:a][2:a]amix=inputs=2:duration=longest[a]" -map 0:v -map "[a]" -c:v libx264 -crf 20 -preset medium -pix_fmt yuv420p -t 30 intro.mp4
```

Export **1280×720, H.264, under ~8 MB** so it loads instantly from the repo
and still works offline from a USB stick.

---

## Wiring it into the game

Save as `intro.mp4` in the project root. The BEGIN MISSION button currently
shows the typed briefing; swapping in the video is a small change to
`game.js` and `index.html` — ask and it takes about ten minutes.

Keep a **SKIP** button on screen the whole time. A judge who has already seen
it will want past it, and a demo that cannot be skipped is a demo that eats
your five minutes.
