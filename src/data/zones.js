// Data: the explorable ZONES (themed, streamable per-zone worlds + portals).


  // =========================================================================
  // ZONES — the world is no longer one map driven by a wave timer. It is split
  // into several explorable LOCATIONS, each with its own look, its own resident
  // monster types that wander and RESPAWN over time, and (for the wild zones) a
  // BOSS lurking in its depths. Zones are connected by PORTALS — a forest path,
  // a wooden bridge, a cave mouth — and stream in/out as you travel so the game
  // never holds more than one zone in memory and never freezes.
  //
  // The MEADOW is the home hub: it keeps the village, plaza, river, the merchant
  // & blacksmith, the castle build site, the resource nodes and the story NPCs.
  // The wild zones (forest, shore, peaks, caverns, thicket) are the new hunting
  // grounds, two of which are boss lairs.
  //
  //   zone: { id, name, icon, home?, level, radius,
  //           theme:{ sky, fog, fogDensity, ground, hemi, sun, sunDir,
  //                   expMul?, conMul?, shadowDark? },  // optional light mood
  //           scenery:{ trees, rocks, bushes, toadstools, flowers, crystals,
  //                     palms, snow, pillars },
  //           spawn:{ count, kinds:[…sweet kinds], abilities:[…], heal? },
  //           boss?:{ archId, name, intro },
  //           portals:[ { to, kind:'path'|'bridge'|'cave', angle } ] }
  // The portal's world position is derived from `angle` + the zone radius; the
  // matching return portal in the target zone is found by `to === thisZone`.
  // =========================================================================
  const ZONES = [
    {
      id: "meadow", name: "Meadowgate Vale", icon: "🏘️", home: true, level: 1, radius: 88,
      theme: { sky: "#86c5ff", fog: "#a9d4ff", fogDensity: 0.006, ground: "#5fae4f",
               hemi: "#4a6a3a", sun: "#fff4e0", sunDir: [-0.5, -1, -0.4] },
      scenery: { trees: 60, rocks: 40, bushes: 34, toadstools: 22, flowers: 140 },
      spawn: { count: 7, kinds: ["lollipop", "gummy", "cupcake", "macaron"], abilities: ["chaser", "runner"] },
      portals: [
        { to: "forest", kind: "path",   angle: -2.45 }, // toward Whisperwood (grove, NW)
        { to: "shore",  kind: "bridge", angle: 0.71 },  // toward Saltmarsh (seaside, SE)
        { to: "peaks",  kind: "path",   angle: 2.43 },  // toward Frostpeak (mountain, SW)
      ],
    },
    {
      id: "forest", name: "Whisperwood Deep", icon: "🌲", level: 3, radius: 64,
      theme: { sky: "#3f6b4a", fog: "#2f5238", fogDensity: 0.018, ground: "#356b39",
               hemi: "#24401f", sun: "#cfe6b0", sunDir: [-0.35, -1, -0.5], expMul: 0.97, conMul: 1.04, wind: 0.7 },
      scenery: { trees: 120, rocks: 18, bushes: 50, toadstools: 40, flowers: 60 },
      spawn: { count: 9, kinds: ["gummy", "jellybean", "marshmallow", "macaron"], abilities: ["chaser", "runner", "jumper", "brute"] },
      portals: [
        { to: "meadow",  kind: "path", angle: 0.69 },   // back to the vale
        { to: "thicket", kind: "cave", angle: -1.9 },   // deeper, to the boss thicket
      ],
    },
    {
      id: "shore", name: "Saltmarsh Strand", icon: "🌊", level: 2, radius: 70,
      theme: { sky: "#bfe6ff", fog: "#bfe0ef", fogDensity: 0.009, ground: "#cdbb84",
               hemi: "#7a8a5a", sun: "#fff0d0", sunDir: [-0.6, -1, -0.2], expMul: 1.05, wind: 1.2 },
      scenery: { trees: 8, rocks: 26, bushes: 14, flowers: 30, palms: 22 },
      spawn: { count: 8, kinds: ["icecream", "donut", "lollipop", "candycane"], abilities: ["chaser", "runner", "shooter"] },
      portals: [
        { to: "meadow", kind: "bridge", angle: -2.43 }, // back to the vale
        { to: "caverns", kind: "cave",  angle: 0.3 },   // sea-cave to the crystal caverns
      ],
    },
    {
      id: "peaks", name: "Frostpeak Trail", icon: "⛰️", level: 4, radius: 66,
      theme: { sky: "#cfe0f5", fog: "#dfe9f7", fogDensity: 0.014, ground: "#dde7f2",
               hemi: "#8a99ad", sun: "#eef4ff", sunDir: [-0.4, -1, -0.45], expMul: 1.06, conMul: 1.05, wind: 1.5 },
      scenery: { trees: 22, rocks: 60, bushes: 8, crystals: 16, snow: true },
      spawn: { count: 9, kinds: ["candycane", "marshmallow", "chocbar", "pretzel"], abilities: ["chaser", "brute", "jumper", "shooter"] },
      portals: [
        { to: "meadow", kind: "path", angle: -0.7 },    // back to the vale
      ],
    },
    {
      id: "caverns", name: "Crystal Caverns", icon: "💎", level: 5, radius: 56, indoor: true,
      theme: { sky: "#160d28", fog: "#1a1030", fogDensity: 0.03, ground: "#2a2140",
               hemi: "#2a1f4a", sun: "#9a7aff", sunDir: [-0.2, -1, -0.3], expMul: 0.9, conMul: 1.14, shadowDark: 0.5 },
      scenery: { rocks: 70, crystals: 40, pillars: 18 },
      spawn: { count: 7, kinds: ["chocbar", "jellybean", "candycorn", "pretzel"], abilities: ["brute", "shooter", "bomber"] },
      boss: { archId: "stomper", name: "Cavern Gumlord",
              intro: "A colossal candy golem rules the Crystal Caverns. Bring it down!" },
      portals: [
        { to: "shore", kind: "cave", angle: 2.9 },      // back out to the strand
      ],
    },
    {
      id: "thicket", name: "Bramblewood Thicket", icon: "🐉", level: 6, radius: 54, indoor: true,
      theme: { sky: "#2a1c10", fog: "#21180e", fogDensity: 0.032, ground: "#2c3a1c",
               hemi: "#1c2a12", sun: "#c8b070", sunDir: [-0.3, -1, -0.55], expMul: 0.93, conMul: 1.1, shadowDark: 0.48 },
      scenery: { trees: 90, rocks: 20, bushes: 60, toadstools: 30 },
      spawn: { count: 8, kinds: ["gummy", "macaron", "jellybean", "marshmallow"], abilities: ["brute", "jumper", "shooter", "bomber"] },
      boss: { archId: "splitter", name: "Bramble Hydra",
              intro: "The Bramble Hydra coils in the deep thicket, splitting as it falls. End it!" },
      portals: [
        { to: "forest", kind: "cave", angle: 1.2 },     // back to the Whisperwood
      ],
    },
  ];
  const ZONE_BY_ID = {};
  for (const z of ZONES) ZONE_BY_ID[z.id] = z;
  const HUB_ZONE = "meadow";

export { ZONES, ZONE_BY_ID, HUB_ZONE };
