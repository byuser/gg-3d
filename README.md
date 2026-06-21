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

## The story

Meadowgate is besieged by living sweets. An old castle once warded the vale — help the
villagers raise it again. Collect **coins** to fund construction and roam the **map** to find
the five castle **relics** (Foundation Stone, Rampart Runes, Tower Crystal, Golden Gate Key and
the Dragon Sigil), won from **NPC quests** and far-flung **landmarks**. Build all five parts of
the castle and the **dragon** appears for the final battle. Defeat it and you **win**.

▶️ **Play:** once GitHub Pages is enabled, the game is live at
`https://<owner>.github.io/gg-3d/`

![status](https://img.shields.io/badge/build-static%20site-blue) ![engine](https://img.shields.io/badge/engine-Babylon.js-orange)

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / Arrow keys | on-screen stick (bottom-left) |
| Look | drag mouse | drag the screen |
| Zoom | mouse wheel | two-finger pinch |
| Attack (weapon) | `Space` or `F` (hold) | ✨ button (bottom-right) |
| Use potion (belt 1/2/3) | `1` `2` `3` | tap a potion slot (bottom-left) |
| Inventory / equipment | `I` (or `B`) | 🎒 button |
| Crafting bench | `C` | 🛠️ button (top-right) |
| Quest log | `J` (or `L`) | 📜 button (top-right) |
| Talk / collect / gather / shop / build (`E`) | `E` | action button (bottom-right) |
| Travel to another land | walk into a path / bridge / cave portal | same |
| Music on/off | `M` | 🔊 button (top-right) |
| Pause / menu | `Esc` | ☰ button (top-right) |

## How to play — the adventure

- **Quests & NPCs:** five **story NPCs** stand at the island's landmarks (the village, the
  grove, the shore, the mountain pass and the ruins), each marked with a floating **❗ / ✓**.
  Walk up + press **E** to **talk**: accept a quest, check progress, or turn a finished one in.
  Quest objectives are **hunt** (defeat sweets), **gather** (collect a material), **reach** a
  place, or **talk** to someone; rewards mix **coins**, **gear** and the all-important castle
  **relics**. Track everything in the **quest log** (`J` / 📜). The HUD shows a live tracker for
  your current quest.
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
- **Health:** the sweets bite on contact. When your health hits zero it's **game over** —
  your final score and the wave you reached are shown.
- **Camera:** the view follows Lily at a fixed distance; zoom only with the mouse
  wheel (or a two-finger pinch on mobile).
- **Pause menu:** press **Esc** or the **☰** button to pause the game at any time. The
  menu lets you **Resume**, **Save Progress**, **Restart**, or **Exit to Menu** — the
  last two ask for confirmation so a stray tap can't wipe your run.
- **Save & load:** **Save Progress** downloads a small `.json` save file to your device
  capturing *everything* needed to resume — the procedural environment (via its world
  seed), your score, money, perks/upgrades, weapon, health, every live sweet and boss,
  the dropped coins and artifacts, and the wave clock. Back on the **start screen**,
  **Load Progress** reads a save file from your device and drops you right back where you
  left off — even on a different device or browser.

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
index.html              # markup, overlays, HUD, CDN script tags
css/style.css           # HUD, overlays, touch controls, responsive styling
js/game.js              # engine, systems, gameplay
test/harness.js         # headless Node harness that exercises the gameplay logic
.github/workflows/      # GitHub Pages deploy on push
.nojekyll               # serve files as-is (skip Jekyll processing)
```

### Tests

`test/harness.js` stubs Babylon + the DOM (with faithful vector math) so the real
gameplay code can run in Node — verifying collision, the river barrier, the
**boss archetypes** (caster bolts, summoned minions, scaling, rare drops), the
**gear economy** (buy / equip / dual-wield / sell), **projectile physics** (gravity arc
+ finite life), the seeded RNG, the **save/load round-trip** and the **pause menu** — plus
the **adventure systems**: **monster abilities** + **knockback** + **bomber** explosions,
**gathering & crafting**, the **quest** flow (accept / progress / turn-in / rewards), the
**day/night + weather** systems, **impact bursts**, the **castle → dragon → victory** path,
and the new **RPG zones** suite: per-zone **location spawns**, monster **roaming**, timed
**respawns**, **lair boss** spawn/clear/persist, and the streamed **zone travel** (teardown
+ rebuild + player placement) — all without a browser:

```bash
node test/harness.js
```

### Architecture

`js/game.js` is organised as small systems so features are additive, not a rewrite:

- **`Interactable` / `InteractionSystem`** — a reusable "walk up + press E" contract;
  artifacts and the **merchant NPC** use it (puzzle levers will too).
- **`Input`** — unifies keyboard, the on-screen joystick, and the cast button.
- **`Player`** — Lily, built from primitives with a procedural walk cycle, a swappable
  held weapon (wand / bow / blade), melee + ranged attacks, health, and a derived stat
  block computed from her gear.
- **`ITEM_DB` / equipment / `recomputeStats`** — the item catalogue (weapons, armour,
  accessories; normal + rare), the slot model (helmet/breastplate/boots/necklace/2 rings/
  2 hands), and the function that recomputes the player's stats from what's equipped.
- **`Inventory` / `Shop`** — the bag-and-paper-doll inventory UI (equip/unequip, live
  stats) and the merchant's **Buy/Sell** shop (normal stock only; rare gear is boss-only).
- **`Projectile` / `Hazard`** — gravity-bound, life-capped ballistic projectiles. The
  player's bolts/arrows (`Projectile`) and the bosses' hostile candy bolts (`Hazard`)
  both arc under gravity and die on ground/timeout, so nothing flies forever.
- **`Monster`** — a "living sweet" with chase AI, a hoppy bob, and a pop-on-death effect.
- **`Boss`** — four **archetypes** (charger / caster / summoner / stomper) sharing the
  Monster interface; each has its own attack pattern, scales every cycle, rolls in
  randomly every 5 waves, and drops a guaranteed **rare item** (`ItemDrop`) + coins.
- **`Coin` / `ItemDrop` / `Merchant`** — coins and rare loot dropped in the world, plus
  the plaza merchant who runs the shop between waves.
- **`Music`** — a tiny Web Audio synth that plays a looping procedural soundtrack (no
  audio assets), mutable from the HUD.
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
- **`Quests` / `QuestGiver` / `Dialogue`** — the story spine: NPCs (`NPC_DATA`) offer quest
  chains (`hunt` / `gather` / `reach` / `talk`) whose rewards (coins / gear / **relics**) are
  paid out on turn-in; the `Dialogue` overlay drives accept/progress/turn-in.
- **`ResourceNode` / materials / `CRAFT_RECIPES` / `Crafting`** — harvestable world nodes feed a
  materials pouch (`player.materials`); the crafting bench spends them on potions + gear.
- **`CastleSite` / `CastleUI` / `Dragon`** — the five-part castle build (relic + coins per part)
  that grows in the world and summons the **dragon** final boss; felling it calls `winGame`.
- **Monster abilities (`MONSTER_ABILITIES`)** — every sweet rolls a behaviour (chaser / runner /
  brute / jumper / shooter / bomber); shooters fire `Hazard`s, bombers explode on death.
- **`DayNight` / `Weather`** — a keyframed sun/sky/fog cycle and a weather state machine (with a
  rain particle system) that layer over the scene.
- **`Burst` / `spawnImpact`** — pooled, self-disposing impact effects + monster **knockback** so
  hits land with weight (feature-detected so it stays headless-safe).

The bottom of `game.js` documents the remaining seam for **PuzzleSystem**.

## Run locally

It's a static site — any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

Pushing to the deploy branch triggers `.github/workflows/deploy-pages.yml`, which uploads the
repo as a Pages artifact and publishes it. Enable Pages once in
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

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
- [x] Gear system: armour (helmet/breastplate/boots), accessories (2 rings + necklace)
- [x] Inventory + equipment (two hands; dual-wield or a two-handed weapon) with live stats
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
- [x] **Quest-giving NPCs** with dialogue, story chains, and coin / gear / relic rewards
- [x] **Crafting + gathering**: chop trees, mine rock/crystal, gather herbs/fibers, collect water → craft potions & gear
- [x] **Monster abilities** (chaser / runner / brute / jumper / shooter / bomber) that vary by land
- [x] **Dragon** final boss (hover / dive / fire-breath) + a Victory screen
- [x] **Day/night cycle** + **weather** (clear / cloudy / fog / rain / storm) driving sky, sun, fog and rain
- [x] **Bigger world**: an island with a sky dome, surrounding sea, distant mountains and named landmarks
- [x] **Impact feedback**: knockback + shard bursts on hits, ground/scenery splats, bomber shockwaves
- [x] Prettier character animation (swinging ponytails + feet, a forward lean and hip sway)
- [x] Save/load extended to the full adventure state (materials, relics, quests, castle, time, weather)
- [ ] Puzzles (levers, plates, gated doors)
