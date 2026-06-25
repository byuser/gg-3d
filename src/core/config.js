// Core: deterministic RNG + tunable game CONFIG + the shared PALETTE.
// Extracted verbatim from the legacy single file during the Task 9 split.

  // =========================================================================
  // Deterministic RNG (mulberry32)
  // -------------------------------------------------------------------------
  // The whole game draws its randomness from this single seeded stream instead
  // of rng(). Seeding it makes the *procedural world* (river, roads,
  // trees, rocks, …) fully reproducible: a saved game records its seed, and on
  // load we re-seed and rebuild the exact same environment before restoring the
  // live entities (monsters, coins, artifacts) on top. See serializeGame /
  // applySave below.
  // =========================================================================
  let worldSeed = (Date.now() ^ (Date.now() << 11) ^ 0x9e3779b9) >>> 0;
  let _rngState = worldSeed >>> 0;
  function rng() {
    _rngState |= 0; _rngState = (_rngState + 0x6D2B79F5) | 0;
    let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function setSeed(s) { worldSeed = s >>> 0; _rngState = worldSeed; }

  const CONFIG = {
    moveSpeed: 6.5,          // metres / second
    turnLerp: 0.2,
    interactRange: 2.6,
    playerRadius: 0.55,      // collision radius vs scenery (trees, rocks, …)
    worldRadius: 88,         // playable area before the invisible fence

    // Combat / wand
    castCooldown: 0.32,      // seconds between magic bolts
    boltSpeed: 22,           // metres / second
    boltLife: 1.4,           // seconds before a bolt fizzles
    boltRadius: 0.8,         // hit radius against monsters

    // Player health
    maxHealth: 100,
    contactDamage: 12,       // damage per sweet "bite"
    biteCooldown: 0.8,       // seconds between bites from the same sweet

    // RPG spawning — resident monsters respawn this many seconds after the
    // zone's population drops below its cap (replaces the old wave timer).
    respawnDelay: 7,

    // Difficulty scaling — monster HP/speed grow with the ZONE level. (These
    // keep their historical *PerWave names; "wave" now means the zone's level.)
    monsterBaseSpeed: 1.6,
    monsterSpeedPerWave: 0.12,
    monsterMaxSpeed: 6.0,
    monsterHpPerWaves: 3,    // +1 HP every N zone levels

    // Bosses. bossEveryWaves maps a zone's level to a boss "cycle" (deeper lairs
    // hold tougher kings); bossBaseHp/bossHpPerCycle scale them up from there.
    bossEveryWaves: 5,        // multiplier from zone level -> boss cycle
    bossBaseHp: 38,           // boss HP on its first appearance (wave 5)
    bossHpPerCycle: 26,       // +HP for each later boss (wave 10, 15, …)
    bossSpeed: 2.0,           // bosses are slower but relentless
    bossContactDamage: 22,    // they hit much harder than a regular sweet
    bossRadius: 2.4,          // big body → big hit/contact radius
    bossCoinDrop: 30,         // guaranteed coins when a boss is defeated

    // Artifacts restore a little health and pay a small coin reward. (The XP
    // they grant lives with the other XP awards in src/data/skills.js.)
    artifactHeal: 12,
    artifactCoinMin: 2,
    artifactCoinMax: 5,

    // Coins (the shop currency, dropped by defeated sweets)
    coinDropChance: 0.55,     // chance a defeated sweet drops coins
    coinValueMin: 1,
    coinValueMax: 3,
    coinPickupRange: 1.9,     // walk this close to scoop a coin up
    coinMagnetRange: 4.5,     // coins drift toward the player inside this range
    coinLife: 30,             // seconds before an uncollected coin fades away

    // World / exploration (the bigger story map).
    gatherRange: 3.0,         // reach to harvest a resource node
    questReachRange: 6.0,     // how close counts as "reaching" a location/NPC
    // Hard ceiling on the number of LIVE harvestable resource nodes in a zone at
    // once. Spawning + respawn both honour it, so the world can never accumulate
    // an unbounded supply across zone re-entry or save/load (Task 10).
    maxResourceNodes: 90,

    // Day / night cycle — one full day every `dayLength` seconds.
    dayLength: 180,           // seconds for a full dawn→dusk→night→dawn cycle
    startTimeOfDay: 0.30,     // begin mid-morning (0=midnight, 0.5=noon)

    // Weather — chance to change each "weather tick" and how long a spell lasts.
    weatherMinTime: 35,       // min seconds a weather state holds
    weatherMaxTime: 75,       // max seconds before it may change

    // The dragon — the final boss summoned once the castle is complete.
    dragonBaseHp: 900,
    dragonContactDamage: 30,
  };

  const PALETTE = ["#6cc6ff", "#a06cff", "#ff6c8a", "#ffd34e", "#5be0a0", "#ff944e"];

  // Read-only accessor for the current world seed (save/load + test seam).
  function getSeed() { return worldSeed; }

export { CONFIG, PALETTE, rng, setSeed, getSeed };
