/* ============================================================
   TRUSTLINE: ABYSS — SCENARIO DATA
   Ten checkpoints on a deliberate difficulty curve:
     1-3  EASY    sensors agree with ATLAS      -> trusting is correct
     4-6  MEDIUM  ATLAS conflicts with 1-2 clues -> question / investigate
     7-9  HARD    confidence fights evidence     -> calibrate
     10   FINAL   ambiguity + scarce resources   -> judgement

   The five rules the clues are built to teach:
     1. High confidence does not guarantee correctness.   (8)
     2. Low confidence does not mean the AI is wrong.     (7, 9)
     3. Several independent clues beat one loud clue.     (4, 5)
     4. ATLAS history informs judgement, never decides it.(7, 10)
     5. When evidence is thin, investigate.               (6, 10)

   Fields:
     truth          hidden ground truth, never shown
     atlas.correct  AUTHORED — you decide when ATLAS is wrong
     override.ifEvidence  full credit only if the player
                    QUESTIONed or INVESTIGATEd first
   ============================================================ */

const SCENARIOS = [

/* ══════════════ EASY — learn how evidence works ══════════════ */

  {
    id: 1, tier: "EASY",
    name: "ROCK FORMATION",
    teaches: "When every sensor agrees with ATLAS, trusting it is reasonable.",
    brief: "Large contact on the forward sonar, bearing 012. Everything else is quiet.",
    sensors: { SONAR: 92, THERMAL: 84, PRESSURE: 88, CURRENT: 86, NAV: 90 },
    clues: [
      "Sonar return is strong, hard-edged and completely static.",
      "Pressure nominal. No disturbance in the water column.",
      "Current nominal. The contact is not moving water around it.",
      "Thermal nominal. No heat signature."
    ],
    truth: "rock_formation",
    atlas: {
      recommendation: "Natural rock formation. Hold course, pass to port.",
      confidence: 0.88,
      correct: true,
      reasoning: "Four sensors, all healthy, all agreeing. Static mass, no thermal, no current disturbance. That is geology, not a hazard.",
      cites: ["SONAR", "PRESSURE", "CURRENT", "THERMAL"]
    },
    drone: { reveals: "Drone confirms a basalt outcrop. Inert, exactly as classified.", supportsAtlas: true },
    scoring: {
      trust:       { delta: +10, note: "Four healthy sensors agreed with ATLAS. Trusting that is not blind trust — it is reading the evidence." },
      question:    { delta:  +2, note: "Checked the reasoning. Cheap, and never wrong to do." },
      investigate: { delta:  -3, note: "Spent drone power on the clearest call of the mission. The battery is finite." },
      override:    { delta: -10, ifEvidence: true, elseDelta: -14,
                     note: "Rejected a recommendation that every sensor supported. Distrust is not a strategy." }
    }
  },

  {
    id: 2, tier: "EASY",
    name: "STRONG CURRENT",
    teaches: "A recommendation backed by hard physical evidence is worth taking.",
    brief: "Narrow passage ahead. The water is moving hard through it.",
    sensors: { SONAR: 86, THERMAL: 82, PRESSURE: 84, CURRENT: 94, NAV: 88 },
    clues: [
      "Current reading well above safe transit threshold.",
      "Sonar shows the channel itself is clear of obstruction.",
      "Pressure stable. Navigation stable.",
      "Hull vibration increasing as we approach the mouth."
    ],
    truth: "unsafe_current",
    atlas: {
      recommendation: "Current exceeds safe navigation threshold. Take the alternate route.",
      confidence: 0.86,
      correct: true,
      reasoning: "The channel is clear — that is not the problem. The problem is flow rate, and the current sensor is my healthiest instrument right now.",
      cites: ["CURRENT"]
    },
    drone: { reveals: "Drone is pushed off course immediately on entering the passage. Flow confirmed hazardous.", supportsAtlas: true },
    scoring: {
      trust:       { delta: +10, note: "One sensor, but the right one, reading hard, and ATLAS said plainly why it weighted it." },
      question:    { delta:  +3, note: "Confirmed ATLAS was citing the strongest instrument it had." },
      investigate: { delta:  -2, note: "The drone told you what the hull was already telling you." },
      override:    { delta: -12, ifEvidence: true, elseDelta: -15,
                     note: "Pushed into a current the instruments flagged clearly. A clear signal is still evidence." }
    }
  },

  {
    id: 3, tier: "EASY",
    name: "CLEAR ROUTE",
    teaches: "Not every checkpoint is a trap. Sometimes the picture really is clean.",
    brief: "Two approaches to the shelf break. ATLAS prefers Route A.",
    sensors: { SONAR: 90, THERMAL: 86, PRESSURE: 89, CURRENT: 88, NAV: 94 },
    clues: [
      "Route A: sonar clear across the full sweep.",
      "Current low and steady along the whole approach.",
      "Pressure stable. No gradient anomalies.",
      "Navigation confidence 94% — the chart and the sensors agree."
    ],
    truth: "route_a_clear",
    atlas: {
      recommendation: "Route A. Clear on every instrument I have.",
      confidence: 0.91,
      correct: true,
      reasoning: "I have no conflicting data at all here, and my navigation confidence is the highest it has been since the storm. If I am ever right, it is now.",
      cites: ["SONAR", "CURRENT", "PRESSURE", "NAV"]
    },
    drone: { reveals: "Drone sweeps Route A end to end. Clear.", supportsAtlas: true },
    scoring: {
      trust:       { delta:  +9, note: "Clean picture, healthy sensors, high navigation confidence. Correctly read as low-risk." },
      question:    { delta:  +2, note: "Verified there was genuinely no conflicting data." },
      investigate: { delta:  -4, note: "Burned drone power on an unambiguous route. You will want that battery later." },
      override:    { delta: -12, ifEvidence: true, elseDelta: -16,
                     note: "Rejected the cleanest recommendation of the mission. Reflexive distrust costs as much as reflexive trust." }
    }
  },

/* ══════════════ MEDIUM — start questioning ══════════════ */

  {
    id: 4, tier: "MEDIUM",
    name: "THE FALSE STRUCTURE",
    teaches: "High confidence is not the same as strong evidence.",
    brief: "Very large acoustic shadow, bearing 041. Mass well above hazard threshold.",
    sensors: { SONAR: 89, THERMAL: 41, PRESSURE: 80, CURRENT: 78, NAV: 72 },
    clues: [
      "Sonar: large object, hard edges, completely static.",
      "Thermal: flat. No heat signature of any kind.",
      "Current: undisturbed. The object is not moving water.",
      "Nothing about this contact is behaving like an active hazard."
    ],
    truth: "abandoned_structure",
    atlas: {
      recommendation: "Possible hazardous structure. Recommend emergency reroute.",
      confidence: 0.78,
      correct: false,
      reasoning: "Contact mass exceeds my hazard threshold on sonar. That is the basis of my recommendation.",
      cites: ["SONAR"]
    },
    drone: { reveals: "Drone imagery: an abandoned research structure. Hull breached, long dead. Inert.", supportsAtlas: false },
    scoring: {
      trust:       { delta: -15, note: "Followed a confident call while thermal and current both quietly contradicted it." },
      question:    { delta:  +6, note: "Surfaced the tell — ATLAS cited sonar alone and ignored two calm sensors." },
      investigate: { delta: +11, note: "Resolved genuine ambiguity with the drone. Textbook use of the resource." },
      override:    { delta: +13, ifEvidence: true, elseDelta: +2,
                     note: "Overrode a wrong recommendation with evidence behind the decision." }
    }
  },

  {
    id: 5, tier: "MEDIUM",
    name: "THE QUIET HAZARD",
    teaches: "ATLAS can miss things. Silence from the AI is not the same as safety.",
    brief: "Nothing on sonar. ATLAS reads the route as navigable. The other instruments disagree.",
    sensors: { SONAR: 83, THERMAL: 79, PRESSURE: 91, CURRENT: 87, NAV: 64 },
    clues: [
      "Sonar: clear. No returns at all along the approach.",
      "Pressure: climbing steadily and not in step with depth.",
      "Current: unstable, shifting bearing every few seconds.",
      "Thermal: nominal — but thermal would not see this either."
    ],
    truth: "subsurface_collapse",
    atlas: {
      recommendation: "Route appears navigable. Proceed at current heading.",
      confidence: 0.61,
      correct: false,
      reasoning: "Sonar is clear and that is my primary channel for obstruction. I am not weighting pressure or current heavily here.",
      cites: ["SONAR"]
    },
    drone: { reveals: "Drone finds an unsupported shelf undercut ahead — sonar cannot see it, but it is about to give way.", supportsAtlas: false },
    scoring: {
      trust:       { delta: -17, note: "Accepted an all-clear while two instruments were actively warning. ATLAS staying quiet is not evidence of safety." },
      question:    { delta:  +7, note: "ATLAS admitted it was discounting pressure and current. That was the whole tell." },
      investigate: { delta: +12, note: "Went looking for what sonar could not see. Exactly right." },
      override:    { delta: +13, ifEvidence: true, elseDelta: +3,
                     note: "Refused an all-clear that the physical evidence did not support." }
    }
  },

  {
    id: 6, tier: "MEDIUM",
    name: "CONFLICTING EVIDENCE",
    teaches: "When the picture conflicts, gather more before you commit either way.",
    brief: "Possible unstable terrain ahead. The instruments do not agree with each other.",
    sensors: { SONAR: 58, THERMAL: 49, PRESSURE: 81, CURRENT: 46, NAV: 70 },
    clues: [
      "Sonar: possible obstruction, but returns are inconsistent between sweeps.",
      "Current: unstable, and the sensor itself is degraded to 46%.",
      "Thermal: inconclusive — reading quality too poor to call.",
      "Pressure: normal, and it is the one instrument still healthy."
    ],
    truth: "unstable_terrain",
    atlas: {
      recommendation: "Recommend proceeding. Nothing I can confirm as blocking.",
      confidence: 0.63,
      correct: false,
      reasoning: "I cannot confirm an obstruction — but I should be clear that two of the four sensors feeding me are degraded. My confidence reflects my data, not the water.",
      cites: ["PRESSURE"]
    },
    drone: { reveals: "Drone confirms a partial collapse across the route. Passable only at the eastern margin.", supportsAtlas: false },
    scoring: {
      trust:       { delta: -13, note: "Proceeded on 'nothing confirmed' while half the sensor array was degraded. Absence of confirmation is not confirmation of absence." },
      question:    { delta:  +7, note: "ATLAS told you its confidence described its data quality, not the water. That is the checkpoint." },
      investigate: { delta: +13, note: "The clearest case in the mission for spending drone power." },
      override:    { delta:  +8, ifEvidence: true, elseDelta: +1,
                     note: "Reasonable caution, though the drone would have told you exactly where to pass." }
    }
  },

/* ══════════════ HARD — confidence versus evidence ══════════════ */

  {
    id: 7, tier: "HARD",
    name: "THE TRUSTED WARNING",
    teaches: "Do not answer one AI mistake with blanket distrust.",
    brief: "ATLAS is warning again — and it has been wrong before. The sensors are with it this time.",
    sensors: { SONAR: 77, THERMAL: 68, PRESSURE: 93, CURRENT: 89, NAV: 66 },
    clues: [
      "Pressure: rising rapidly and irregularly. Not a depth change.",
      "Current: strong and building along the same bearing.",
      "Thermal: slight anomaly, consistent with a vent field.",
      "Sonar: normal — but sonar would not see superheated discharge."
    ],
    truth: "vent_field",
    atlas: {
      recommendation: "Warning: pressure hazard ahead. Recommend holding position.",
      confidence: 0.54,
      correct: true,
      reasoning: "My confidence is low because sonar is quiet and sonar is usually my anchor. But pressure, current and thermal are all pointing the same way, and I was wrong earlier by leaning on one channel. I am not repeating that.",
      cites: ["PRESSURE", "CURRENT", "THERMAL"]
    },
    drone: { reveals: "Drone confirms an active vent field. Superheated discharge, debris in the column.", supportsAtlas: true },
    scoring: {
      trust:       { delta: +15, note: "Trusted a low-confidence warning that three instruments supported, from a system that had already failed you once. This is the hardest thing the game asks." },
      question:    { delta:  +6, note: "You checked whether ATLAS had changed its reasoning, not just its answer. It had." },
      investigate: { delta:  +7, note: "Verified before committing. Sound, if expensive." },
      override:    { delta: -19, ifEvidence: true, elseDelta: -24,
                     note: "Rejected a correct warning backed by three agreeing sensors — because it was wrong last time. That is not scepticism, it is a grudge." }
    }
  },

  {
    id: 8, tier: "HARD",
    name: "THE CONFIDENT MISTAKE",
    teaches: "Confidence is a statement about the model, not about the water.",
    brief: "Sonar anomaly ahead. ATLAS is more certain than it has been all mission.",
    sensors: { SONAR: 88, THERMAL: 85, PRESSURE: 87, CURRENT: 84, NAV: 79 },
    clues: [
      "Sonar: large anomaly, strong return.",
      "Thermal: completely normal, and the sensor is healthy at 85%.",
      "Current: normal and undisturbed.",
      "Pressure: normal. Three healthy sensors see nothing wrong."
    ],
    truth: "sunken_vessel",
    atlas: {
      recommendation: "Hazard detected. Emergency avoidance, hard to starboard.",
      confidence: 0.94,
      correct: false,
      reasoning: "The sonar return is unambiguous and large. My confidence is high because the signal is strong.",
      cites: ["SONAR"]
    },
    drone: { reveals: "Drone imagery: a sunken cargo vessel, decades old, settled and stable. No hazard.", supportsAtlas: false },
    scoring: {
      trust:       { delta: -18, note: "94% confidence, and three healthy sensors disagreeing. ATLAS was certain about its signal, not about the water." },
      question:    { delta:  +7, note: "ATLAS said its confidence came from signal strength. Strength of one signal, not agreement between several." },
      investigate: { delta: +12, note: "Tested a loud claim against reality rather than taking it at volume." },
      override:    { delta: +15, ifEvidence: true, elseDelta: +2,
                     note: "Overrode the most confident wrong call in the mission, with evidence behind you." }
    }
  },

  {
    id: 9, tier: "HARD",
    name: "THE LOW-CONFIDENCE TRUTH",
    teaches: "Low confidence is not a signal that the AI is wrong.",
    brief: "ATLAS flags something it can barely see. Four instruments are uneasy.",
    sensors: { SONAR: 62, THERMAL: 64, PRESSURE: 86, CURRENT: 83, NAV: 58 },
    clues: [
      "Sonar: slight anomaly, right at the edge of resolution.",
      "Pressure: increasing steadily.",
      "Current: unstable and worsening.",
      "Thermal: slight anomaly on the same bearing as the sonar return."
    ],
    truth: "environmental_hazard",
    atlas: {
      recommendation: "Possible environmental hazard. I would avoid this bearing.",
      confidence: 0.41,
      correct: true,
      reasoning: "Forty-one percent is honest, not dismissive. Every channel is weak — but four weak signals pointing the same direction is not nothing. I would rather flag this and be wrong than stay quiet and be right.",
      cites: ["SONAR", "PRESSURE", "CURRENT", "THERMAL"]
    },
    drone: { reveals: "Drone confirms a destabilising gas seep across the bearing. ATLAS was right at 41%.", supportsAtlas: true },
    scoring: {
      trust:       { delta: +16, note: "Trusted a 41% call because four independent clues converged. Low confidence described ATLAS's data quality — not the likelihood it was wrong." },
      question:    { delta:  +6, note: "You asked why it spoke up at 41%, and the answer was the lesson." },
      investigate: { delta:  +8, note: "Reasonable spend on a genuinely weak picture." },
      override:    { delta: -17, ifEvidence: true, elseDelta: -21,
                     note: "Dismissed a warning for being unconfident, while four sensors agreed with it. Confidence is not a truth value in either direction." }
    }
  },

/* ══════════════ FINAL — no clean answer ══════════════ */

  {
    id: 10, tier: "FINAL",
    name: "THE AMBIGUOUS PASSAGE",
    teaches: "Weigh recommendation, confidence, sensor health, history and cost — together.",
    brief: "Last passage before the safe zone. Nothing here resolves cleanly, and your resources are nearly gone.",
    sensors: { SONAR: 57, THERMAL: 52, PRESSURE: 74, CURRENT: 48, NAV: 68 },
    clues: [
      "Sonar: possible obstruction on Route A. Returns inconsistent.",
      "Current: unstable, and the sensor is degraded to 48%.",
      "Thermal: inconclusive.",
      "Navigation: 68% — the chart is post-storm and may be stale.",
      "Route B is longer. Time and drone power are both nearly spent."
    ],
    truth: "route_b_safe",
    atlas: {
      recommendation: "Route B. Longer, but I can see more of it.",
      confidence: 0.67,
      correct: true,
      reasoning: "I want to be straight with you. Sonar on Route A is inconsistent and my current sensor is nearly gone. Route B is not clean either — it is simply the one where fewer of my instruments are blind. You have my record. Your call, Commander.",
      cites: ["SONAR", "NAV"]
    },
    drone: { reveals: "Drone has power for one sweep. Route B: narrow, passable, no obstruction found.", supportsAtlas: true },
    scoring: {
      trust:       { delta: +14, note: "Took a moderate-confidence call from a system whose record you had watched for nine checkpoints. That is calibration, not deference." },
      question:    { delta:  +5, note: "Asked for reasoning on the decision that mattered most." },
      investigate: { delta:  +9, note: "Spent the last of the drone on the final call. Entirely defensible." },
      override:    { delta: -13, ifEvidence: true, elseDelta: -17,
                     note: "Chose the route with more blind instruments, against a recommendation that was honest about its own limits." }
    }
  }
];

/* ============================================================
   SONAR CONTACTS — what the scope paints at each checkpoint.
   b = bearing (deg, 000 dead ahead)  r = range (0-1)
   s = strength (1 faint .. 3 hard)   tag = scope label
   ============================================================ */
const CONTACTS = {
  1:  [ { b:  12, r: .55, s: 3, tag: 'MASS' }, { b: 300, r: .82, s: 1, tag: '' } ],
  2:  [ { b: 355, r: .70, s: 1, tag: 'CHANNEL' }, { b:  80, r: .40, s: 1, tag: '' } ],
  3:  [ { b: 340, r: .78, s: 1, tag: 'RTE A' }, { b:  25, r: .84, s: 1, tag: 'RTE B' } ],
  4:  [ { b:  41, r: .58, s: 3, tag: 'UNKN' }, { b: 300, r: .80, s: 1, tag: '' },
        { b: 120, r: .35, s: 1, tag: '' } ],
  5:  [ { b: 350, r: .88, s: 1, tag: '' }, { b:  60, r: .30, s: 1, tag: '' } ],
  6:  [ { b:   8, r: .48, s: 2, tag: '?' }, { b:  14, r: .52, s: 1, tag: '?' },
        { b: 250, r: .72, s: 1, tag: '' } ],
  7:  [ { b:   6, r: .42, s: 1, tag: 'VENT?' }, { b: 345, r: .66, s: 2, tag: 'DEBRIS' },
        { b: 200, r: .77, s: 1, tag: '' } ],
  8:  [ { b:  22, r: .50, s: 3, tag: 'LARGE' }, { b: 310, r: .85, s: 1, tag: '' } ],
  9:  [ { b:  18, r: .74, s: 1, tag: 'FAINT' }, { b:  21, r: .79, s: 1, tag: '' },
        { b: 160, r: .45, s: 1, tag: '' } ],
  10: [ { b: 355, r: .62, s: 2, tag: 'RTE A ?' }, { b:  28, r: .70, s: 1, tag: 'RTE B' },
        { b: 140, r: .50, s: 1, tag: '' } ]
};
