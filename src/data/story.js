// Data: the declarative campaign — STORY chapters, ordered MISSIONS, optional
// SIDE_QUESTS, and the derived quest indices the engine/UI/tests reason about.

  const STORY = {
    title: "The Castle of Meadowgate",
    intro: {
      title: "📜 The Tale of Meadowgate",
      text: "Long ago a great castle warded this vale — until it crumbled and the lands filled with living sweets. " +
            "You are Lily, the hero Meadowgate prayed for. Gather the five lost relics, raise the castle anew, and " +
            "face the Ancient Dragon that sleeps beneath the keep. " +
            "Follow the glowing ❗ folk and your quest tracker — each task leads to the next. The vale is in your hands.",
    },
    ending: {
      title: "🏰 Dawn Over the Vale",
      text: "The Ancient Dragon is slain and the castle stands crowned against the dawn. The sweets scatter to the wilds, " +
            "the folk of Meadowgate throw open their doors, and your name is sung from grove to shore. The vale is saved — well done, hero.",
    },
    chapters: [
      { id: "ch1", title: "The Vale Besieged", blurb: "Answer Meadowgate's call and lay the castle's first stone." },
      { id: "ch2", title: "Stone & Steel",     blurb: "Steel the militia and raise the curtain walls." },
      { id: "ch3", title: "The Crystal Tide",  blurb: "Brave the sea-caves for the Tower Crystal." },
      { id: "ch4", title: "The Golden Gate",   blurb: "Forge the Gate Key in Frostpeak's fire." },
      { id: "ch5", title: "The Dragon's Seal", blurb: "Claim the Dragon Sigil, crown the keep, and end the beast." },
    ],
  };

  // The ordered main missions (flattened; array order === campaign order).
  const MISSIONS = [
    // ── Chapter 1 — The Vale Besieged ───────────────────────────────────────
    { id: "m_cull", chapter: "ch1", npc: "mayor", title: "A Taste of Battle",
      story: "Cull the sweets prowling our fields and show the vale there's hope.",
      obj: { type: "hunt", count: 5 }, where: "Meadowgate Vale",
      reward: { coins: 30, mats: { wood: 3, water: 2 } } },
    { id: "m_cornerstone", chapter: "ch1", npc: "mayor", title: "The Cornerstone",
      story: "The Foundation Stone lies in the Sunken Ruins to the east. Seek it out.",
      obj: { type: "reach", target: "ruins" },
      reward: { coins: 40, relic: "relic_foundation" } },
    { id: "m_foundation", chapter: "ch1", npc: "mayor", title: "Lay the Cornerstone",
      story: "Carry the Foundation Stone to Castle Hill and lay our cornerstone.",
      obj: { type: "build", target: "foundation" },
      reward: { coins: 30, mats: { stone: 2 } } },
    // ── Chapter 2 — Stone & Steel ───────────────────────────────────────────
    { id: "m_poultice", chapter: "ch2", npc: "herbalist", title: "Green Hands",
      story: "Gather herbs from the grove so I can brew poultices for the militia.",
      obj: { type: "gather", target: "herb", count: 6 }, where: "Whisperwood Grove",
      reward: { coins: 25, item: "health_potion", mats: { crystal: 1 } } },
    { id: "m_stone", chapter: "ch2", npc: "smith2", title: "Stones for the Walls",
      story: "Walls need good stone. Mine some from the hills and high rocks.",
      obj: { type: "gather", target: "stone", count: 8 }, where: "Frostpeak & the hills",
      reward: { coins: 50, relic: "relic_walls" } },
    { id: "m_walls", chapter: "ch2", npc: "mayor", title: "Raise the Ramparts",
      story: "With the Rampart Runes in hand, raise our curtain walls.",
      obj: { type: "build", target: "walls" },
      reward: { coins: 40, item: "iron_helm" } },
    // ── Chapter 3 — The Crystal Tide ────────────────────────────────────────
    { id: "m_water", chapter: "ch3", npc: "fisher", title: "Fresh Water",
      story: "Fetch clean water from the river for my nets, and I'll tell you of the deep caves.",
      obj: { type: "gather", target: "water", count: 6 }, where: "the river & Saltmarsh",
      reward: { coins: 30, mats: { fiber: 4 } } },
    { id: "m_caverns", chapter: "ch3", npc: "fisher", title: "The Deep Below",
      story: "A candy golem hoards the Tower Crystal in the Crystal Caverns, through the sea-cave past my shore. End it!",
      obj: { type: "defeat_boss", target: "caverns" }, where: "Crystal Caverns (via Saltmarsh)",
      reward: { coins: 70, relic: "relic_towers" } },
    { id: "m_towers", chapter: "ch3", npc: "mayor", title: "Conjure the Spires",
      story: "Sing the Tower Crystal into the castle's corner spires.",
      obj: { type: "build", target: "towers" },
      reward: { coins: 50 } },
    // ── Chapter 4 — The Golden Gate ─────────────────────────────────────────
    { id: "m_ore", chapter: "ch4", npc: "smith2", title: "Ore for the Forge",
      story: "Bring me crystal from the high rocks to fire the forge.",
      obj: { type: "gather", target: "crystal", count: 3 }, where: "Frostpeak Trail",
      reward: { coins: 50, item: "iron_sword" } },
    { id: "m_gatekey", chapter: "ch4", npc: "smith2", title: "The Golden Gate",
      story: "Slay the sweets haunting the frostpeak pass and claim the forged Gate Key.",
      obj: { type: "hunt", count: 14 }, where: "Frostpeak Trail",
      reward: { coins: 80, relic: "relic_gate" } },
    { id: "m_gate", chapter: "ch4", npc: "mayor", title: "Hang the Golden Gate",
      story: "Hang the golden gate and seal our walls.",
      obj: { type: "build", target: "gate" },
      reward: { coins: 60 } },
    // ── Chapter 5 — The Dragon's Seal ───────────────────────────────────────
    { id: "m_word", chapter: "ch5", npc: "hermit", title: "Word from the Vale",
      story: "Speak with Mayor Plum that he vouches for you, then return to me.",
      obj: { type: "talk", target: "mayor" },
      reward: { coins: 30, mats: { crystal: 2 } } },
    { id: "m_thicket", chapter: "ch5", npc: "hermit", title: "The Bramble Heart",
      story: "The Bramble Hydra coils in the deep thicket beyond the Whisperwood. Cut out its heart and the Dragon Sigil is yours.",
      obj: { type: "defeat_boss", target: "thicket" }, where: "Bramblewood Thicket (via Whisperwood)",
      reward: { coins: 120, relic: "relic_keep" } },
    { id: "m_keep", chapter: "ch5", npc: "mayor", title: "Crown the Keep",
      story: "Set the Dragon Sigil and crown the keep — though it will surely wake the beast below.",
      obj: { type: "build", target: "keep" },
      reward: { coins: 80 } },
    { id: "m_dragon", chapter: "ch5", npc: null, title: "Slay the Ancient Dragon",
      story: "The Ancient Dragon is awake. Face it before the new-raised castle and end the long siege.",
      obj: { type: "defeat_dragon" }, where: "Castle Hill",
      reward: {} },
  ];

  // Optional side quests — bounties + errands from the same NPCs, kept clearly
  // apart from the main line. `repeatable` bounties can be taken again after
  // each turn-in for steady coin; the rest are one-shot.
  const SIDE_QUESTS = [
    { id: "sq_pests", npc: "mayor", title: "Pest Control", repeatable: true,
      story: "Sweets keep wandering into the plaza. Thin them out — there's coin in it, as often as you like.",
      obj: { type: "hunt", count: 8 }, reward: { coins: 45 } },
    { id: "sq_supplies", npc: "herbalist", title: "Healer's Stock",
      story: "Stock my shelves with herbs and I'll spare you a tonic.",
      obj: { type: "gather", target: "herb", count: 8 }, reward: { coins: 30, item: "health_potion" } },
    { id: "sq_nets", npc: "fisher", title: "Mend the Nets",
      story: "My nets are in tatters. Bring fiber and I'll cut you in.",
      obj: { type: "gather", target: "fiber", count: 6 }, reward: { coins: 28, item: "elixir_swift" } },
    { id: "sq_forgefuel", npc: "smith2", title: "Forgefuel",
      story: "The forge hungers for crystal. Feed it and take this blade.",
      obj: { type: "gather", target: "crystal", count: 4 }, reward: { coins: 55, item: "iron_sword" } },
    { id: "sq_relics", npc: "hermit", title: "Trials of the Lost",
      story: "Prove your steel against the wild swarm and earn an old charm of mine.",
      obj: { type: "hunt", count: 15 }, reward: { coins: 90, item: "ring_swift" } },
    { id: "sq_wilds", npc: "smith2", title: "Cull the Wilds", repeatable: true,
      story: "There's a standing bounty on the wild sweets — bring me a tally any time.",
      obj: { type: "hunt", count: 12 }, reward: { coins: 60 } },
  ];

  // Normalise + index every quest (main + side) so the engine, UI and tests can
  // treat them uniformly by id.
  for (const m of MISSIONS) m.line = "main";
  for (const s of SIDE_QUESTS) s.line = "side";
  const QUEST_BY_ID = {};
  for (const q of MISSIONS) QUEST_BY_ID[q.id] = q;
  for (const q of SIDE_QUESTS) QUEST_BY_ID[q.id] = q;
  const MAIN_IDS = MISSIONS.map((m) => m.id);                 // campaign order
  const MAIN_INDEX = {}; MAIN_IDS.forEach((id, i) => { MAIN_INDEX[id] = i; });
  const SIDE_IDS = SIDE_QUESTS.map((s) => s.id);
  const CHAPTER_BY_ID = {}; for (const c of STORY.chapters) CHAPTER_BY_ID[c.id] = c;
  const missionsOfChapter = (chId) => MISSIONS.filter((m) => m.chapter === chId);

export {
  STORY, MISSIONS, SIDE_QUESTS, QUEST_BY_ID, MAIN_IDS, MAIN_INDEX, SIDE_IDS,
  CHAPTER_BY_ID, missionsOfChapter,
};
