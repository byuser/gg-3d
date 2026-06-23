# Good Game 3D

A third-person browser **action-RPG adventure**. Run as **Lily** across an island split into
several **explorable lands** — the Meadowgate **vale**, the **Whisperwood**, the **Saltmarsh
shore**, the **Frostpeak trail** and two hidden **boss lairs** (the Crystal **Caverns** and the
Bramblewood **Thicket**). Each land has its **own monsters** that **roam** their patch and
**respawn** over time; **travel** between lands by walking through a **path**, a **bridge** or a
**cave mouth**, and the world **streams in and out** so it never freezes. Take **quests**,
**gather and craft**, raise a **castle** from five hidden **relics** — build it and the
**Ancient Dragon** awakens, so **slay it to win**.

Along the way: equip **weapons, armour and accessories**, brew **potions**, hunt **roaming
monsters** and **lair bosses**, weather **rain and storms** under a rolling **day/night cycle**,
and loot **gear** from a merchant, bosses and quests.

Playable in **English and Russian** — switch language from the start screen or the pause
settings; the choice applies instantly and is remembered across reloads.

## The story

Meadowgate is besieged by living sweets. An old castle once warded the vale — help the
villagers raise it again. A **structured main story** runs in **five chapters** of ordered
**missions** that guide you, step by step, across the lands: cull the sweets, recover the five
castle **relics** (Foundation Stone, Rampart Runes, Tower Crystal, Golden Gate Key and the
Dragon Sigil), clear the two **lair bosses**, **build** each part of the castle in turn — and
finally face the **Ancient Dragon** that wakes beneath the keep. Follow the on-screen **objective
tracker** and you'll never be lost: each step says exactly which NPC to see, what to do, and where
to turn it in. Optional **side quests** (bounties and errands, some repeatable) give extra coins
and gear without ever blocking the main line. Slay the dragon to **win**.

▶️ **Play:** once GitHub Pages is enabled, the game is live at
`https://<owner>.github.io/gg-3d/`

[![Tests](https://github.com/byuser/gg-3d/actions/workflows/ci.yml/badge.svg)](https://github.com/byuser/gg-3d/actions/workflows/ci.yml) ![status](https://img.shields.io/badge/build-static%20site-blue) ![engine](https://img.shields.io/badge/engine-Babylon.js-orange)

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / Arrow keys | on-screen stick (bottom-left) |
| Look | drag mouse | drag the screen |
| Zoom | mouse wheel | two-finger pinch |
| Attack (weapon) | `Space` or `F` (hold) | ✨ button (bottom-right) |
| Cast a skill (quick bar 1/2/3) | `1` `2` `3` | tap a quick-bar slot (bottom-centre) |
| Use potion (belt 4/5/6) | `4` `5` `6` | tap a potion slot (bottom-left) |
| Skills &amp; fusion | `K` | ✨ button (top-right) |
| Inventory / equipment | `I` (or `B`) | 🎒 button |
| Crafting bench | `C` | 🛠️ button (top-right) |
| Quest log | `J` (or `L`) | 📜 button (top-right) |
| Talk / collect / gather / shop / build (`E`) | `E` | action button (bottom-right) |
| Travel to another land | walk into a path / bridge / cave portal | same |
| Music on/off | `M` | 🔊 button (top-right) |
| Pause / menu | `Esc` | ☰ button (top-right) |
| Language (EN / RU) | start screen · pause settings | same |
| Audio volumes / mute | start screen · pause settings | same |

## Languages (English / Russian)

The whole game is localized — **every** user-facing string (start screen, HUD, toasts,
prompts, shop/inventory/anvil/crafting/quest-log/dialogue, plus all data: zone & NPC names,
quest titles & stories, item names & descriptions, weather and clock) is resolved through a
small i18n layer:

- **`LOCALES = { en, ru }`** flat dictionaries + a `t(key, params)` helper (with `{placeholder}`
  interpolation and English fallback) drive the UI/dynamic strings; a **key-parity** test keeps
  `en` and `ru` in lock-step so no key can drift.
- The **data tables** keep their English text as the source of truth; the parallel **`RU`**
  object holds the Russian, read by per-field resolvers (`tItemName`, `tZoneName`, …) that fall
  back to English. A **completeness** test walks the tables so no data string ships untranslated.
- **Russian plurals** use the standard one/few/many rule (`plural()`); the locale persists in
  `localStorage` and is applied **before first paint** and **live** on switch (no reload needed),
  also updating `<html lang>`.

Everything is feature-detected (`localStorage`, `querySelectorAll`), so the headless harness
runs in English without a browser.

## How to play — the adventure

- **The main story (missions & chapters):** the campaign is a **guided main line** — five
  ordered **chapters** of **missions** that march you to the castle→dragon finale. The HUD
  **objective tracker** (top-left) always shows the **current step**: which **❗ NPC** to see to
  accept it, the live **objective** while you're on it, and a **✓ return to turn in** when it's
  done — so a new player can follow the whole story with **no guesswork**. An **intro** sets the
  scene on a fresh game and an **ending** plays on victory.
- **Quests & NPCs:** five **story NPCs** stand at the island's landmarks (the village, the grove,
  the shore, the mountain pass and the ruins), each marked with a floating **❗ / ✓**. Walk up +
  press **E** to **talk**: accept a mission or side quest, check progress, or turn a finished one
  in. Objectives are **hunt** (defeat sweets), **gather** (collect a material), **reach** a place,
  **talk** to someone, **defeat a lair boss**, **build** a castle part, or — for the finale —
  **slay the dragon**; rewards mix **coins**, **gear** and the castle **relics**.
- **Side quests:** optional **bounties and errands** from the same NPCs, clearly **separated from
  the main line** in the quest log. Some are **repeatable** (steady-coin bounties), others
  one-shot — take them in any order; they never block the story. Track everything in the
  **chaptered quest log** (`J` / 📜), which groups the **Main Story** (by chapter) apart from your
  **Side Quests**.
- **Gathering & crafting:** the world is dotted with **resource nodes** — chop **trees** for
  wood, mine **rock** and **crystal**, gather **herbs**, cut **fibers** and collect **water** at
  the shore (walk up + **E**; nodes respawn after a cooldown). Open the **crafting bench**
  (`C` / 🛠️) to turn materials into **potions** (straight to your belt) and **gear** (to your
  bag). Your materials pouch is shown top-left.
- **The castle:** on **Castle Hill** stands the build site (walk up + **E**). Spend a matching
  **relic** + **coins** to raise each of the five parts in order — **Foundation → Walls →
  Towers → Gatehouse → Keep** — and watch it grow in the world. Finish the **Keep** and the
  **Ancient Dragon** is summoned for the climactic fight. Slay it to **win**.
- **The dragon:** a huge winged final boss that **hovers**, **dives** and breathes fans of
  **fire**. It has a big health bar of its own; felling it triggers the **Victory** screen.
- **Monster variety (Plants-vs-Zombies-style):** every living sweet rolls an **ability** that
  unlocks as the waves escalate — **chasers**, fast **runners**, tanky **brutes**, leaping
  **jumpers**, ranged **shooters** that spit candy bolts, and **bombers** that **explode** on
  death. Each is tinted so you can read the threat at a glance.
- **Weather & time:** a rolling **day/night cycle** sweeps the sun, sky, ambient light and fog
  through dawn, day, dusk and night (see the HUD **clock**), while the **weather** drifts
  between **clear**, **cloudy**, **foggy**, **rain** and **storm** (with falling rain) — shown
  on the HUD weather chip.
- **Lighting & shadows:** crisp, **grounded sun shadows** (cascaded + contact-hardening on
  capable GPUs, soft PCF in the middle, a cheap blurred map on weak hardware), **ACES tone
  mapping** so colours sit in a coherent filmic light, a **subtle bloom** on glowing props and
  optional **soft ambient occlusion** — all on a **graphics tier** auto-detected from your
  device (desktop → full, phones → lighter) so it stays smooth. Each land carries its own light
  **mood** (airy peaks, moody caverns) on top of the day/night + weather tint. You can also
  **override the tier yourself** in **Pause → Graphics** — pick **Auto** (the default device-detect)
  or force **High / Medium / Low**; the choice **persists** and applies via a quick reload that
  **keeps your progress**. *(Debug: `window.__GG_QUALITY__ = "high" | "medium" | "low"` still wins.)*
- **Higher-fidelity models:** materials upgrade to **physically-based (PBR)** rendering — energy-
  conserving, lit by a tiny **procedural sky probe** (image-based lighting, no asset files) so
  candy reads glossy, gems + crystals glint, and metal blades sheen — with a **StandardMaterial
  fallback** on weak GPUs. Meshes carry **rounder silhouettes** (layered, shaded tree canopies on
  tapered trunks; craggier rocks; clustered crystal spires; Lily now has hands). It's all on the
  same auto-detected **graphics tier** as the lighting (desktop → PBR + the IBL probe + the densest
  meshes; phones stay on lighter geometry, low-end keeps Standard) so it stays smooth everywhere.
- **Lively animation:** every attack now reads with clear **anticipation → impact → recovery** —
  Lily winds the blade back and whips it across her body for melee, draws the wand back before a
  ranged thrust, and gives a deliberate **chop/reach** when harvesting; she also **flinches** when
  struck. The motion runs through a small, frame-rate-independent **state machine** that freezes
  cleanly with the pause menu. Each land also **breathes**: drifting ambient particles tuned per
  zone (meadow **pollen**, forest **spores**, **sea mist**, falling **snow** on the peaks, glowing
  **motes** in the caverns, **embers** in the thicket) plus wandering **butterflies** by day and
  glowing **fireflies** in the dark, over **gustier, per-zone wind** (windy peaks, sheltered lairs).
  It's all gated by the **graphics tier** and **disposed on travel** (no leaks).
- **Bright, cheerful art + a wide view:** a warm **colour grade** lifts the whole world out of
  the washed-out greys — terrain, foliage, water, sweets and props all read **lusher and more
  saturated** (already-vivid candy stays candy; nothing goes neon), with a small **exposure**
  nudge so the daylight feels sunny under ACES. The **view opens up** too: the per-land fog is
  thinned so you can see **much farther** (the meadow's clear-distance roughly doubles; the deep
  woods and caverns stop feeling like a wall) and the camera draws a **wider** scene. It's all
  **tier-gated** — high-end desktops open right up, while phones keep a tighter, atmospheric
  radius for a steady frame rate — and every land keeps its own **mood** (airy meadow, moody
  lairs), with markers + enemies staying easy to read against the brighter ground.
- **Impactful hits:** bolts, arrows and melee swings now **knock sweets back** and throw a
  **shower of shards** on impact; bolts also **splat** on the ground and solid scenery. Bombers
  detonate in a shockwave that shoves everything nearby.

## How to play — the wild lands & travel

- **Lands & travel:** the world is split into **separate, themed lands** — the home
  **Meadowgate Vale** (the hub), the **Whisperwood Deep**, the **Saltmarsh Strand**, the
  **Frostpeak Trail**, and two boss lairs (the **Crystal Caverns** and the **Bramblewood
  Thicket**). Each land glows with a **portal** at its edge — a **path**, a **bridge** or a
  **cave mouth** — and **walking into one** streams you to the connected land. Travel is
  hidden behind a quick **fade** (with the destination's name) so the world loads without
  freezing, on desktop or mobile. Your current land is shown on the HUD **📍 location chip**.
- **Roaming monsters & respawns:** every land has its **own monster types** that **spawn at
  fixed points** and **wander** their patch until you get close, then give chase. Fell them
  and the land **respawns** fresh ones after a short delay, up to a per-land cap — so there
  are always foes to hunt, but you're never swarmed by an endless timer. Deeper lands hold
  **tougher, faster** monsters with more dangerous abilities.
- **The home hub:** the **Meadowgate Vale** is where the **merchant**, the **blacksmith**,
  the **story NPCs**, the **resource nodes** and the **castle build site** live — they're
  always there to visit between expeditions. The wild lands are pure **hunting grounds** (plus
  a few themed resource nodes), so head out to fight and gather, then return to spend and build.
- **Potions & the belt:** buy **health potions** (minor / standard / **greater**) and
  **elixirs** (Might, Swiftness) from the merchant. They go onto a **3-slot potion belt**
  in the **bottom-left corner** — each slot **stacks** one kind. Quaff one with `1`/`2`/`3`
  (or a tap): health potions heal instantly; elixirs grant a **timed buff** shown as a
  countdown pill above the belt.
- **The blacksmith:** a burly **🔨 smith** sets up at the plaza between waves beside the
  merchant. Walk up + press **E** to open the **anvil** and spend coins to **enhance**
  your weapons and equipment (`+1`, `+2`, …). Rarer gear (**common → rare → epic →
  legendary**) forges to a higher level and gains more per level, so prize loot is worth
  investing in. Enhancement boosts the item's stats / weapon damage and its resale value.
- **Artifacts:** grabbing a glowing artifact now also **heals** you a little and pays a
  small **coin** reward on top of the score — handy mid-fight.
- **Coins:** defeated sweets sometimes drop **golden coins**. Walk near one and it's
  scooped up (coins even magnet toward you). Coins are the currency you spend at the
  merchant's shop.
- **Gear & inventory:** open your **inventory** (`I` / 🎒) to see your **equipment
  slots** — **helmet**, **breastplate**, **boots**, a **necklace**, **two rings**, and
  **two hands** — and your **bag**. Click a bag item to equip it; click an equipped slot
  to put it back. Your **stats** (max health, resistance, speed, lifesteal, weapon
  damage) update live from whatever you're wearing. Hold a **two-handed** weapon (bow,
  staff, greatsword) and it fills both hands; hold **two one-handers** to **dual-wield**
  for a faster, stronger attack.
- **Weapons:** ranged **wands**/**staves** (magic bolts), **bows** (arcing, piercing
  arrows) and melee **swords**, **axes** and **daggers** (a sweeping arc that can hit
  several sweets at once). Hold the attack key/button to fight.
- **Lair bosses:** the **Crystal Caverns** and the **Bramblewood Thicket** each guard a
  colossal **Sweet King** 👑 in their depths — the **Cavern Gumlord** (a ground-pounding
  **Stomper**) and the **Bramble Hydra** (a **Splitter** that sheds minions while alive and
  **bursts into more on death**). Each telegraphs its attacks (a flashing wind-up), has its
  own attack **sound** and a dedicated **health bar**, and drops a guaranteed **rare item**
  plus a **purse of coins**. Fell a lair boss and it **stays cleared for the run**. (The
  six boss **archetypes** — charger / caster / summoner / stomper / bomber / splitter — also
  back the **dragon** finale and future lairs.)
- **Coins:** defeated monsters sometimes drop **golden coins** (and bosses a whole purse).
  Walk near one and it's scooped up (coins even magnet toward you). Coins are the
  currency you spend at the merchant's shop.
- **The merchant:** the **travelling merchant** 🧙 keeps a permanent stall in the home
  **vale**. Walk up and press **E** (or the action button) to open the **shop**. Three tabs:
  **Buy** normal weapons, armour, accessories and **potions**; **✨ Rare** — a **rotating
  selection of rare/epic/legendary wares** (a premium, but no need to wait for a boss); or
  **Sell** any spare gear from your bag (enhanced gear sells for more). Bosses still **drop**
  guaranteed rare loot too.
- **Solid world:** trees, rocks, bushes, toadstools, crystals, cave pillars, lampposts and
  the vale's river are **solid** — you bump and slide around them instead of walking through.
  A winding **river** with **wooden bridges** crosses the home vale.
- **Living sweets:** a dozen kinds — lollipops, gummy bears, cupcakes, donuts, candy
  canes, ice-cream cones, macarons, candy corn, chocolate bars, jelly beans,
  marshmallows and pretzels — each land drawing from its own palette.
- **Monster counter:** the HUD shows how many monsters are currently roaming the land (`👹`).
- **Score:** **+25** per monster defeated, **+50** per artifact collected. **Coins** are a
  separate currency spent at the merchant.
- **Music:** a procedurally-synthesised soundtrack plays as you fight (no audio files —
  it's generated in-browser). Toggle it with `M` or the 🔊 button.
- **Sound & ambience:** a fuller procedural soundscape (still no audio files). Richer
  **sound effects** — per-surface **footsteps** (grass / stone / sand / snow), gather/mine
  cues, quest accept/turn-in chimes, a portal **whoosh** on travel, UI clicks and a
  **low-health** warning. Every land also has its own **ambient bed** — meadow birds &
  breeze, forest wind & creaks, shore waves & gulls, frostpeak wind howl, cavern drips &
  drone, thicket insects — that **crossfades** as you travel between zones. A small **mixer**
  (Master · Music · Effects · Ambience volume sliders + a **Mute all** toggle) lives on the
  **start screen** and in the **pause settings**, and your choice **persists** across reload.
- **Health:** the sweets bite on contact. When your health hits zero it's **game over** —
  your final score and the wave you reached are shown.
- **Camera:** the view follows Lily at a fixed distance; zoom only with the mouse
  wheel (or a two-finger pinch on mobile).
- **Pause menu:** press **Esc** or the **☰** button to pause the game at any time. The
  menu lets you **Resume**, **Save Progress**, **Restart**, or **Exit to Menu** — the
  last two ask for confirmation so a stray tap can't wipe your run.
- **Save & load:** **Save Progress** downloads a small `.json` save file to your device
  capturing *everything* needed to resume — the procedural environment (via its world seed),
  the **land you're in**, your score, money, **gear & inventory**, health, **materials & relics**,
  **story progress** (current chapter, completed missions, reach/talk objectives, side-quest
  tallies), the **castle build state**, cleared **lair bosses**, and the **time/weather**. Back on
  the **start screen**, **Load Progress** reads a save file from your device and drops you right
  back where you left off — even on a different device or browser.

## Why Babylon.js?

The brief is a game that runs on **GitHub Pages** (static hosting, no server) on both
**mobile and desktop**, and whose **future releases add combat, puzzles, and NPC dialogue**.

[**Babylon.js**](https://www.babylonjs.com/) is a full WebGL **game engine** — not just a
renderer — shipped as plain static JS files, so it deploys to GitHub Pages with zero build
step. Out of the box it gives us exactly what the roadmap needs:

- **Physics engine** (Havok / Ammo) → ready for the **combat** release.
- **GUI system** (`babylon.gui`, already loaded) → ready for **NPC dialogue**.
- **Camera + input + animation systems** with first-class **touch support** → mobile works today.
- **Scene graph + collisions + asset loaders** → puzzles and richer levels slot in cleanly.

Three.js is more popular but is a low-level rendering library where physics, GUI, and controls
are separate add-ons you assemble yourself — more glue code for a game with this roadmap.
PlayCanvas is strong but is editor-centric. Babylon.js is the best fit for a code-first,
static-hosted game that needs to grow into a small RPG.

## Project layout

```
index.html              # markup, overlays, HUD, CDN script tags, module entry
css/style.css           # HUD, overlays, touch controls, responsive styling
src/main.js             # composition root (Vite entry → imports the game)
src/core/               # config (RNG + CONFIG), i18n (EN/RU)
src/data/               # pure content tables: items, skills, content, story, zones
src/game.js             # the runtime: entities, world, systems, UI, save/load
test/setup/stubs.js     # Babylon + DOM + Web Audio stubs for the Vitest suites
test/*.test.js          # Vitest unit/logic (ported harness) + functional flows
test/e2e/               # Playwright real-browser boot smoke
vite.config.js          # build → hashed static bundle in dist/ (Babylon stays CDN)
eslint.config.js .prettierrc.json tsconfig.json   # lint / format / typecheck
ARCHITECTURE.md         # module map + data flow + toolchain (read this first)
CHANGELOG.md            # release history (Keep a Changelog format)
TODO.md                 # agent task backlog + per-task acceptance criteria
.github/workflows/      # CI (lint→typecheck→test→build→E2E) + Pages deploy
public/.nojekyll        # copied into dist/ so Pages serves files as-is
```

The site is **built** from the `src/**` ES-module tree by **Vite** into a hashed
static `dist/` bundle (Babylon is loaded from its CDN, so it isn't bundled). See
[`ARCHITECTURE.md`](./ARCHITECTURE.md). Release history lives in
[`CHANGELOG.md`](./CHANGELOG.md).

### Tests

The suite is layered. The Vitest unit/logic suite (`test/harness.test.js` — the
former `test/harness.js` ported **verbatim**, ~360 checks) stubs Babylon + the
DOM (with faithful vector math) so the real gameplay modules run in Node —
verifying collision, the river barrier, the
**boss archetypes** (caster bolts, summoned minions, scaling, rare drops), the
**gear economy** (buy / equip / dual-wield / sell), **projectile physics** (gravity arc
+ finite life), the seeded RNG, the **save/load round-trip** and the **pause menu** — plus
the **adventure systems**: **monster abilities** + **knockback** + **bomber** explosions,
**gathering & crafting**, the **quest** engine (every objective type: hunt / gather / reach /
talk / **defeat-boss** / **build** / **defeat-dragon** — accept / progress / turn-in / rewards),
the **day/night + weather** systems, **impact bursts**, the **castle → dragon → victory** path,
the **RPG zones** suite (per-zone **location spawns**, monster **roaming**, timed **respawns**,
**lair boss** spawn/clear/persist, streamed **zone travel**), the **main-story campaign**
suite: strict **mission ordering/unlocks**, the **guided tracker**, **main-vs-side** separation,
**repeatable** side quests, the **finale** enablement, the UI render paths, and the **story-state
save/load round-trip**, the **i18n** suite: **EN/RU key-parity**, `t()`
**interpolation**, **Russian pluralization**, **data-translation completeness**, locale-aware
objective text, and the **locale-persistence round-trip**, the **lighting & shadows**
suite: the **quality-tier** decision (a pure function of device facts), **every zone building +
tearing down its shadow generator** without leaking, the **feature-detected post-FX** setup
(tone mapping / bloom / SSAO) and the **per-zone light mood**, and the new **higher-fidelity
models** suite: the **model-fidelity tiers** (PBR / env / mesh-density gating), the **PBR ⇄
StandardMaterial fallback**, the legacy **diffuse/specular aliases**, the procedural **IBL env
probe**, and **every zone building + tearing down on the PBR + env tier** without throwing, and the
new **animation** suite: the attack **state machine** (anticipation → impact → recovery phase
transitions + timers, proven **frame-rate independent** and **pause-correct**), the player **flinch**
+ **gather** triggers, the pure **per-zone ambient spec**, **tier-gated** ambient density, and
**every zone building + animating + disposing its ambient FX** (feature-detected, **leak-free**),
and the new **audio** suite: per-surface **footstep** mapping, the pure **per-zone ambience bed**
recipes, the **mixer** volume **clamping** + channel validation + **master mute**, the
**settings persistence round-trip** (survives reload), the **headless no-op** path (no
`AudioContext`), and — against an **injected Web Audio stub** — the **bus graph build**, **every
SFX cue** firing, and **ambience crossfade** through all zones (plus stride-cadenced footstep
wiring), and a **docs doc-lint** suite that asserts `CHANGELOG.md` parses as the expected
Keep a Changelog structure (title + a single `[Unreleased]` section atop the migrated dated
entries) and that `TODO.md` no longer carries the release log, and the **bug-fix**
suite (`test/bugfixes.test.js`) that locks in the Task 10 correctness fixes:
**roads never cross open water** off a bridge (seeded over 40 hub layouts), the
**resource-node cap** invariant (spawn / respawn / travel / reload), reliable
**harvest** through the real interact key (including right after a zone swap),
**solid castle** collision (player push-out + wand-bolt splat, with a **passable
gate**) that survives a zone rebuild, and the **swing** landing damage on its
**strike (impact) frame** in arc + range, exactly once, and the **art-direction**
suite (`test/artdirection.test.js`) that locks in the Task 11 cheerful grade +
wider view: the **colour grade** is pure (lifts saturation/value, **preserves hue**,
**clamps**, leaves vivid candy untouched), the **fog opens up per tier** (high
thins it, low keeps it tight) while indoor lairs stay moodier, the **draw distance**
(`maxZ`) is **tier-ordered**, per-zone **exposure/contrast** stay in a readable ACES
range, gameplay-critical **markers/enemies remain perceptually distinct** from each
brightened ground, and **`buildWorld` applies the graded fog** on every tier without
throwing, and the **item & equipment** suite (`test/items.test.js`) that locks in
Task 12: the **affix roll** (right count per rarity, drawn only from the item's
category pool, **deterministic** under a seed), the **affix/rarity stat math**
(rarity-scaled, flat over enhancement; **haste compounds**), the **equipment sets**
(cumulative threshold bonuses, folded into the live recompute), the widened **12-slot**
loadout + **equip rules** (`equippedAfter` mirrors `equipItem` for 2-handed / dual-wield /
rings), the **compare-vs-equipped deltas**, the **visible worn gear** (core silhouette +
high-tier extras, **tier-gated**, toggled with **no mesh reallocation** across
equip/unequip), the **tabbed inventory** (filter / sort / potion consume), and the **v7
save round-trip** of affixes + the new slots **plus migration** from an older (v6) file,
and the **skill & leveling** suite (`test/skills.test.js`) that locks in Task 14: the
**XP curve + focus math** (pure), **level-up** grants (health + focus + auto-learned skills),
**focus regen + cooldown** ticking, the **quick-bar** assign (deduplicated) + **activate**
(volley fires bolts, nova damages + **chills**, buff/heal apply; focus + cooldown gating), the
**deterministic 3-skill fusion** blend (effect priority, blended power/AoE/count, inherited
slow/lifesteal, mixed element) + **cost** + coin/crystal charge, **boss-loot skills** (seeded →
reproducible, boss-only, drying up once all owned), the headless-safe **skills overlay** render +
fusion preview, the skill **i18n** (names/labels + RU completeness), and the **v8 save round-trip**
of level/xp/focus/owned/fused/slots **plus migration** from an older (v7) file.
On top of that, a
**functional** suite (`test/functional.test.js`) boots the assembled game in
isolation and drives whole flows (start → zone travel → save/reload round-trip),
and a **Playwright** suite (`test/e2e/boot.spec.js`) loads the built bundle in
real headless Chromium and asserts the canvas boots with **no console errors**
and the core overlays open:

```bash
npm ci          # once
npm test        # Vitest: ported harness + functional + smoke
npm run test:e2e  # Playwright: real-browser boot smoke (needs a browser)
npm run verify  # lint + typecheck + test + build (the fast CI path)
```

### Architecture

The runtime in `src/game.js` is organised as small systems so features are
additive, not a rewrite (pure content tables live in `src/data/`, foundations in
`src/core/`; see [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

- **`Interactable` / `InteractionSystem`** — a reusable "walk up + press E" contract;
  artifacts and the **merchant NPC** use it (puzzle levers will too).
- **`Input`** — unifies keyboard, the on-screen joystick, and the cast button.
- **`Player`** — Lily, built from primitives with a procedural walk cycle, a swappable
  held weapon (wand / bow / blade), melee + ranged attacks, health, and a derived stat
  block computed from her gear.
- **`ITEM_DB` / `AFFIXES` / `SETS` / equipment / `deriveStats`** — the item catalogue
  (weapons, armour, accessories; **rarity tiers** common → rare → epic → legendary), the
  **12-slot** model (helmet/pauldrons/breastplate/gloves/belt/boots/cloak/necklace/2 rings/
  2 hands), the enchantment + set tables, and the **pure** stat pipeline that recomputes the
  player from what's equipped. See the **item & equipment model** below.
- **`Inventory` / `Shop`** — the **tabbed** bag-and-paper-doll inventory UI (Gear / Materials /
  Potions; equip/unequip, filter/sort, **compare-vs-equipped** deltas, drink potions, live
  stats + set bonuses) and the merchant's **Buy/Sell** shop (normal stock only; rare gear is boss-only).

#### Item & equipment model (Task 12)

A small, declarative, **data-driven** model in `src/data/items.js`, with pure helpers so the
whole thing is unit-testable without a GPU:

- **Categories & slots.** Each item is a _weapon_, _armour_ or _jewelry_ (`itemCategory`). The
  loadout is **12 slots** — every armour `type` equals its slot name, so `equipItem` routes by
  type; a 2-handed weapon fills both hands (`TWO_HANDED` sentinel); rings round-robin.
- **Rarity tiers.** `RARITY` common → rare → epic → legendary scales base stats, affix count and
  affix magnitude, and how far the blacksmith can `enhance` an item.
- **Enchantments (affixes).** `AFFIXES` are prefix/suffix modifiers. Found/crafted gear rolls
  `rollAffixes(def, rng)` — a deterministic, seeded draw from the affixes valid for the item's
  category, **count by rarity** (rare 1 · epic 2 · legendary 3). The rolled ids live on the
  instance (`inst.affixes`) and **serialize**, so a reload never re-rolls. `effectiveStats` folds
  them in (rarity-scaled additive stats; haste compounds). Shop gear stays clean.
- **Set bonuses.** `SETS` (Ironguard, Dragonscale) grant cumulative stat bonuses at piece-count
  thresholds; `setBonusStats(equipment)` is pure and feeds the live recompute.
- **Derived stats.** `deriveStats(base, equipment, buffs)` is the one pure function the live
  `recomputeStats` _and_ the inventory's `equipDelta` compare tooltips share (the latter via
  `equippedAfter`, a pure simulate of the equip rules) — so "what changes if I equip this?" is
  always exact.
- **Worn gear.** Procedural meshes are built **once** on Lily and toggled/recoloured by rarity on
  equip (`refreshWornGear`) — never reallocated, so it can't leak — parented to the body so it
  animates for free, with a tier-gated billowing cloak. `wornDetailFor(tier)` drops the lightest
  pieces + the per-frame sway on low-end devices.
- **Persistence.** `SAVE_VERSION` 7 stores `{ id, lvl, aff }` per instance across the bag + all 12
  slots; older saves (no affixes / no new slots) load with clean defaults.
- **Value / weight.** Items carry a coin **value** (resale, scaled by enhancement); **weight /
  encumbrance** was considered and deferred (noted as a follow-up — no durability/repair economy).

#### Skill, leveling & fusion model (Task 14)

A second declarative, **data-driven** layer in `src/data/skills.js` — pure level math + a
deterministic fusion blend, so the whole system is unit-testable headless:

- **Leveling & focus.** Defeating foes, turning in quests and gathering grant **XP** (`Skills.xpFor`);
  `xpToNext(level)` is a smooth super-linear curve. Each level grants **+max health** (folded into the
  player's `base`, so the gear `recomputeStats` pipeline is untouched) and **+max focus** — the
  spell resource that regenerates over time (`maxFocusForLevel`). Newly-unlocked base skills are
  **auto-learned** on level-up.
- **Active skills.** `SKILL_DB` defines each skill's `effect` the runtime resolves — **volley** (a
  fan of element-tinted bolts), **nova** (an AoE burst around the player, with frost _slow_ /
  shadow _lifesteal_), **buff** (a timed self buff via the existing buff system) or **heal** — plus
  the numeric **attributes** (power, focus cost, cooldown, count/radius/duration, element + flags)
  that fusion blends. Effects reuse the proven `Projectile` / nova / `applyBuff` paths and
  feature-detect Babylon, so they never throw headless.
- **Quick bar.** Up to **three** skills slot onto a HUD bar by the shoot button — cast with hotkeys
  `1` `2` `3` or a tap, with a radial cooldown sweep and a focus-cost readout. (The potion belt
  moved one set over to `4` `5` `6`.)
- **Fusion (the marquee feature).** `fuseSkills(defs)` is **pure + deterministic**: it blends 2–3
  owned skills into a brand-new one — the strongest effect wins, power/cooldown/cost/AoE/count and
  the slow/lifesteal/pierce flags are combined, and the element is the shared school or _Prismatic_
  if mixed. It costs **coins + crystals** (`fusionCost`, tier-scaled); the result is a real,
  slottable, savable skill (reproduced exactly on reload, never re-rolled).
- **Boss-loot skills.** A pool of powerful skills drops **only** from bosses, rolled through the
  seeded `rng()` after the existing coin/gear draws (so drop determinism is untouched) and added to
  the roster — one unowned boss skill per kill until all are collected.
- **Persistence.** `SAVE_VERSION` **8** stores `progress` (level/xp, focus, owned + fused skills, the
  quick-bar slots) in the player block; older saves (no `progress`) load at level 1 with the starter
  skill and default sanely.

- **`Projectile` / `Hazard`** — gravity-bound, life-capped ballistic projectiles. The
  player's bolts/arrows (`Projectile`) and the bosses' hostile candy bolts (`Hazard`)
  both arc under gravity and die on ground/timeout, so nothing flies forever.
- **`Monster`** — a "living sweet" with chase AI, a hoppy bob, and a pop-on-death effect.
- **`Boss`** — four **archetypes** (charger / caster / summoner / stomper) sharing the
  Monster interface; each has its own attack pattern, scales every cycle, rolls in
  randomly every 5 waves, and drops a guaranteed **rare item** (`ItemDrop`) + coins.
- **`Coin` / `ItemDrop` / `Merchant`** — coins and rare loot dropped in the world, plus
  the plaza merchant who runs the shop between waves.
- **`Mixer`** — the shared audio backbone: a single Web Audio graph wiring `Sfx` / `Music` /
  `Ambience` through per-channel **bus gains** into a master, with 0..1 volumes + a master-mute
  that **persist** in `localStorage`. `AudioUI` drives the matching sliders/mute on the start
  screen + pause settings; everything is feature-detected (no `AudioContext` ⇒ silent no-op).
- **`Music`** — a tiny Web Audio synth that plays a looping procedural soundtrack (no
  audio assets), mutable from the HUD; now routed through the `Mixer`'s music bus.
- **`Sfx`** — procedural one-shot sound effects (combat, pickups, **footsteps** per surface,
  gather/mine, quest, UI, portal, low-health) on the `Mixer`'s effects bus.
- **`Ambience`** — a per-location procedural **background bed** (birds/wind/waves/gulls/drips/
  insects/drone, chosen by a pure `bedFor(zone)`) on the `Mixer`'s ambience bus, **crossfaded**
  on zone travel via `ZoneManager`.
- **`ZONES` / `buildWorld(scene, zone)`** — the world is a table of **zones** (a hub + wild
  lands + boss lairs), each with its own theme, scenery spec, monster spawn table and
  optional boss. `buildWorld` themes the terrain/lighting/backdrop, scatters the zone's
  scenery (wind-swayed foliage, palms, crystals, cave pillars, snow), builds the edge
  **portals**, and returns the world contract (`obstacles` + `moveActor` collision, lights,
  `portals`) plus a `dispose()` that streams the zone back out.
- **`ZoneManager`** — moves the player between zones. Stepping onto a portal triggers a
  faded transition: tear down the old zone's entities, `dispose()` its scenery, build + theme
  the new zone, lay its content, spawn its residents, and drop the player at the return
  portal — all behind a black veil so it never shows a frozen frame.
- **`SpawnDirector`** — the RPG replacement for timed waves: per-zone resident monsters spawn
  at fixed points, **roam** (`Monster._wander`), and **respawn** after a delay up to the
  zone's cap; boss-lair zones spawn their guardian in the depths.
- **`setupZoneContent`** — lays the per-zone content on a freshly built world: the hub gets
  the merchant, blacksmith, NPCs, resource nodes, castle and artifacts; the wild lands get
  themed resource nodes.
- **Save/load (`serializeGame` / `applySave`)** — snapshots the run to JSON and rebuilds it:
  re-seed, restore the player (pose + **inventory & equipment**, materials, relics), score,
  money, quests, castle, cleared lairs and time/weather, then **stream to the saved zone**
  (its monsters regenerate from the spawn table). Stats are recomputed from the restored gear.
- **`Pause`** — the in-game pause menu (Resume / Save / Restart / Exit) that freezes the
  simulation, with a confirmation guard on the destructive actions.
- **`STORY` / `MISSIONS` / `SIDE_QUESTS` / `Story`** — the **structured main campaign**: a
  declarative table of five ordered **chapters** of **missions** (plus an optional **side-quest**
  pool), and the `Story` controller that gates the main line in order, computes the single
  **guided step** for the HUD tracker, decides which quest each NPC may offer, and fires the
  **intro / chapter / ending** beats. Campaign-flow state (intro seen, chapter beats, repeatable
  tallies) lives here; per-quest state lives in `Quests`.
- **`Quests` / `QuestGiver` / `Dialogue`** — the per-quest **objective engine** shared by the
  main missions and side quests: objectives are `hunt` / `gather` / `reach` / `talk` /
  `defeat_boss` / `build` / `defeat_dragon`, with rewards (coins / gear / **relics**) paid on
  turn-in. The `Dialogue` overlay lists every quest a giver is involved in (accept / progress /
  turn-in) and doubles as the narrator for story **beats**; `QuestGiver` markers light up in
  campaign order.
- **`ResourceNode` / materials / `CRAFT_RECIPES` / `Crafting`** — harvestable world nodes feed a
  materials pouch (`player.materials`); the crafting bench spends them on potions + gear.
- **`CastleSite` / `CastleUI` / `Dragon`** — the five-part castle build (relic + coins per part)
  that grows in the world and summons the **dragon** final boss; felling it calls `winGame`.
- **Monster abilities (`MONSTER_ABILITIES`)** — every sweet rolls a behaviour (chaser / runner /
  brute / jumper / shooter / bomber); shooters fire `Hazard`s, bombers explode on death.
- **`DayNight` / `Weather`** — a keyframed sun/sky/fog cycle and a weather state machine (with a
  rain particle system) that layer over the scene.
- **`Quality` / `makeSunShadows` / `setupPostFX` / `applyZoneMood`** — the lighting layer.
  `Quality` auto-detects one graphics **tier** (high / medium / low) from device facts (its
  `pick()` is a pure, tested function) — or honours a **player override** (`pref`/`setPref`,
  persisted in `localStorage` and resolved by `detect()`) chosen from **Pause → Graphics**, applied
  via a progress-preserving reload; `makeSunShadows` builds the directional sun's shadow
  generator for that tier (cascaded + contact-hardening → PCF → blurred-exponential, with tuned
  bias/darkness so casters sit grounded); `setupPostFX` wires **ACES tone mapping** plus
  tier-gated **bloom** and **SSAO** onto the camera once; `applyZoneMood` nudges exposure/contrast
  per zone. Every engine-only feature is detected + `try`/caught, so weak GPUs and the headless
  harness simply run without the heavy parts. `DayNight`/`Weather` still own the sun/sky/fog tint.
- **`mat` / `emat` / `stdMat` / `pbrMat` / `gloss` / `makeEnvironment`** — the model/material layer.
  `mat`/`emat` return a **`PBRMaterial`** on capable tiers (energy-conserving, metallic/roughness)
  and fall back to **`StandardMaterial`** on weak GPUs / headless; a small alias maps the legacy
  `diffuseColor`/`specularColor` writes onto the PBR channels so every build + animation path is
  untouched. `gloss` tightens roughness/metalness for candy sheen, gem facets and blades;
  `makeEnvironment` builds a tiny **procedural cube** (no asset files) as an image-based-lighting
  probe (`scene.environmentTexture`) for soft sky reflections. The mesh helpers
  (`sphere`/`cyl`/`disc`/…) scale **segment density** with the tier, and the scenery builders add
  layered tree canopies, craggier rocks and crystal clusters where the budget allows. Backdrop
  materials that need StandardMaterial specifics (the unlit sky dome, the sea/river sheen) stay on
  `stdMat`/`stdEmat`. All of it is feature-detected, tier-gated and disposed on zone teardown.
- **`ArtDirection`** — the cheerful **colour grade** + **larger, tier-gated view** (Task 11), all
  pure data-driven helpers: `grade()` lifts saturation/value on every `mat`/`emat` base colour
  (so muddy greens/browns read lush and candy pops, clamped so nothing blows out);
  `fogDensityFor(zone, tier)` thins each land's fog per tier (high opens the view; low keeps it
  tight; indoor lairs blend only halfway, staying moody); `view(tier).maxZ` sets the camera draw
  distance to match; and `exposureFor`/`contrastFor` (which `applyZoneMood` applies) keep the
  brighter palette punchy-but-readable under ACES. `luminance`/`contrastRatio` back the readability
  test. The backdrops bypass the grade so `DayNight`/`Weather` keep exact sky/fog control.
- **`Burst` / `spawnImpact`** — pooled, self-disposing impact effects + monster **knockback** so
  hits land with weight (feature-detected so it stays headless-safe).

The bottom of `src/game.js` documents the remaining seam for **PuzzleSystem**.

## Run locally

The game is built with Vite. With Node 20+ installed:

```bash
npm ci            # install dev dependencies (once)
npm run dev       # HMR dev server → http://localhost:5173
# or build + preview the production bundle exactly as Pages serves it:
npm run build && npm run preview   # → http://localhost:4173
```

Babylon is fetched from its CDN at runtime, so an internet connection is needed
the first time a page loads.

## Deployment

Pushing to `master` triggers `.github/workflows/deploy-pages.yml`, which runs the
verify pipeline (lint + typecheck + tests), **builds the static `dist/` bundle**,
and publishes that to GitHub Pages (content-hashed assets — no cache-buster to
bump). Enable Pages once in **Settings → Pages → Build and deployment →
Source: GitHub Actions**.

## Roadmap

- [x] **RPG world of streamed zones** — the map is split into a hub + wild lands + boss lairs
      (`ZONES` / `buildWorld(zone)` / `ZoneManager`), connected by **path / bridge / cave
      portals** that load in/out behind a fade so it never freezes on desktop or mobile
- [x] **Location-based monsters** that **roam** their patch and **respawn** over time
      (`SpawnDirector`) — replacing the timed-wave model
- [x] **Lair bosses** placed in distant lands (Crystal Caverns, Bramblewood Thicket) that
      **stay cleared** for the run; save/load is **zone-aware**
- [x] Third-person character, movement & camera (mobile + desktop)
- [x] Collect artifacts for score
- [x] Weapons (wand / bow / staff / sword / axe / dagger) with ranged + melee combat
- [x] Gravity-bound projectiles (arcing arrows/bolts) that never fly forever
- [x] Gear system: a **12-slot** loadout — armour (helmet/pauldrons/breastplate/gloves/belt/boots/cloak), accessories (2 rings + necklace), 2 hands — with **affixes** + **set bonuses**
- [x] Inventory + equipment (two hands; dual-wield or a two-handed weapon) with live stats, a **tabbed** bag (Gear/Materials/Potions), filter/sort, compare deltas & **visible worn gear**
- [x] Normal gear bought from the merchant; rare gear dropped by bosses; sell anything back
- [x] 12 "living sweet" enemy types (now per-land roaming residents — _superseded the timed waves_)
- [x] Live monster counter (now "monsters roaming this land")
- [x] Coins dropped by monsters, collected like artifacts, used as shop currency
- [x] Boss fights — six archetypes (charger/caster/summoner/stomper/bomber/splitter) with telegraphs + per-attack sound (now placed in **lairs** + backing the dragon)
- [x] Potions + a 3-slot stacking potion belt (health potions & timed-buff elixirs)
- [x] Blacksmith NPC — enhance gear for coins, scaling by rarity (common→rare→epic→legendary)
- [x] Rotating "Featured" rare shop tab
- [x] Procedural background music **and sound effects** (Web Audio, no assets) with a mute toggle
- [x] Solid scenery collision (trees, rocks, bushes, toadstools, lampposts)
- [x] A larger map with a winding river + wooden bridges and richer scenery
- [x] Score + health + game-over
- [x] In-game pause menu (resume / save / restart / exit, with confirmations)
- [x] Save progress to a file & load it back (seeded world + full game state)
- [x] **Story mode**: collect coins + five relics, raise the castle, then beat the **dragon** to win
- [x] **Structured main story**: five ordered **chapters** of **missions** (hunt / gather / reach / talk / defeat-boss / build / dragon) with a **guided objective tracker**, an **intro + ending**, and a separate pool of optional **side quests** (some repeatable) — `STORY` / `MISSIONS` / `SIDE_QUESTS` / `Story`
- [x] **Quest-giving NPCs** with dialogue, story chains, and coin / gear / relic rewards
- [x] **Crafting + gathering**: chop trees, mine rock/crystal, gather herbs/fibers, collect water → craft potions & gear
- [x] **Monster abilities** (chaser / runner / brute / jumper / shooter / bomber) that vary by land
- [x] **Dragon** final boss (hover / dive / fire-breath) + a Victory screen
- [x] **Day/night cycle** + **weather** (clear / cloudy / fog / rain / storm) driving sky, sun, fog and rain
- [x] **Bigger world**: an island with a sky dome, surrounding sea, distant mountains and named landmarks
- [x] **Impact feedback**: knockback + shard bursts on hits, ground/scenery splats, bomber shockwaves
- [x] Prettier character animation (swinging ponytails + feet, a forward lean and hip sway)
- [x] **More + higher-quality animation** — attacks read as **anticipation → impact → recovery** via
      a frame-rate-independent, pause-correct **`Swing`** state machine (melee / ranged / gather), a
      **flinch** on damage, plus per-zone **ambient FX** (drifting pollen/spores/mist/snow/motes/embers
      + wandering butterflies & fireflies) over **gustier, per-zone wind** — all tier-gated, feature-
      detected and disposed on travel; covered by a new headless animation suite
- [x] Save/load extended to the full adventure state (materials, relics, quests, castle, time, weather)
- [x] **Russian language support** — full **English + Russian** localization (UI + all data) via a
      `LOCALES`/`t()` i18n layer, switchable on the start screen & in pause settings, applied live
      and persisted (`localStorage`); EN/RU key-parity + data-completeness enforced by tests
- [x] **More realistic lighting & shadows** — grounded sun shadows (**cascaded + contact-hardening**
      → PCF → blurred-exponential), **ACES tone mapping**, subtle **bloom** + optional **SSAO**, and
      a **per-zone light mood** — all gated by an auto-detected **graphics tier** (`Quality`) so it
      degrades cleanly on phones/weak GPUs and stays headless-safe
- [x] **Higher-fidelity models** — **PBR materials** (metallic/roughness) lit by a procedural
      **image-based-lighting** probe, glossy candy/gems/blades, and **rounder, layered** procedural
      meshes (canopies, rocks, crystals, Lily's hands) — tier-gated (PBR + env + densest geometry on
      desktop; lighter on phones; **StandardMaterial fallback** on weak GPUs) and disposed on teardown
- [x] **Graphics-quality setting** — a **Pause → Graphics** selector to choose **Auto** (device
      detect) or force **High / Medium / Low**; the choice **persists** (`localStorage`) and applies
      via a quick **progress-preserving reload**; EN/RU localized, headless-safe + unit-tested
- [x] **More sound effects + per-location ambience** — richer procedural **SFX** (per-surface
      **footsteps**, gather/mine, quest accept/turn-in, portal **whoosh**, UI clicks, low-health
      warning) and a unique **ambient bed** per land (birds/breeze, wind/creaks, waves/gulls, wind
      howl, drips/drone, insects) that **crossfades** on travel, all behind a small **mixer**
      (Master · Music · Effects · Ambience + **Mute all**) on the start screen + pause settings that
      **persists** (`localStorage`); fully procedural (no audio files), feature-detected + unit-tested
- [x] **Modular codebase + build/test/CI toolchain** — the single `js/game.js`
      IIFE split into an ES-module tree (`src/core` + `src/data` + `src/game.js`,
      composed by `src/main.js`), built by **Vite** into a hashed static bundle
      (Babylon stays CDN-externalized), with **ESLint** + **Prettier** +
      **`tsc --checkJs`**, a layered test suite (**Vitest** logic + functional +
      **Playwright** real-browser smoke), and staged **CI** — behavior unchanged
      (the full legacy harness ported verbatim still passes)
- [x] **Correctness pass + deeper test net** — **bridge-aware roads** (no road
      crosses open water in any seed), a **resource-node cap**, hardened
      **harvest** (reliable through the real interact key, even after travel),
      **solid built castle** parts (player push-out + no shoot-through, gate stays
      passable) restored across zone rebuilds, and a **swing** that lands on its
      **strike (impact) frame** in arc + range — each locked in by a new
      `test/bugfixes.test.js` suite
- [x] **Brighter art direction + a larger view** — a cheerful, data-driven **colour
      grade** (`ArtDirection.grade`) lifts saturation/value on every material so the
      world stops reading washed-out (vivid candy stays vivid, nothing neon), plus a
      small exposure nudge; the per-land **fog opens up per tier** (`fogDensityFor`)
      and the camera **draw distance** (`maxZ`) widens to match — **tier-gated** so
      phones keep a tight, atmospheric radius while desktops open right up — with
      per-zone moods + marker readability preserved and a new `test/artdirection.test.js` suite
- [x] **Deep item & equipment system** — a **12-slot** loadout (helmet · pauldrons ·
      breastplate · gloves · belt · boots · cloak · necklace · 2 rings · 2 hands), **enchantments**
      (prefix/suffix **affixes** rolled deterministically on found/crafted gear, rarity-scaled,
      shown as chips), **equipment sets** (Ironguard, Dragonscale) with cumulative threshold
      **set bonuses**, **visible worn gear** rendered on Lily — recoloured by rarity, animated with
      the body + a billowing **cloak**, tier-gated, swapped on equip with **no leaks** — and a real
      **tabbed inventory** (Gear / Materials / Potions) with **filter + sort**, **compare-vs-equipped**
      deltas and drink-from-bag potions; the full loadout (affixes + new slots) **round-trips through
      save/load** (v7, older saves still load) — `test/items.test.js`
- [x] **Skill & leveling system** — gain **XP** (combat / quests / gathering), **level up** for more
      health + **focus** (a regenerating spell resource) and auto-learned skills; a **`SKILL_DB`** of
      active skills (volley / nova / buff / heal, with frost slow & shadow lifesteal) cast from a
      **3-slot quick bar** (hotkeys `1`/`2`/`3`, potions moved to `4`/`5`/`6`); **3-skill fusion** —
      a **pure, deterministic** blend of up to three owned skills into a new one, paid for with
      **coins + crystals**; and **boss-only skills** that drop solely from bosses (seeded); all of it
      (level/xp/focus/owned/fused/slots) **round-trips through save/load** (v8, older saves still
      load) — `test/skills.test.js`
- [ ] Puzzles (levers, plates, gated doors)
