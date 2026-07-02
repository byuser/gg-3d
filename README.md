# Good Game 3D

A third-person browser **action-RPG adventure**. Run as **Lily** across an island split into
several **explorable lands** — the Meadowgate **vale**, the **Whisperwood**, the **Saltmarsh
shore**, the **Frostpeak trail** and two hidden **boss lairs** (the Crystal **Caverns** and the
Bramblewood **Thicket**). Each land has its **own monsters** that **roam** their patch and
**respawn** over time; **travel** between lands by **walking a road to the map edge** (to its
gateway), and the world **streams in and out** so it never freezes. Take **quests**,
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
| Attack (weapon) | `Space` or `F` (hold) | ✨ button (one-thumb arc, bottom-right) |
| Cast a skill (quick bar 1/2/3) | `1` `2` `3` | tap a quick-bar slot (the one-thumb arc in landscape) |
| Use potion (belt 4/5/6) | `4` `5` `6` | tap a potion slot (bottom-left) |
| Skills &amp; fusion (drag to slot) | `K` | ✨ button (top-right) |
| Inventory / equipment | `I` (or `B`) | 🎒 button (top-right) |
| Crafting bench | `C` | 🛠️ button (top-right) |
| Quest log | `J` (or `L`) | 📜 button (top-right) |
| World map / search / guide | `Tab` | tap the minimap (top-right) |
| Toggle the minimap | `N` | tap the minimap to open the full map |
| Talk / collect / gather / shop / build (`E`) | `E` | E button (one-thumb arc, bottom-right) |
| Travel to another land | walk a road off the map edge (to its gateway) | same |
| Music on/off | `M` | mute in pause → Audio settings |
| Pause / menu | `Esc` | ☰ button (top-right) |
| Enter / exit fullscreen | **⛶** button (top-right) · **pause → settings → Display** | same |
| Customize control layout | start screen / pause → settings → **Controls** | drag the joystick / skills / potions / E / fire anywhere |
| Language (EN / RU) | start screen · pause settings | same |
| Audio volumes / mute | start screen · pause settings | same |

### Customizable on-screen controls (Task 36)

Different hands, grips and phone shapes want the touch controls in different
places, so the **on-screen layout is fully customizable**. Open **Edit control
layout** from the start-screen **Controls** panel or **pause → settings →
Controls**: the HUD dims and a draggable handle appears over each movable
control — the **movement joystick**, the **3 skill quick-slots**, the **3 potion
slots**, the **interact "E" button** and the **fire/cast button**. Drag any of
them to a comfy spot and **Save**, or **Reset to default**. Positions are stored
as **resolution-independent viewport fractions** and **clamped to the safe area**
(never off-screen or under a notch; tap targets stay ≥ ~48 px), so they survive
rotation and different screens. The layout is a **per-device setting** (saved to
`localStorage`, applied on the start screen before any save loads) **and** rides
along **in your save** so it travels to other devices / the cloud — your device's
own arrangement always wins, and older saves load with the defaults.

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
- **Russian plurals** use the standard one/few/many rule (`plural()` / its count-string alias
  `agree()`); the locale persists in `localStorage` and is applied **before first paint** and
  **live** on switch (no reload needed), also updating `<html lang>`.

### Russian grammatical morphology (declensions + agreement)

Russian is heavily inflected, so a noun dropped into a sentence must take the **case** its
verb/preposition governs, and the verbs/adjectives around it must **agree** in gender/number —
"Reach {name}", "Defeat {boss} in {zone}", "{part} raised" all read broken if the noun is left
in the nominative. The i18n core carries an **Android-/ICU-style morphology layer** (pure,
headless-safe, English collapses to identity):

- **A declension model** (`RU_NOUNS`) gives every interpolated Russian noun (zone, landmark,
  NPC, material, relic, castle part, boss/dragon) its **gender** (m/f/n/pl), animacy and explicit
  **case forms** (nominative / genitive / dative / accusative / instrumental / prepositional). A
  rule-based decliner (`declineRegular`) covers regular nouns (incl. the animate-accusative rule
  and the `-ень` fugitive vowel) and fills any case an override omits.
- **Case-aware interpolation:** a template requests a case with a `{name:gen}`-style tag and the
  call site passes a `nounRef(group, id, displayName)`; `interp()` declines it in Russian and
  substitutes the plain English name (ignoring the tag) in English, so the two locales share one
  template. Plain `{x}` interpolation is unchanged.
- **Gender/number agreement** via an ICU-style `select(gender, forms)` — e.g. `{part} raised` →
  возведён / возведена / возведено / возведены — and the strengthened Slavic `plural()`/`agree()`
  now backs **every** count string (2 камня / 5 камней), not just the castle counter.
- A **completeness test** (mirroring the untranslated-key gate) fails the build if any interpolated
  RU noun ships without its gender + case metadata.

Everything is feature-detected (`localStorage`, `querySelectorAll`), so the headless harness
runs in English without a browser.

## How to play — the adventure

- **The main story (missions & chapters):** the campaign is a **guided main line** — five
  ordered **chapters** of **missions** that march you to the castle→dragon finale. The HUD
  **objective tracker** (top-left) always shows the **current step**: which **❗ NPC** to see to
  accept it, the live **objective** while you're on it, and a **✓ return to turn in** when it's
  done — so a new player can follow the whole story with **no guesswork**. An **intro** sets the
  scene on a fresh game and an **ending** plays on victory.
- **Quests & NPCs:** five **story NPCs** stand at landmarks **in their own lands** — the Mayor in
  the home vale, and the herbalist, fisher, smith and hermit out in the **Whisperwood**, the
  **Saltmarsh shore**, the **Frostpeak trail** and the **sunken ruins (the Crystal Caverns)** they
  call home — each marked with a floating **❗ / ✓**. Walk up + press **E** to **talk** wherever
  they live: accept a mission or side quest, check progress, or turn a finished one in. Objectives
  are **hunt** (defeat sweets), **gather** (collect a material), **reach** a place,
  **talk** to someone, **defeat a lair boss**, **build** a castle part, or — for the finale —
  **slay the dragon**; rewards mix **coins**, **gear** and the castle **relics**.
- **Side quests:** optional **bounties and errands** from the same NPCs, clearly **separated from
  the main line** in the quest log. Some are **repeatable** (steady-coin bounties), others
  one-shot — take them in any order; they never block the story. Track everything in the
  **chaptered quest log** (`J` / 📜), which groups the **Main Story** (by chapter) apart from your
  **Side Quests**.
- **Gathering & crafting:** the world is dotted with **resource nodes** — chop **trees** for
  wood, mine **rock** and **crystal**, gather **herbs**, cut **fibers** and collect **water** at
  the shore (walk up + **E**; a harvested node respawns after a cooldown). Each land's nodes are
  a **stable, persistent set** — leaving and returning shows the **same** nodes, not a fresh pile,
  and **new growth appears slowly over time** (capped per type so a land never floods). Open the
  **crafting bench**
  (`C` / 🛠️) to turn materials into **potions** and **gear**, both into your bag. Materials are
  **stackable bag items** now (no on-HUD pouch) — see them in the inventory's **Materials** tab.
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
- **Distinct per-weapon attacks:** every weapon class has its own from-scratch move with clear
  **wind-up → strike → recovery**, real weight and body involvement (torso rotation, weight shift,
  foot plant) — a **sword** cuts swept diagonal slashes that chain into a **3-hit combo** with a
  blade **trail**, an **axe** heaves a weighty overhead chop, a **dagger** jabs quick stabs, a
  **bow** nocks → draws → releases → recoils, a **wand** points and releases, and a **staff**
  raises → channels (its orb glowing) → releases; she gives a deliberate **chop/reach** when
  harvesting and **flinches** when struck. Damage lands (and projectiles launch) on the **strike
  frame** in the weapon's real arc/reach, so hits line up with the animation. The motion runs
  through a small, frame-rate-independent per-class **state machine** that freezes cleanly with
  the pause menu. Each land also **breathes**: drifting ambient particles tuned per
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
  Thicket**). Each land has **roads running to its edge**, ending in a gateway — a **trail-head
  arch**, a **plank jetty** or a **cave mouth** — and **walking a road off the map** carries you
  to the next land (no magic circles to step into; the trigger spans the road so you can't slip
  past it). Travel is hidden behind a quick **fade** (with the destination's name) so the world
  loads without freezing, on desktop or mobile, and you **arrive on the road back** the way you
  came. Your current land is shown on the HUD **📍 location chip**.
- **Roaming monsters & respawns:** every land has its **own monster types** that **spawn at
  fixed points** and **wander** their patch until you get close, then give chase. Fell them
  and the land **respawns** fresh ones after a short delay, up to a per-land cap — so there
  are always foes to hunt, but you're never swarmed by an endless timer. Deeper lands hold
  **tougher, faster** monsters with more dangerous abilities.
- **The home hub:** the **Meadowgate Vale** is where the **merchant**, the **blacksmith**, the
  **apothecary** and the **castle build site** live — they're always there to visit between
  expeditions. The wild lands are **hunting grounds** (plus a few themed resource nodes) **and each
  is home to its own quest-giver** — the herbalist in the Whisperwood, the fisher on the shore, the
  smith at Frostpeak, the hermit in the sunken Crystal Caverns — so you can accept and turn in their
  missions out where they live, then return to the vale to spend and build.
- **Potions & quick-slots:** buy **health potions** (minor / standard / **greater**) and
  **elixirs** (Might, Swiftness) from the **apothecary**, or craft them. Potions live in your
  **bag** (stacked) like everything else; the 3 combat **quick-slots** in the bottom corner
  are an **assignment** over them. Open the inventory's **Potions** tab and **drag** any bag
  potion onto a slot to make it quick-drinkable (drag between slots to reorder/swap, or off to
  clear — there's a tap-to-pick fallback too). Quaff a slot with `4`/`5`/`6` or a tap: health
  potions heal instantly; elixirs grant a **timed buff** shown as a countdown pill.
- **The blacksmith:** a burly **🔨 smith** sets up at the plaza between waves beside the
  merchant. Walk up + press **E** to open the **anvil** and spend coins to **enhance**
  your weapons and equipment (`+1`, `+2`, …). Rarer gear (**common → rare → epic →
  legendary**) forges to a higher level and gains more per level, so prize loot is worth
  investing in. Enhancement boosts the item's stats / weapon damage and its resale value.
- **Artifacts:** grabbing a glowing artifact grants a chunk of **XP** (toward your next
  level), **heals** you a little and pays a small **coin** reward — handy mid-fight.
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
  **Buy** normal weapons, armour and accessories; **✨ Rare** — a **rotating selection of
  rare/epic/legendary wares** (a premium, but no need to wait for a boss); or **Sell** any
  item from your bag (enhanced gear sells for more; potions + materials sell too). Bosses
  still **drop** guaranteed rare loot too.
- **The apothecary:** a dedicated **⚗️ apothecary** tends a bubbling cauldron in the hub.
  Walk up + **E** to buy **potions** and **basic ingredients** (the wizard no longer stocks
  consumables — vendors are specialised now), or **sell** your spare potions, materials and
  gear back for coins.
- **Solid world:** trees, rocks, bushes, toadstools, crystals, cave pillars, lampposts and
  the vale's river are **solid** — you bump and slide around them instead of walking through.
  A winding **river** with **wooden bridges** crosses the home vale.
- **Living sweets:** a dozen kinds — lollipops, gummy bears, cupcakes, donuts, candy
  canes, ice-cream cones, macarons, candy corn, chocolate bars, jelly beans,
  marshmallows and pretzels — each land drawing from its own palette.
- **Experience (XP):** there's **no arcade score** — every reward moment feeds your **RPG
  progression** instead. Defeating a sweet, a boss or the dragon, turning in a quest,
  gathering a node and **collecting an artifact** all grant **XP**; fill the bar to **level
  up** (more max health + focus, and auto-learned skills). Artifacts give **+40 XP** (roughly
  four sweet kills), sweets `6 + 2·level`, a boss `60 + 25·cycle`, the dragon `600`, a quest
  `45`, a gather `3`. **Coins** remain a separate currency spent at the merchant. *(Before
  Task 19 the same moments paid a parallel "score": +25 / +50 / +400 / +5000 — now retired.)*
- **Music:** a procedurally-synthesised soundtrack plays as you fight (no audio files —
  it's generated in-browser). Toggle it with `M`, or mute everything from the **Audio**
  sub-panel in the start screen / pause settings.
- **Sound & ambience:** a fuller procedural soundscape (still no audio files). Richer
  **sound effects** — per-surface **footsteps** (grass / stone / sand / snow), gather/mine
  cues, quest accept/turn-in chimes, a portal **whoosh** on travel, UI clicks and a
  **low-health** warning. Every land also has its own **ambient bed** — meadow birds &
  breeze, forest wind & creaks, shore waves & gulls, frostpeak wind howl, cavern drips &
  drone, thicket insects — that **crossfades** as you travel between zones. A small **mixer**
  (Master · Music · Effects · Ambience volume sliders + a **Mute all** toggle) lives on the
  **start screen** and in the **pause settings**, and your choice **persists** across reload.
- **Health:** the sweets bite on contact. When your health hits zero it's **game over** —
  a run recap shows the **level** you reached, your **total XP** and your tallies (monsters
  felled, relics collected). The **victory** screen shows the same recap.
- **Camera:** the view follows Lily at a fixed distance; zoom only with the mouse
  wheel (or a two-finger pinch on mobile).
- **Pause menu:** press **Esc** or the **☰** button to pause the game at any time. The
  menu lets you **Resume**, open **Manage Saves**, **Restart**, or **Exit to Menu** — the
  last two ask for confirmation so a stray tap can't wipe your run.
- **Save slots & management:** the **Manage Saves** screen (reachable from the **start screen**
  *and* the **pause menu**) gives you **six named save slots** on this device, like a shipped RPG.
  Each slot stores *everything* needed to resume — the procedural environment (via its world seed),
  the **land you're in**, your **XP & level**, money, the **unified bag** (gear, potions &
  materials) + **equipped gear** + **potion quick-slots**, health, castle **relics**,
  **story progress** (current chapter, completed missions, reach/talk objectives, side-quest
  tallies), the **castle build state**, cleared **lair bosses**, the **time/weather**, and your
  **playtime** — plus a label (name, when it was saved, your level/zone). You can **Load**,
  **Rename** (inline), **Delete** (with a confirm) or **Overwrite** any slot, and **New save**
  writes to the next free one. The same screen lists your **cloud** saves (below) and keeps
  **Export/Import to a file** as an extra option, so a save still travels to another device or
  browser. (Your previous single in-progress run migrates into a slot automatically — nothing is
  lost.)
- **Auto-resume (durable session):** your in-progress run is **continuously auto-saved to this
  device** (debounced on key beats — travel, level-up, quest turn-in, purchase — and on tab-hide),
  so **reloading the page** — or switching desktop⇄mobile layout, re-orienting, or changing graphics
  quality — drops you straight back into the run. On the start screen a **Continue** button appears
  when a saved run exists (Start always begins a fresh one). If you opted into Google Drive, the
  sign-in **persists across reloads**: each load **silently re-acquires** a fresh access token from
  your existing Google session (the short-lived token itself is never stored), so the panel shows
  **Signed in to Drive** with no click. The silent re-auth uses Google's strictly non-interactive
  token path (`prompt: "none"`), so **no Google dialog ever appears on load** — a popup or account
  chooser only ever shows when you **click "Sign in with Google"** yourself. A signed-out or
  first-run load makes no attempt at all; if the silent refresh can't succeed (expired/revoked/
  offline) it falls back quietly to that explicit button. A small **first-party cookie**
  (`SameSite=Lax`, `Secure` on HTTPS, 180-day `Max-Age`) holds only a session id, your locale/quality,
  the cloud-autosave flag and a **non-sensitive** "opted-in" sign-in hint — **never a token or
  secret**, no third-party/tracking cookies; the run snapshot itself lives in `localStorage`.
  Everything is feature-detected (cookies fall back to `localStorage` for private mode / blocked
  cookies / headless), so it always degrades gracefully. **Clear saved session & sign out** (in the
  Cloud Saves panel on the start screen and pause settings) wipes the local session, the cookie and
  the Google sign-in, so no silent re-auth fires afterward.
- **Cloud saves (optional):** if the game has been configured with a Google OAuth client id (see
  [Cloud saves](#cloud-saves-optional-google-drive) below), you can **Sign in with Google** from the
  start screen, pause settings, or the **Manage Saves** screen and back your progress up to your
  **own private Google Drive** — a manual **Save to Drive**, an **autosave every 5 minutes** that
  keeps a **rolling one-hour history**, and a **browse-and-restore** list (you can also **delete** a
  cloud save). Opening **Cloud saves…** while signed out now shows a clear state with a **sign-in
  button** (it's no longer a dead click). It's fully opt-in: signed out (or if it isn't configured)
  the local slots above are all you need, and nothing changes.

## Cloud saves (optional, Google Drive)

Cloud saves are an **opt-in** extra that lets a player back their progress up to **their own**
Google Drive — never a server we run. Saves are written to Drive's private **`appDataFolder`** (the
`drive.appdata` scope only), a hidden per-app folder that's invisible to other apps and adds no Drive
clutter. The game stores one **manual** slot plus an **autosave every 5 minutes**, keeping a rolling
**one-hour history** (up to ~12 timestamped autosaves, oldest pruned automatically, the newest always
kept). Cloud saves use the **exact same JSON** as the local file save, so versioning and migration
behave identically.

**Staying signed in & privacy.** Google's browser OAuth flow issues only **short-lived access tokens
(~1 h)** and no refresh token, so the game **never stores a token**. Instead it remembers a single
**non-sensitive "opted-in" hint** (in a first-party cookie + a `localStorage` mirror) and, on each
load, **silently re-acquires** a token from your existing Google session — keeping you signed in
without a click. That boot re-auth is **strictly non-interactive** (`prompt: "none"`): Google shows
**no popup or account chooser**; if it can't grant a token silently (you signed out, the consent was
revoked, or you're offline) it fails quietly and leaves **Sign in with Google** as the only path to a
dialog. **No Google UI ever appears just from loading the page.** Signing out clears the hint so no
re-auth fires afterward.

The feature ships **disabled** and only turns on when you supply a Google OAuth **client id**.

### 1. Create the Google OAuth 2.0 Client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a **project**
   from the project dropdown at the top.
2. **Enable the Drive API:** go to **APIs & Services → Library**, search for **Google Drive API**, and
   click **Enable**.
3. **Configure the OAuth consent screen** (**APIs & Services → OAuth consent screen**):
   - User type **External** (so any Google account can use it), then **Create**.
   - Fill in the app name, your support email and developer email.
   - On **Scopes**, click **Add or remove scopes**, and add **`.../auth/drive.appdata`**
     (“See, create, and delete its own configuration data in your Google Drive”). Save.
   - While the app is in **Testing**, only the Google accounts you list under **Test users** can sign in.
     To let anyone use it, **Publish** the app (for the `drive.appdata` scope this needs no Google review).
4. **Create the credential** (**APIs & Services → Credentials → Create credentials → OAuth client ID**):
   - Application type **Web application**.
   - Under **Authorized JavaScript origins**, add **every origin** the game is served from — no path, no
     trailing slash. For GitHub Pages that's your site origin, e.g. `https://<user>.github.io`
     (Pages project sites share the user origin; the subpath is not part of the origin). Add
     `http://localhost:4173` and `http://localhost:5173` too if you want cloud saves while developing.
   - You can leave **Authorized redirect URIs** empty — this token flow doesn't use one.
   - Click **Create** and copy the **Client ID** (it looks like
     `1234567890-abc123.apps.googleusercontent.com`). This id is **public** (it ships in the browser
     bundle); there is **no client secret** to keep for this browser-only flow.

### 2. Give the id to the deployed site — via a GitHub environment variable (recommended)

So the id is **never hardcoded in the repo**, the deploy workflow reads it from a GitHub Actions
**variable** scoped to the Pages environment and bakes it into the build:

1. In your repo on GitHub, go to **Settings → Environments → `github-pages`** (the environment the Pages
   deploy uses; create it if it isn't there yet).
2. Under **Environment variables**, click **Add variable**:
   - **Name:** `GOOGLE_CLIENT_ID`
   - **Value:** the Client ID you copied above.
   - Save. *(A client id for a public web app isn't secret, so a **Variable** is the natural fit. If you'd
     rather use **Environment secrets**, add a secret with the same name — the workflow checks both.)*
3. **Re-deploy** so the value is picked up: push to `master` (or run the **Deploy to GitHub Pages**
   workflow from the **Actions** tab). The build step injects it as `VITE_GOOGLE_CLIENT_ID`, Vite inlines
   it into the hashed bundle, and the game reads it at runtime.

That's it — open the deployed site, go to **Cloud Saves**, and **Sign in with Google**.

> **How it's wired.** `deploy-pages.yml`'s build step sets
> `VITE_GOOGLE_CLIENT_ID: ${{ vars.GOOGLE_CLIENT_ID || secrets.GOOGLE_CLIENT_ID }}`; the game's
> `CloudSave.readClientId()` reads, in priority order, `window.GG_GOOGLE_CLIENT_ID` →
> `import.meta.env.VITE_GOOGLE_CLIENT_ID` (the build-time value) → the `<meta name="gg-google-client-id">`
> tag. Anything empty just means “not configured”.

### Alternatives (local / other hosts)

- **`<meta>` tag:** put the id directly into `index.html`'s `<meta name="gg-google-client-id" content="…">`
  for a manual/static deploy. Fine for the public id, but it commits the id to the repo.
- **Runtime global:** define `window.GG_GOOGLE_CLIENT_ID = "…"` before the bundle loads (e.g. a small,
  git-ignored script) — handy for local development.
- **Local dev build:** create a git-ignored `.env.local` with `VITE_GOOGLE_CLIENT_ID=…`; `npm run dev` /
  `npm run build` will pick it up just like CI does.

With no client id configured, the **Cloud Saves** panel shows a short "needs a client id" note and the
controls stay disabled — the game is otherwise unchanged, and the local save keeps working. Signed out,
offline, or in the headless test harness, the feature is cleanly disabled and **never throws or blocks**.
The Google Identity Services script is loaded **on demand** only after you choose to sign in, so the
published site stays 100% static files.

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
test/util/              # shared pure test helpers (e.g. rectangle geometry)
test/e2e/               # Playwright real-browser boot smoke + responsive/HUD suites
vite.config.js          # build → hashed static bundle in dist/ (Babylon stays CDN)
eslint.config.js .prettierrc.json tsconfig.json   # lint / format / typecheck
ARCHITECTURE.md         # module map + data flow + toolchain (read this first)
CHANGELOG.md            # release history (Keep a Changelog format)
TODO.md                 # agent backlog hub: rules, Definition of Done, task index
todo/                   # one spec file per backlog task (todo/task-<N>-<slug>.md)
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
objective text, and the **locale-persistence round-trip**, plus the **Russian-morphology** suite
(`test/i18n-morphology.test.js`): the **decliner** over all six cases × number, gender/number
**agreement** (`select`), the strengthened **Slavic plural** across the one/few/many boundaries,
the **case-aware interpolation** (noun-refs), a **noun metadata completeness** gate, and a retrofit
**smoke** that key RU sentences render grammatically, the **lighting & shadows**
suite: the **quality-tier** decision (a pure function of device facts), **every zone building +
tearing down its shadow generator** without leaking, the **feature-detected post-FX** setup
(tone mapping / bloom / SSAO) and the **per-zone light mood**, and the new **higher-fidelity
models** suite: the **model-fidelity tiers** (PBR / env / mesh-density gating), the **PBR ⇄
StandardMaterial fallback**, the legacy **diffuse/specular aliases**, the procedural **IBL env
probe**, and **every zone building + tearing down on the PBR + env tier** without throwing, and the
new **animation** suite: the **per-weapon attack state machine** (`AttackAnim`, Task 34 — per-class
windup → strike → recover timers, the **strike/release frame**, **combo chaining** + reset + single
-hit classes, proven **frame-rate independent** and **pause-correct**), the player **flinch**
+ **gather** triggers, the pure **per-zone ambient spec**, **tier-gated** ambient density, and
**every zone building + animating + disposing its ambient FX** (feature-detected, **leak-free**),
plus the dedicated **combat-animation** suite (`test/combat-anim.test.js`): the live combat path
lands melee damage / releases projectiles on the **strike frame**, in **arc + range**, **exactly
once** (no early/late/double hit, correct facing) at 30 fps **and** 120 fps, and animates every
weapon class headlessly without throwing,
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
equip/unequip), the **tabbed inventory** (filter / sort / potion consume), the **v7
save round-trip** of affixes + the new slots **plus migration** from an older (v6) file,
and the **distinct worn gear** selectors — Task 25's helmets, Task 26's chests, Task 27's
pauldrons, Task 28's gloves, Task 29's belts, Task 30's boots, Task 31's cloaks, Task 32's held
weapons and Task 33's jewelry (`helmetArchetype` / `chestArchetype` /
`pauldronArchetype` / `gloveArchetype` / `beltArchetype` / `bootArchetype` / `cloakArchetype` / `weaponArchetype` / `jewelryArchetype` are each pure + total — every def → a valid
archetype + material — every archetype group builds once, the equipped item shows its own shape, and
equip churn never reallocates the meshes; the pauldron suite adds a **shoulder-fit invariant**
proving the shoulder mesh's inner reach is pose-independent and never enters the torso through
idle/walk/attack, the glove suite adds a **grip-fit invariant** proving every glove part stays
compact around the hand and below the weapon shaft so it never engulfs the grip, the belt suite
adds a **below-chest + clears-legs invariant** proving the belt band sits under the chest envelope
and, sampled across the stride, never enters a leg, the boot suite adds an **on-leg /
no-ground-clip invariant** proving every boot part hugs the foot/shin and, sampled across the full
stride swing, never dips below the feet it rides on, and the cloak suite adds a **pure, clamped,
frame-rate-independent billow updater** (`cloakBillowStep`) plus a **behind-the-legs invariant**
proving every drape part, swept across the whole sway range, stays behind the leg envelope and above
the feet so it never scythes through the legs, and the held-weapon suite maps every weapon def to one
of six real classes (inferred from its mechanics), shows exactly the equipped class (a dual-wield adds
the off-hand class; a two-hander shows one centred weapon), keeps a valid muzzle at the active
weapon's tip, and adds a **held-in-hand invariant** proving every weapon part is gripped in the fist
and bounded around the hand, plus a **no-detachment invariant** proving the weapon tip's arm-frame
position never drifts as the attack plays (so it rides the hand without flying off); the jewelry suite
adds a **throat / at-the-hand fit invariant** proving the necklace rides in front of the chest (a
pendant part sits proud, clear of the breastplate) and the ring seats at the hand, a **glove-cover
rule** hiding the rings whenever a glove is worn (so a ring never clips the glove), and its **high-tier
gate** (built only on the desktop tier — every phone skips it); Playwright
`worn-{helmets,chests,pauldrons,gloves,belts,boots,cloaks,weapons,jewelry}.spec.js` + `combat-anim.spec.js`
screenshot the distinct pieces worn (and each weapon **attacking**) on a real
canvas — the pauldrons mid-attack confirming no chest penetration, the gloves wrapped around the wand
grip, the belts seated below the chest hem, the boots striding on the feet, the cloaks draping behind mid-turn,
each of the six weapon classes held in hand, each class at its distinct strike pose (Task 34), and the
necklaces/rings on the model (the jewelry spec also proving graceful omission on the Galaxy S24 phone tier)),
and the **skill & leveling** suite (`test/skills.test.js`) that locks in Task 14: the
**XP curve + focus math** (pure), **level-up** grants (health + focus + auto-learned skills),
**focus regen + cooldown** ticking, the **quick-bar** assign (deduplicated) + **activate**
(volley fires bolts, nova damages + **chills**, buff/heal apply; focus + cooldown gating), the
**deterministic 3-skill fusion** blend (effect priority, blended power/AoE/count, inherited
slow/lifesteal, mixed element) + **cost** + coin/crystal charge, **boss-loot skills** (seeded →
reproducible, boss-only, drying up once all owned), the headless-safe **skills overlay** render +
fusion preview, the skill **i18n** (names/labels + RU completeness), and the **v8 save round-trip**
of level/xp/focus/owned/fused/slots **plus migration** from an older (v7) file,
and the **world-map** suite (`test/worldmap.test.js`) that locks in Task 13: the
**zone graph** derived from the portals + **BFS route-finding** (shortest path,
the next-hop **portal** to take) and its **symmetry**, the **bearing/distance** +
**8-point compass** math and the **camera-relative** arrow, the searchable
**map-target** derivation (every land / landmark / NPC, no duplication) with
**diacritic-folding search**, the deterministic **world-overview layout**, the
runtime **waypoint resolution** (same-zone bearing vs cross-zone next-portal),
**set / clear / arrival** auto-clearing, **fog-of-war** discovery on travel, the
headless-safe **overlay + minimap** (open / search / select / guide / close), and
the **v9 save round-trip** of discovered lands + the active waypoint **plus
migration** from an older (v8) file,
and the **cloud-saves** suite (`test/cloudsave.test.js`) that locks in Task 15:
the pure **autosave scheduler** (5-min cadence, pause-when-hidden, debounce), the
**rolling one-hour retention/pruning** (age + slot cap + keep-newest), the
**newer-of reconcile**, the sortable autosave **file naming**, the **injectable**
Drive client driving the **manual save / autosave / prune / browse / restore**
flows against an in-memory stub, **local↔cloud payload parity** (byte-identical to
a local serialize, round-trips through `applySave`), and the **unconfigured /
headless** path staying cleanly disabled (no throws). It needs **no save-schema
change** (`SAVE_VERSION` stays 9).
The **responsive HUD** suite (`test/hud.test.js`) locks in Task 16: the pure
**drag-to-slot reducer** (pick → drop → assign / move / swap / clear, including
out-of-range guards), the **feature detection** of Pointer Events + the Screen
Orientation lock staying inert/no-op headless, the SkillsUI **tap-to-pick**
fallback driving `Skills.assignSlot` / `clearSlot`, and the slotted quick-bar
state still **round-tripping** through save/load.
The **save-slots** suite (`test/saveslots.test.js`) locks in Task 18: the pure
**slot store** (sanitize / metadata / normalize / list / next-free / put / rename
/ delete, all immutable + total), `fmtPlaytime`, the **playtime metadata**
serialized in the bumped save schema (v10; legacy saves load with `playSec = 0`),
a **per-slot round-trip** through `applySave`, the **migration** of the prior
single-slot (auto-session) snapshot into a named slot, the **cloud-slot delete**
via the injected Drive client, the headless-safe **SavesUI** open/render path, and
the cloud browser opening with a **sign-in CTA** when signed out (no dead click).
The **score→XP** suite (`test/score-to-xp.test.js`) locks in Task 19: every former
score event (sweet / boss / dragon kill + artifact pickup) now grants **XP**, the
retuned level pacing stays sane under those sources (a pure simulated run), a v10
`score`-bearing save still **migrates** (the field is dropped, XP/level/relicsFound
default sanely), the v11 schema round-trips, the end/pause **recap** renders
level + XP + tallies, and a **grep guard** fails on any lingering `score` identifier
in the player-facing source.
The **unified inventory** suite (`test/inventory21.test.js`) locks in Task 21: the
**30-slot** bag, the legacy → unified-bag **migration** (`migrateLegacyBag`: a
pre-v12 `materials` map + `potions` belt fold into bag stacks + quick-slot refs,
v12+ passes through) plus a real pre-v12 save loading, **bag stacking** (add /
count / spend, stack-max, slot cap), the **potion-slot drag reducer**
(assign / move / swap / clear, any order) + `Inventory.applyPotionDrag` + the
tap-to-pick fallback, **drinking** a quick-slot consuming the bag stack + auto-clear,
`Shop.sell` of **potions + materials** at their `ITEM_DB` value (+ the buyer adding
stackables), the **alchemist** stock (potions + basic ingredients) vs. the
merchant's gear-only stock, the **v12 round-trip** of the bag + quick-slots, and a
UI smoke. The **environment** suite (`test/environment22.test.js`) locks in Task 22:
the **deterministic, capped** per-zone plan + its reproducibility, the **stability
invariant** (re-entering a zone N times keeps the count + node set constant within
per-type caps), **time-gated regrowth** (nothing before the cadence, one node after,
deterministic), **harvestable-after-travel** (a depleted node persists its cooldown
and every enabled node stays registered — the phantom-node fix), the **road-edge
trigger** (walking the road's end fires `ZoneManager.travel` to the right zone, both
directions, and can't be skirted off the road), the **v13** per-zone-resource
round-trip + **pre-v13 migration**, and **per-object dispose** on teardown.
The **NPC-zones** suite (`test/npc-zones.test.js`) locks in Task 38: the pure
**landmark → zone** placement (every giver resolves to a real zone; the four wild
givers map to their own lands while the village folk stay in the hub;
`questGiversForZone` returns exactly a zone's residents and each in-zone point
sits inside its fence), and — booting the assembled game — that the hub seeds only
its Mayor, that **travelling into each wild land spawns its resident and registers
the talk interactable** (the player walks up and it becomes the active prompt),
the **regression** that the full **talk → Dialogue → accept → turn-in** flow runs
for a wild-zone NPC (the bug was zero NPCs outside the hub), that a **save-load
into a wild zone** still yields a talkable NPC there, and that **teardown disposes**
the zone's NPCs (no leaks).
The **HUD-regions** suite (`test/hud-regions.test.js`) locks in Task 39: the pure
rectangle-geometry helper the non-overlap tests rely on (`rectsOverlap` /
`pairwiseCollisions` in `test/util/rect.js`) — edge-touching (a reserved-column
seam) is **not** a collision, a >1px intrusion **is**, containment is, hidden /
zero-area boxes never collide, and a clean banded layout reports nothing while the
historic weather-under-the-quest-button case is flagged.
The **control-layout** suite (`test/controllayout.test.js`) locks in Task 36: the
**pure** model with no DOM — `clampLayoutPos` (in-bounds unchanged; clamps past each
edge; centres a control wider than the safe band; garbage → finite in-bounds),
`layoutReducer` (set / move / reset-one / clear, unknown-id + non-finite guards,
never mutates its input), `sanitizeLayout` (drops foreign / out-of-range / non-finite
entries) — plus the **`localStorage` mirror** round-trip (and corrupt-value →
default), the **save/load round-trip** of the layout, the **device-wins** rule, the
**pre-v14 migration** (a save with no `controls` ⇒ the default layout), and the
editor's **headless-safety** (`canEdit()` false + nothing throws without Pointer
Events). On top of that, a
**functional** suite (`test/functional.test.js`) boots the assembled game in
isolation and drives whole flows (start → zone travel → save/reload round-trip),
and **Playwright** suites load the built bundle in real headless Chromium: the
boot smoke (`test/e2e/boot.spec.js`) asserts the canvas boots with **no console
errors** and the core overlays open, the **responsive** suite
(`test/e2e/responsive.spec.js`) runs at desktop **and** the **Galaxy S24 Ultra**
device profile (portrait + landscape) to assert every menu control is reachable
(incl. the cloud panel), the removed widgets are gone, no two key HUD widgets
overlap, and the one-thumb action arc sits bottom-right in landscape, and the
**saves** suite (`test/e2e/saves.spec.js`, same profiles) opens the Saves screen
from the start menu + pause, saves into a named slot, **renames** it, **reloads**,
and **loads** the slot back into play, the **inventory** suite
(`test/e2e/inventory.spec.js`, same profiles) opens the inventory's Potions tab,
**drag-assigns** a bag potion to a combat quick-slot, and asserts the on-HUD
materials strip is gone, and the **HUD-regions** suite
(`test/e2e/hud-regions.spec.js`, same profiles + a ~360px small phone) forces the
HUD's **worst case** — longest EN/RU labels with the boss bar, compass and quest
tracker all visible at once — and asserts **no two HUD widgets/buttons share
pixels** (the weather/clock never under the quest button), proving the Task 39
region/layer layout holds at every breakpoint, and the **control-layout** suite
(`test/e2e/controllayout.spec.js`, S24 Ultra portrait + landscape) opens the editor
from pause → settings, **drags the joystick**, **Saves**, **reloads** and asserts it
**restored**, then yanks it past the corner and asserts it **can't be dropped
off-screen** (clamped) — with a **desktop** smoke that the editor opens cleanly in
no-drag mode on a non-touch device, and the **fullscreen** suite
(`test/e2e/fullscreen.spec.js`, desktop + S24 Ultra portrait + landscape) asserts the
**pause → settings → Display** fullscreen control is present + reflects the windowed
state, that faking `document.fullscreenElement` + dispatching `fullscreenchange` flips
**both** the menu label **and** the HUD glyph to the exit state (and back) in lockstep,
and that stripping the Fullscreen API hides the whole Display panel + the HUD button
(no dead control). The headless **`test/fullscreen-settings.test.js`** covers the pure
derivation — label from `Fullscreen.active()`, visibility/disabled from
`Fullscreen.supported()`, the menu button wired to `Fullscreen.toggle()`, all no-op
safe with no Fullscreen API.
The **Drive sign-in** suites lock in Task 23 (persistent silent re-auth, no
unprompted dialog). **`test/drivesignin.test.js`** drives the *production*
`makeGoogleDriveClient` against an injected Google Identity Services stub and proves
the prompt choice per path: interactive `signIn()` asks for `prompt: "consent"`,
boot `signInSilent()` asks for `prompt: "none"` and **never** triggers the stub's
visible-UI hook (failing soft when interaction is required, when a popup is blocked
via `error_callback`, or when it hangs — the watchdog aborts), and a 401 refresh
re-auths silently too. **`test/cloudsave.test.js`** adds the controller-level boot
gating: `trySilentSignIn` attempts **only** when opted-in (never first-run /
signed-out), restores via the **silent** client method with **zero** interactive
calls, and an explicit click persists the hint that gates the next boot.
**`test/session.test.js`** proves the opted-in hint **survives a reload** through the
first-party cookie (`SameSite=Lax` / `Secure` / 180-day `Max-Age`) and its
`localStorage` mirror, and that sign-out clears it. A Playwright **`cloudsignin`**
suite loads the built site with a stored hint + an injected GIS client and asserts
the signed-in state restores with **no visible auth dialog** (and a clean load makes
no GIS call):

```bash
npm ci          # once
npm test        # Vitest: ported harness + functional + smoke
npm run test:e2e  # Playwright: real-browser boot smoke (needs a browser)
npm run verify  # lint + typecheck + test + build (the fast CI path)
```

In **CI** the real-browser stage is **sharded across 4 parallel machines**
(`playwright test --shard=i/4`), each running a **single worker**. Every test
boots Babylon on a *software* WebGL canvas, which doesn't parallelize within one
machine without flaking the tests' boot-readiness waits — so the speed-up comes
from running shards **concurrently across machines**, not from many workers per
machine. The Chromium download is cached between runs, and the per-test budget
stays at the proven **240 s** because the heaviest tests boot Babylon several
times (the session-resume and saves round-trip flows boot, save, reload and boot
again). The stage drops from a serial **~30 min** to roughly **10–15 min**
(bounded by the slowest shard). To run a single shard locally:
`npm run test:e2e -- --shard=1/4`.

### Architecture

The runtime in `src/game.js` is organised as small systems so features are
additive, not a rewrite (pure content tables live in `src/data/`, foundations in
`src/core/`; see [`ARCHITECTURE.md`](./ARCHITECTURE.md)):

- **`Interactable` / `InteractionSystem`** — a reusable "walk up + press E" contract;
  artifacts and the **merchant NPC** use it (puzzle levers will too).
- **`Input`** — unifies keyboard, the on-screen joystick, and the cast button.
- **`Player`** — Lily, built from primitives with a procedural walk cycle, a swappable
  held weapon rendered as its real class (wand / bow / staff / sword / axe / dagger),
  worn armour on every slot **plus subtle jewelry** — a chain-and-pendant **necklace** at
  the throat and slim gem-set **rings** on the hands (Task 33, high-tier only), melee +
  ranged attacks, health, and a derived stat block computed from her gear.
- **`ITEM_DB` / `AFFIXES` / `SETS` / equipment / `deriveStats`** — the item catalogue
  (weapons, armour, accessories; **rarity tiers** common → rare → epic → legendary), the
  **12-slot** model (helmet/pauldrons/breastplate/gloves/belt/boots/cloak/necklace/2 rings/
  2 hands), the enchantment + set tables, and the **pure** stat pipeline that recomputes the
  player from what's equipped. See the **item & equipment model** below.
- **`Inventory` / `Shop`** — the **tabbed** bag-and-paper-doll inventory UI (Gear / Materials /
  Potions; equip/unequip, filter/sort, **compare-vs-equipped** deltas, drink potions, live
  stats + set bonuses) over the **unified 30-slot bag** (gear + stackable potions/materials,
  Task 21) with **drag-and-drop potion quick-slots**, and the two specialised vendors'
  **Buy/Sell** shop (`Shop.openShop(vendor)`): the **merchant** sells gear + a rare rotation,
  the **alchemist** sells potions + ingredients; **Sell** buys back any item.
- **`Alchemist`** — the dedicated apothecary vendor (Task 21): a procedural NPC at the hub's
  `apothecary` landmark that opens the alchemist shop; stocks potions + basic ingredients
  (`ALCHEMIST_STOCK`), built/animated/**disposed on teardown** like the merchant + blacksmith.

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
- **Distinct worn helmets (Task 25).** Each **helmet** renders as its own real-looking head piece —
  a soft **leather cap**, an open **iron helm** with a nasal bar + cheek guards, a horned
  **dragon helm**, or a banded great-**crown** with a gem — instead of one rarity-tinted dome. A
  pure, tested selector `helmetArchetype(def)` maps every `helmet` item (via its `helm:{ archetype,
  material }` metadata, or inferred from set/rarity) to one of five archetypes + a material; the
  builder pre-builds all five groups once under the head anchor and `refreshWornGear` reveals the
  one that's equipped (rarity recolour/sheen via `paint()`, set motif on Ironguard/Dragonscale). It
  seats on the crown with no face/ponytail clipping and drops its finer trims on the low tier.
- **Distinct worn chest pieces (Task 26).** Each **breastplate** renders as its own layered torso
  piece — a laced **leather vest**, a segmented **iron cuirass** (banded lames + gorget), an ornate
  **aegis plate** (sculpted pectorals + emblem + gold hem), an overlapping **dragonscale** shell
  with a chest gem, or a flowing cloth **robe** — instead of one rarity-tinted cylinder. A pure,
  tested selector `chestArchetype(def)` maps every `breastplate` item (via its `chest:{ archetype,
  material }` metadata, or inferred from set/rarity) to one of five archetypes + a material,
  coordinated with `helmetArchetype` so a full **Ironguard**/**Dragonscale** suit reads as one; the
  builder pre-builds all five groups once under the torso anchor and `refreshWornGear` reveals the
  equipped one (rarity recolour/sheen via `paint()`, set motif). It seats on the torso clear of the
  neck, arms, belt and pauldrons, and drops its finer straps/lames on the low tier.
- **Distinct worn pauldrons (Task 27).** Each **pauldrons** item renders as its own real shoulder
  piece — a soft leather **cap**, a segmented **iron** cap with lames (Ironguard), an overlapping
  **dragonscale** cap with swept spines (Dragonscale), a trimmed **ornate** plate, or a flared
  **winged** great-pauldron with an upswept fin — instead of the old plain sphere that dived into the
  chest. A pure, tested selector `pauldronArchetype(def)` maps every `pauldrons` item (via its
  `paul:{ archetype, material }` metadata, or inferred from set/rarity) to one of five archetypes + a
  material, sharing the **Ironguard**/**Dragonscale** motif with the matching helmet + chest. The fix
  for the old inward clip is the anchor: each shoulder gets its own pivot **on the torso** (not the
  arm), seated just outside the torso, whose forward/back **pitch** follows the arm through the attack
  while its **roll is ignored** — so, since pitch never changes the piece's x-extent, the shoulder cap
  can never reach into the chest at any pose. Built once per shoulder (no reallocation) and tier-gated
  (omitted entirely on the low tier).
- **Distinct worn gloves & gauntlets (Task 28).** Each **gloves** item renders as its own hand piece —
  a soft leather **glove**, a laced leather **bracer**, a segmented **iron gauntlet** with a knuckle
  plate + finger lames (Ironguard), an overlapping **dragonscale** gauntlet with cuff spines
  (Dragonscale), or an ornate gold-trimmed steel **warplate** with a knuckle boss (epic/legendary) —
  instead of the old plain sphere on each hand. A pure, tested selector `gloveArchetype(def)` maps
  every `gloves` item (via its `glov:{ archetype, material }` metadata, or inferred from set/rarity) to
  one of five archetypes + a material, sharing the **Ironguard**/**Dragonscale** motif with the
  matching helmet + chest + pauldrons. Each glove rides its **arm pivot** (like the hand it replaces),
  so it follows the hand through every attack, and is kept **compact around the wrist** so the wand
  shaft rises cleanly out of the fist — it never engulfs the grip. Built once per hand (no
  reallocation) and tier-gated (finer finger lames/trims dropped on the low tier).
- **Distinct worn belts (Task 29).** Each **belt** item renders as its own real belt — a plain
  leather **strap** with a square buckle, a banded iron **plated** war-belt with a plate buckle +
  riveted studs (Ironguard), an overlapping dragonscale **scaled** belt with a fanged clasp + a
  hanging side tasset (Dragonscale), a leather **pouched** adventurer's belt with a round buckle +
  hanging pouches (rare/non-set), or an ornate gold-trimmed steel **warbelt** with a gem-set boss
  buckle + a front tasset (epic/legendary) — instead of the old plain cylinder that overlapped the
  chest band. A pure, tested selector `beltArchetype(def)` maps every `belt` item (via its
  `belt:{ archetype, material }` metadata, or inferred from set/rarity) to one of five archetypes +
  a material, sharing the **Ironguard**/**Dragonscale** motif with the matching helmet + chest +
  pauldrons + gloves. The belt is seated at the **waist below the chest piece** (so the two never
  z-fight) and parented to the torso (never the legs), so it stays put while the stride swings the
  legs beneath it — pouches/tassets hang over the thighs. Built once under a single waist anchor (no
  reallocation) and tier-gated (**omitted entirely on the low tier**, like the old cylinder — the
  stats still apply, only the mesh is skipped).
- **Distinct worn boots (Task 30).** Each **boots** item renders as its own real pair of boots — a
  soft leather **shoe** with an ankle collar, a tall leather **boot** with a folded-over cuff
  (rare/non-set), a plated iron **greave** + sabaton with a pointed toe and a knee poleyn (Ironguard),
  an overlapping dragonscale **sabaton** with scale plates up the shin + a cuff spine (Dragonscale),
  or an ornate gold-trimmed steel **warboot** with a knee boss + a gold rim (epic/legendary) —
  instead of the old plain calf cylinder that could intersect the leg or punch through the ground. A
  pure, tested selector `bootArchetype(def)` maps every `boots` item (via its
  `boot:{ archetype, material }` metadata, or inferred from set/rarity) to one of five archetypes + a
  material, sharing the **Ironguard**/**Dragonscale** motif with the matching helmet + chest +
  pauldrons + gloves + belt. Each boot is built from **layered primitives** (a shaft up the shin + a
  foot/vamp over the existing shoe + a sole/cuff) and anchored at the **foot** (not the shin midpoint),
  so it rides the leg's bottom and **strides with the feet without clipping the leg or the ground**.
  Built once per leg (no reallocation) and tier-gated (finer trims/scale rows dropped on the low
  tier; the core boot is always drawn).
- **Distinct worn cloaks (Task 31).** Each **cloak** renders as its own real draping cloak — a plain
  tapered **cape** with a neck clasp, a hooded **mantle** with a shawl collar (rare/non-set), an
  overlapping dragonscale **scaled** cloak with a fanged clasp (Dragonscale), an ornate gold-hemmed
  **regal** mantle with tassels (epic), or a feathered **winged** cloak that flares at the shoulders
  (legendary) — instead of the old single flat box on a pivot that swung **through the legs** on sharp
  turns. A pure, tested selector `cloakArchetype(def)` maps every `cloak` item (via its
  `cloak:{ archetype, material }` metadata, or inferred from set/rarity) to one of five archetypes + a
  material, sharing the **Dragonscale** motif with the matching suit. Each cloak is a **tapered,
  segmented cloth drape** (a few vertical fold panels) + a clasp, hung from a back pivot **behind the
  hips**; the billow is a pure, dt-driven, frame-rate-independent updater (`cloakBillowStep`) whose
  pivot is **clamped so the drape only ever trails behind** (never forward), so it reacts to
  movement/turns **without scything through the legs or feet** at any frame. Built once (no
  reallocation) and tier-gated (the per-frame sway + finer folds are dropped on the low tier; the core
  drape is always drawn).
- **Real held weapons (Task 32).** The equipped weapon renders as a real, layered weapon of its actual
  **class** in Lily's hand — a **sword** (blade + crossguard + grip + pommel), an **axe** (haft + bladed
  head + back spike), a **dagger** (short blade + guard + grip), a **bow** (riser + upper/lower limbs +
  taut string), a **staff** (long shaft + a glowing orb in a clawed cage) or a **wand** (shaft + a
  glowing crystal tip) — instead of the old three recoloured stand-ins (one flat blade, one torus bow,
  one crystal). Unlike the armour selectors, a weapon's **class is intrinsic to how it fights**, so the
  pure, tested selector `weaponArchetype(def)` **infers** it from the weapon's own mechanics (ranged +
  projectile shape + hands → bow/staff/wand; melee arc / speed / hands → sword/axe/dagger; an explicit
  `held:{ archetype, material }` block always wins), while the **material** follows rarity (iron → steel
  → gold → dragonscale). The six buyable weapons span all six classes. Each class is pre-built **once**
  under the hand grip (a child of the right arm, so the weapon **tracks the hand through the attack**
  for free — the from-scratch **per-weapon attack motion + blade trail** are Task 34, whose
  `AttackAnim` poses the arm and flashes the trail smear built here); the per-item accent colour tints the metal on equip so two steel
  swords still read apart. A **dual-wielded** off-hand weapon rides a mirror grip on the left arm; a
  **two-handed** weapon shows one centred weapon. The bolt/arrow muzzle is repositioned to the active
  weapon's tip so ranged casts still launch from the business end. Tier-gated (finer trims dropped on
  the low tier; the core weapon is always drawn). **No `SAVE_VERSION` change** (visual only).
- **Visible jewelry (Task 33).** The **necklace** and **rings** — equipped but previously invisible —
  now render a subtle worn piece: a fine collar **chain + pendant** at the throat (a small teardrop
  **pendant**, a round-medallion **amulet**, or a heavier twin-chain **torc**) and a slim gem-set band
  on the hand (a plain **band**, a flat **signet**, or a claw-set **gemband**). The pure, tested
  selector `jewelryArchetype(def)` maps every ring/necklace (via a `jewel:{ archetype, material, gem }`
  block, or inferred from rarity) to an archetype + a metal (silver → gold → dragonscale by rarity) + a
  **gem colour** — the item's own signature (a Ring of Power's ruby) or, with none, its **rarity
  colour** — so a plain silver band and an epic gold gemband read apart. The necklace rides in **front
  of the chest** (its pendant sits proud, clear of any breastplate); `ring1`/`ring2` ride the left/right
  hands and are **hidden whenever a glove covers the hand** so a ring never clips the glove. It is
  **high-tier only** — the tiniest, most additive piece, so **every phone skips it** (a clean omission)
  and pays nothing. Built **once** + toggled/tinted on equip like the rest, so it can't leak. **No
  `SAVE_VERSION` change** (the worn meshes derive from the equipped items).
- **Persistence.** `SAVE_VERSION` 7 stores `{ id, lvl, aff }` per instance across the bag + all 12
  slots; older saves (no affixes / no new slots) load with clean defaults.
- **Value / weight.** Items carry a coin **value** (resale, scaled by enhancement); **weight /
  encumbrance** was considered and deferred (noted as a follow-up — no durability/repair economy).

#### Skill, leveling & fusion model (Task 14)

A second declarative, **data-driven** layer in `src/data/skills.js` — pure level math + a
deterministic fusion blend, so the whole system is unit-testable headless:

- **Leveling & focus.** Defeating foes (`Skills.xpFor`), turning in quests, gathering and — since
  Task 19 — **collecting artifacts** (`XP_PER_ARTIFACT`) all grant **XP** (the legacy arcade score was
  retired so there's one progression currency); `xpToNext(level)` is a smooth super-linear curve.
  Each level grants **+max health** (folded into the
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
  moved one set over to `4` `5` `6`.) Skills are slotted by **drag-and-drop** in the Skills panel
  (Task 16): drag a roster skill onto a slot to assign, between slots to swap, or onto empty space to
  clear — touch + mouse from one Pointer-Events code path, with an accessible tap-to-pick fallback.
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

#### Minimap, world map & guided waypoint (Task 13)

The map layer is split into a **pure** module (`src/data/worldmap.js`) and the
runtime UI (`WorldMap` / `WorldMapUI` in `src/game.js`), so the navigation logic
is fully testable headless:

- **Zone graph + routing.** `ZONE_ADJ` is derived straight from each zone's
  `portals`; `findRoute(from, to)` is a **BFS shortest path** and
  `nextZoneStep(from, to)` is the first hop — the **portal to walk into next** —
  so a cross-land waypoint always points at the right gateway.
- **Geometry.** `bearingRad` / `dist2D` / `compass8` and the camera-relative
  `relativeHeading` drive the on-screen **compass arrow** + distance; the **north-up
  minimap projection** mirrors its X axis through the pure `mapVecToScreen` /
  `mapHeadingScreen` so a **right turn in the world turns the marker right** on the
  map (un-mirrored at the source — Task 20); all pure.
- **Targets + search.** `MAP_TARGETS` derives every **land / landmark / NPC** from
  `ZONES` / `LOCATIONS` / `NPC_DATA` (no duplicated names — the UI resolves names
  through i18n); `searchTargets` matches on diacritic-folded display names.
- **Minimap (`WorldMap`).** A north-up **corner canvas** showing the current land's
  fence, the player + facing, portals (coloured by kind), NPCs (status-coloured),
  resources, monsters, vendors, the castle and the waypoint — an on-map **ring**, or
  a clear **arrow** (`drawMapArrow`, shaft + head) at the rim when the target / next
  portal is off-map — redrawn on a throttle, **feature-detected** (no `2d` context ⇒
  silent no-op). Tap it to open the full map; toggle with `N`.
- **Full map (`WorldMapUI`).** A pannable/zoomable overlay with a **current-land**
  view and a **world overview** of the portal graph (`worldLayout`, discovered vs
  **fog-of-war**), a name **search** with results, and a **"Guide me there"** that
  sets the waypoint. It **fits one screen** (no page scroll) on desktop + the S24
  Ultra — only the results list scrolls — and place names are drawn **outside the
  circular clip** via the pure `layoutMapLabels` (clamped on-screen, de-overlapped,
  haloed) so they're never cut off (Task 20). Opens by **tapping the minimap**.
- **Waypoint.** `resolveWaypoint` returns live guidance (in-zone bearing, or the
  next portal across lands) and **auto-clears on arrival**; the compass (an inline
  **SVG arrow**) shows the next portal to take when the target is in another land.
- **Persistence.** `SAVE_VERSION` **9** stores `discovered` (the lands you've
  visited) + the active `waypoint` (`{ kind, id }`); older saves (no map block)
  default to "only the saved land known", no waypoint.

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
- **Save/load (`serializeGame` / `applySave`)** — snapshots the run to JSON (schema **v12**;
  Task 18 added **playtime**, Task 19 dropped the legacy `score` and added the lifetime
  `relicsFound` tally, Task 21 unified the bag + added **potion quick-slots**) and rebuilds it:
  re-seed, restore the player (pose + the **unified bag** (gear + potion/material stacks) +
  **equipped gear** + **potion quick-slots**, relics, **XP/level**), money, quests, castle,
  cleared lairs and time/weather, then **stream to the saved zone** (its monsters regenerate
  from the spawn table). Stats are recomputed from the restored gear. Older saves still load
  (missing fields default; a pre-v11 `score` is ignored; a pre-v12 `materials` map + `potions`
  belt **migrate** into bag stacks + quick-slot refs via `migrateLegacyBag`).
- **`SaveSlots` / `SavesUI`** — **multiple named manual save slots** (Task 18). `SaveSlots` is a
  **pure** store over `localStorage` (six slots, each holding the full `serializeGame()` payload +
  metadata; create / list / rename / delete / overwrite / next-free, with the prior single-slot run
  migrated in once). `SavesUI` is the thin **Manage Saves** screen (start + pause) that renders it,
  reusing `Pause.askConfirm` for destructive actions and `cloudNewer` so a load never clobbers newer
  work. Loads go through the **same boot reload path** as a file/cloud load. Covered by
  `test/saveslots.test.js`.
- **`CloudSave` / `CloudUI`** — **opt-in** Google Drive cloud saves (Task 15) wrapping the same
  `serializeGame` / `applySave` JSON: a manual **Save to Drive** slot, a 5-minute **autosave** with a
  rolling one-hour history, and a browse-and-restore overlay, all written to the player's private Drive
  **`appDataFolder`**. Pure policy (`cloudAutosaveDue` / `cloudPrune` / `cloudNewer`) plus an
  **injectable** Drive client (`makeGoogleDriveClient`, loading Google Identity Services on demand);
  every browser API is feature-detected so signed-out / offline / unconfigured / headless is cleanly
  disabled and never throws. **Persistent sign-in (Task 23):** the cloud UI is wired (and its boot
  silent re-auth attempted) **before the WebGL scene builds**, so a returning opted-in player is
  re-acquired silently — `trySilentSignIn` runs only behind the stored `optedIn` hint
  (`silentAuthDecision`) and `signInSilent` uses Google's strictly non-interactive `prompt: "none"`
  token path with an `error_callback` + watchdog, so **no dialog ever appears without a click**. The
  autosave-on preference persists in `localStorage`; the opted-in hint persists in the first-party
  cookie (+ `localStorage` mirror) — **no token is ever stored**; no save-schema change.
  See [Cloud saves](#cloud-saves-optional-google-drive).
- **`Pause`** — the in-game pause menu (Resume / Manage Saves / Restart / Exit) that freezes the
  simulation, with a reusable, screen-centred confirmation guard (`askConfirm` takes an optional
  callback, so the save-slot delete/overwrite confirms reuse it) on the destructive actions.
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
      (`ZONES` / `buildWorld(zone)` / `ZoneManager`), connected by **roads that run to the map
      edge** — walk a road off-map (no ground-circle orbs) to stream in/out behind a fade, so it
      never freezes on desktop or mobile (Task 22)
- [x] **Location-based monsters** that **roam** their patch and **respawn** over time
      (`SpawnDirector`) — replacing the timed-wave model
- [x] **Lair bosses** placed in distant lands (Crystal Caverns, Bramblewood Thicket) that
      **stay cleared** for the run; save/load is **zone-aware**
- [x] Third-person character, movement & camera (mobile + desktop)
- [x] Collect artifacts for **XP** (the arcade score was retired — combat, quests, gathering and artifacts all feed one RPG progression)
- [x] Weapons (wand / bow / staff / sword / axe / dagger) with ranged + melee combat
- [x] Gravity-bound projectiles (arcing arrows/bolts) that never fly forever
- [x] Gear system: a **12-slot** loadout — armour (helmet/pauldrons/breastplate/gloves/belt/boots/cloak), accessories (2 rings + necklace), 2 hands — with **affixes** + **set bonuses**
- [x] Inventory + equipment (two hands; dual-wield or a two-handed weapon) with live stats, a **tabbed** bag (Gear/Materials/Potions), filter/sort, compare deltas & **visible worn gear**
- [x] Normal gear bought from the merchant; rare gear dropped by bosses; sell anything back
- [x] 12 "living sweet" enemy types (now per-land roaming residents — _superseded the timed waves_)
- [x] Live monster counter (now "monsters roaming this land")
- [x] Coins dropped by monsters, collected like artifacts, used as shop currency
- [x] Boss fights — six archetypes (charger/caster/summoner/stomper/bomber/splitter) with telegraphs + per-attack sound (now placed in **lairs** + backing the dragon)
- [x] Potions (health potions & timed-buff elixirs) — stackable **bag items** with 3 **drag-assigned** combat quick-slots
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
- [x] **Crafting + gathering**: chop trees, mine rock/crystal, gather herbs/fibers, collect water → craft potions & gear, over a **stable, deterministic, time-gated** resource ecology — a land keeps the **same** nodes across travel, regrows new ones slowly, and caps each type per land (Task 22)
- [x] **Monster abilities** (chaser / runner / brute / jumper / shooter / bomber) that vary by land
- [x] **Dragon** final boss (hover / dive / fire-breath) + a Victory screen
- [x] **Day/night cycle** + **weather** (clear / cloudy / fog / rain / storm) driving sky, sun, fog and rain
- [x] **Bigger world**: an island with a sky dome, surrounding sea, distant mountains and named landmarks
- [x] **Impact feedback**: knockback + shard bursts on hits, ground/scenery splats, bomber shockwaves
- [x] Prettier character animation (swinging ponytails + feet, a forward lean and hip sway)
- [x] **More + higher-quality animation** — a **flinch** on damage, plus per-zone **ambient FX**
      (drifting pollen/spores/mist/snow/motes/embers + wandering butterflies & fireflies) over
      **gustier, per-zone wind** — all tier-gated, feature-detected and disposed on travel; covered
      by a headless animation suite
- [x] **From-scratch per-weapon attack animations (Task 34)** — the generic `Swing` is replaced by a
      per-weapon-class **`AttackAnim`** (windup → strike → recover with torso rotation, weight shift +
      foot plant): sword slashes that chain into a **3-hit combo** with a tier-gated **blade trail**,
      an axe overhead chop, dagger stabs, a bow draw→release→recoil, a wand point→release and a staff
      channel→release; damage lands / projectiles launch on the **strike frame** in the weapon's real
      arc/reach, **frame-rate-independent**, **pause-correct** and headless-safe
- [x] Save/load extended to the full adventure state (materials, relics, quests, castle, time, weather)
- [x] **Russian language support** — full **English + Russian** localization (UI + all data) via a
      `LOCALES`/`t()` i18n layer, switchable on the start screen & in pause settings, applied live
      and persisted (`localStorage`); EN/RU key-parity + data-completeness enforced by tests
- [x] **Russian grammatical morphology** — an Android-/ICU-style declension layer (`RU_NOUNS` +
      `declineRegular`) inflects every interpolated Russian noun into the **case** its sentence
      governs (six cases × number), verbs/adjectives **agree** in gender/number via `select()`, and
      the strengthened **Slavic plural** (`plural`/`agree`) backs every count string; a noun-metadata
      completeness gate mirrors the untranslated-key test. English collapses to identity
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
- [x] **Minimap + full world map, search & a guided waypoint** — a live north-up **corner minimap**
      (player + facing, portals, NPCs, resources, monsters, vendors, the castle and the active
      waypoint), a **full-screen map** with a detailed **current-land** view and a **world overview**
      of the portal graph (discovered vs **fog-of-war**), a name **search** across every land /
      landmark / NPC (i18n-aware, diacritic-folding), and a **guided waypoint** — an on-screen
      **compass** (with the next **portal** to take across lands, via pure BFS route-finding) that
      **clears on arrival**; discovered lands + the active waypoint **round-trip through save/load**
      (v9, older saves still load) — pure helpers in `src/data/worldmap.js`, covered by
      `test/worldmap.test.js`
- [x] **Cloud saves to Google Drive (opt-in)** — sign in with Google to back progress up to your own
      private Drive **`appDataFolder`**: a **manual** "Save to Drive", an **autosave every 5 minutes**
      that keeps a **rolling one-hour history** (≤ 12 timestamped slots, oldest pruned, newest always
      kept), and a **browse-and-restore** list — all reusing the **same JSON** as the local save (no
      schema change). Fully opt-in and graceful: signed out / offline / unconfigured / headless it's
      cleanly disabled and the local save still works. Pure policy + an **injectable** Drive client in
      `src/game.js` (`CloudSave`), covered by `test/cloudsave.test.js`. See
      [Cloud saves](#cloud-saves-optional-google-drive) for setup.
- [x] **Responsive, mobile-first HUD & menu overhaul** — the start screen + pause menu auto-fit at any
      resolution (`100dvh` + safe-area, internal scroll) with settings folded into labelled `<details>`
      sub-panels so **every control is reachable** (incl. the Google-Drive panel) on the **Galaxy S24
      Ultra** in portrait + landscape; a decluttered HUD (no monster counter / on-HUD music / map / round
      bag buttons — the minimap is the one map entry point, mute lives in settings) with non-overlapping
      anchored regions; a **one-thumb** action arc (3 skill slots + E + ✨) in landscape; and
      **drag-and-drop** skill slotting (Pointer Events, touch + mouse) on a pure reducer with an
      accessible tap-to-pick fallback. Fullscreen on touch also locks **landscape**. Covered by
      `test/hud.test.js` + a Playwright responsive suite at the S24 Ultra device profile.
- [x] **Durable session persistence** — your in-progress run auto-saves to this device and a reload (or
      a desktop⇄mobile / orientation / quality switch) resumes it via a **Continue** button; the Google
      sign-in is remembered and silently refreshed. A first-party cookie holds only small identifiers
      (`Session`, `src/game.js`); covered by `test/session.test.js`.
- [x] **Persistent Drive sign-in (true silent re-auth)** — once you've opted into Google Drive, every
      reload **silently re-acquires** a token from your existing Google session and shows **Signed in to
      Drive** with no click, while **no Google dialog ever appears on load**: the boot path runs Google's
      strictly non-interactive token flow (`prompt: "none"`) with an `error_callback` + watchdog timeout
      that swallows anything that would need UI, so a popup/account-chooser only shows when you click
      **Sign in with Google**. Signed-out / first-run loads make no attempt; expired/revoked/offline
      degrade quietly to that button; sign-out clears the hint. The durable bit is a **non-sensitive
      opted-in hint** in the first-party cookie (`SameSite=Lax`/`Secure`/180-day `Max-Age`) with a
      `localStorage` mirror — never a token. `CloudSave`/`makeGoogleDriveClient` in `src/game.js`; covered
      by `test/drivesignin.test.js`, `test/cloudsave.test.js`, `test/session.test.js` + a Playwright
      `cloudsignin` suite (no schema change).
- [x] **Multiple named save slots + full management** — a single **Manage Saves** screen (start screen
      *and* pause) with **six named local slots**: **Load / Rename / Delete / Overwrite / New save**,
      each showing level · zone · playtime · timestamp. Cloud saves are listed + manageable (restore /
      delete) in the same screen, and the start-screen **Cloud saves…** action is no longer a dead click
      (it opens with a clear state + sign-in CTA). File export/import stays as an extra. The prior
      single-slot run **migrates** in; older saves still load. Pure slot store (`SaveSlots`) + a thin
      `SavesUI` in `src/game.js`, covered by `test/saveslots.test.js` + a Playwright saves suite.
- [x] **Unified inventory for potions & ingredients** — materials + potions moved out of their ad-hoc
      side stores into the **30-slot bag** (`invCap` 24 → 30) as stackable items, so one code path
      (`bagAdd`/`bagCount`/`bagSpend`) serves everything and crafting reads/writes the bag; the on-HUD
      materials chip strip is gone. The 3 combat **quick-slots** became a **drag-and-drop assignment**
      over bag potions (reusing the Task 16 pointer-drag utility + pure reducer, with a tap fallback);
      potions **and** materials are **sellable**; and a dedicated **alchemist** vendor sells potions +
      basic ingredients (removed from the merchant, so vendors are specialised), EN/RU localised. The
      unified bag + quick-slots **round-trip through save/load** (**v12**), and a pure `migrateLegacyBag`
      folds pre-v12 `materials`+`potions` belt saves in — `test/inventory21.test.js` + a Playwright
      inventory suite.
- [x] **Map subsystem fixes** — the **full map fits one screen** (no page scroll; only the NPC/results
      list scrolls) on desktop + the **S24 Ultra** in both orientations; the minimap heading is
      **un-mirrored at the source** (turning right turns the marker right, via the pure
      `mapVecToScreen`/`mapHeadingScreen`); a reusable **arrow** primitive (`drawMapArrow`) marks the
      minimap rim + an inline **SVG compass arrow** unambiguously point at the target / next portal;
      and **place names are no longer clipped** by the map circle — drawn after the clip via a pure,
      clamped, de-overlapped `layoutMapLabels` with a haloed plate. No save-schema change — pure
      helpers in `src/data/worldmap.js`, covered by `test/worldmap.test.js` + a Playwright map suite.
- [x] **Quest-givers live in their home lands** — each non-hub story NPC (herbalist · fisher ·
      smith · hermit) now **spawns + is talkable in its own zone** (Whisperwood · Saltmarsh ·
      Frostpeak · the sunken Crystal Caverns), not only the hub. Root cause: NPC spawning was gated
      behind `if (zone.home)`, and only the meadow is `home`. Fixed with a data-driven **landmark →
      zone** field on `LOCATIONS` so `setupZoneContent` spawns exactly each zone's residents on
      entering **any** land (re-registered fresh after every travel + on save-load into a wild land);
      the hub keeps its merchant/blacksmith/alchemist/castle. The world-map / minimap / guided
      waypoint now route to where the NPCs actually stand. No save-schema change (the world rebuilds
      from data) — `test/npc-zones.test.js`.
- [x] **Collision-free HUD regions** — the HUD is now a disciplined **region/layer system** so no two
      widgets or buttons ever share pixels at any resolution/orientation. The six top-right icon
      buttons became **one flex control ROW** whose width (`--controls-w`) the top-status chip row
      **reserves** on its right edge, so the **weather/clock chips can never flow under the quest (or
      any) button** — the historic bug. On phones the HUD lays out in explicit, non-overlapping
      **vertical bands** (control row · status chips + corner minimap · centred health/focus/boss ·
      left relics + tracker), sized from named CSS variables, so the boss bar, compass and quest
      tracker hold even when all visible at once on the **S24 Ultra** (portrait + landscape) and a
      ~360px phone — in either locale's longest labels. The Task 16 declutter, one-thumb action arc,
      safe-area insets and minimap-tap map entry are intact. Layout only (no `SAVE_VERSION` change);
      pure rectangle geometry in `test/util/rect.js` + `test/hud-regions.test.js` and a Playwright
      `hud-regions` suite of pairwise bounding-box non-overlap assertions.
- [x] **Customizable on-screen control layout** — an **Edit control layout** mode (start-screen
      **Controls** panel + **pause → settings → Controls**) that dims the HUD, floats a draggable
      handle over each movable control (the **joystick**, the **3 skill slots**, the **3 potion
      slots**, the **interact E** button and the **fire/cast** button) and offers **Save / Reset /
      Cancel**, reusing the Task-16 pointer-drag (ghost + 6px threshold — still one drag stack). Each
      position is a **viewport fraction**, **clamped to the safe area** (`env(safe-area-inset-*)` +
      the control's size) on apply *and* load so it can never land off-screen / under a notch (tap
      targets ≥ ~48 px), applied live on drop + on boot/zone-load/resize. The layout persists in the
      **save** (`SAVE_VERSION` **14**; older saves load with defaults) **and** a **`localStorage`
      device mirror** (the live source applied before any save loads; the save value is the portable
      default a fresh device adopts). Pure model (`clampLayoutPos`/`layoutReducer`/`sanitizeLayout`)
      is DOM-free + feature-detected; EN/RU strings; respects the Task 39 regions. Covered by
      `test/controllayout.test.js` + a Playwright drag→save→reload→restore + off-screen-clamp suite at
      the S24 Ultra (portrait + landscape) plus a desktop no-drag smoke.
- [x] **Fullscreen control in the settings menu** — a **Display** sub-panel in **pause → settings** with
      a fullscreen toggle whose label reflects state (**Enter fullscreen** / **Exit fullscreen**, EN/RU).
      It drives the **same `Fullscreen.toggle()`** as the corner **⛶** HUD button (so the touch
      **landscape lock** on enter / `unlockOrientation()` on exit is shared), and a single
      `fullscreenchange` listener keeps the menu label, the HUD glyph and `document.fullscreenElement` in
      lockstep however fullscreen is toggled. The Fullscreen API (incl. vendor-prefixed forms) is
      **feature-detected** — on browsers without it (e.g. iOS Safari) the whole Display panel + the HUD
      button are cleanly hidden (no dead control), and the exit/lock promise rejecting never throws.
      Covered by `test/fullscreen-settings.test.js` + a Playwright suite at desktop and the S24 Ultra.
- [x] **Distinct worn helmets** — each **helmet** shows as its own real-looking head piece instead of
      one rarity-tinted dome: a soft **leather cap**, an open **iron helm** (nasal bar + cheek guards +
      comb), a horned **dragon helm**, or a banded great-**crown** with a gem. A pure, tested
      `helmetArchetype(def)` selector maps every helmet item to one of five procedural archetypes + a
      material (from its `helm` metadata, or inferred from set/rarity); the builder pre-builds all
      archetypes once under the head anchor and reveals the equipped one — rarity recolour/sheen via
      `paint()`, set motif on Ironguard/Dragonscale, tier-gated trims, seated with no face/ponytail
      clipping and **no mesh reallocation** on equip. Covered by `test/items.test.js` +
      `test/e2e/worn-helmets.spec.js` (a real-browser screenshot of three+ distinct helmets worn) — Task 25
- [x] **Distinct worn chest pieces** — each **breastplate** shows as its own layered torso piece instead
      of one rarity-tinted cylinder: a laced **leather vest**, a segmented **iron cuirass** (banded lames +
      gorget), an ornate **aegis plate** (sculpted pectorals + emblem + gold hem), an overlapping
      **dragonscale** shell with a chest gem, or a flowing cloth **robe**. A pure, tested
      `chestArchetype(def)` selector maps every breastplate item to one of five procedural archetypes + a
      material (from its `chest` metadata, or inferred from set/rarity), coordinated with the helmet so a
      full Ironguard/Dragonscale suit reads as one; the builder pre-builds all archetypes once under the
      torso anchor and reveals the equipped one — rarity recolour/sheen via `paint()`, set motif,
      tier-gated straps/lames, seated clear of the neck/arms/belt/pauldrons and **no mesh reallocation**
      on equip. Covered by `test/items.test.js` + `test/e2e/worn-chests.spec.js` (a real-browser
      screenshot of distinct chests worn) — Task 26
- [x] **Distinct worn pauldrons** — each **pauldrons** item shows as its own real shoulder piece that
      sits **on** the shoulder instead of the old plain sphere that clipped into the chest: a soft
      leather **cap**, a segmented **iron** cap with lames (Ironguard), an overlapping **dragonscale**
      cap with swept spines (Dragonscale), a trimmed **ornate** plate, or a flared **winged**
      great-pauldron. A pure, tested `pauldronArchetype(def)` selector maps every pauldrons item to one
      of five archetypes + a material (from its `paul` metadata, or inferred from set/rarity), sharing
      the set motif with the helmet + chest. The fix for the inward clip: each shoulder rides its own
      pivot **on the torso** whose forward/back **pitch** follows the arm while its **roll is ignored**,
      so the piece's inner reach is pose-independent and can never enter the chest. Built once per
      shoulder (no reallocation), tier-gated (omitted on low). Covered by `test/items.test.js` (incl. a
      shoulder-fit invariant) + `test/e2e/worn-pauldrons.spec.js` (a real-browser screenshot mid-attack) — Task 27
- [x] **Distinct worn gloves & gauntlets** — each **gloves** item shows as its own hand piece instead of
      the old plain sphere on each hand: a soft leather **glove**, a laced leather **bracer**, a
      segmented **iron gauntlet** (knuckle plate + finger lames, Ironguard), an overlapping
      **dragonscale** gauntlet (climbing scales + cuff spines, Dragonscale), or an ornate gold-trimmed
      steel **warplate** (knuckle boss, epic/legendary). A pure, tested `gloveArchetype(def)` selector
      maps every gloves item to one of five archetypes + a material (from its `glov` metadata, or
      inferred from set/rarity), sharing the set motif with the helmet + chest + pauldrons. Each glove
      rides its arm pivot (so it follows the hand through the attack) and stays **compact around the
      wrist** so the wand shaft rises cleanly out of the fist — it never engulfs the grip. Built once
      per hand (no reallocation), tier-gated (finer lames/trims on high). Covered by
      `test/items.test.js` (incl. a grip-fit invariant) + `test/e2e/worn-gloves.spec.js` (a real-browser
      screenshot of distinct gloves wrapped around the grip) — Task 28
- [x] **Distinct worn belts** — each **belt** item shows as its own real belt instead of the old plain
      cylinder that overlapped the chest band: a plain leather **strap** + a square buckle, a banded iron
      **plated** war-belt (plate buckle + riveted studs, Ironguard), an overlapping dragonscale **scaled**
      belt (fanged clasp + side tasset, Dragonscale), a leather **pouched** belt (round buckle + hanging
      pouches, rare/non-set), or an ornate gold-trimmed steel **warbelt** (gem-set boss buckle + tasset,
      epic/legendary). A pure, tested `beltArchetype(def)` selector maps every belt item to one of five
      archetypes + a material (from its `belt` metadata, or inferred from set/rarity), sharing the set
      motif with the helmet + chest + pauldrons + gloves. Seated at the **waist below the chest piece**
      (so the two never z-fight) and parented to the torso (never the legs), so the stride swings the legs
      beneath it. Built once under one waist anchor (no reallocation), tier-gated (omitted entirely on the
      low tier). Covered by `test/items.test.js` (incl. a below-chest + clears-legs invariant) +
      `test/e2e/worn-belts.spec.js` (a real-browser screenshot of distinct belts worn below the chest) — Task 29
- [x] **Distinct worn boots** — each **boots** item shows as its own real pair of boots instead of the
      old plain calf cylinder that could intersect the leg or punch through the ground: a soft leather
      **shoe** + ankle collar, a tall leather **boot** with a folded cuff (rare/non-set), a plated iron
      **greave** + sabaton (pointed toe + knee poleyn, Ironguard), an overlapping dragonscale **sabaton**
      (climbing scales + cuff spine, Dragonscale), or an ornate gold-trimmed steel **warboot** (knee boss
      + gold rim, epic/legendary). A pure, tested `bootArchetype(def)` selector maps every boots item to
      one of five archetypes + a material (from its `boot` metadata, or inferred from set/rarity), sharing
      the set motif with the helmet + chest + pauldrons + gloves + belt. Built from layered primitives
      (shaft + foot/vamp + sole/cuff) and anchored at the **foot** (not the shin midpoint), so it rides
      the leg's bottom and **strides with the feet without clipping the leg or the ground**. Built once
      per leg (no reallocation), tier-gated (finer trims on high; core always drawn). Covered by
      `test/items.test.js` (incl. an on-leg / no-ground-clip stride invariant) + `test/e2e/worn-boots.spec.js`
      (a real-browser screenshot of distinct boots mid-stride) — Task 30
- [x] **Distinct worn cloaks** — each **cloak** item shows as its own real draping cloak instead of the
      old single flat box on a pivot that swung **through the legs** on sharp turns: a plain tapered
      **cape** + neck clasp, a hooded **mantle** with a shawl collar (rare/non-set), an overlapping
      dragonscale **scaled** cloak with a fanged clasp (Dragonscale), an ornate gold-hemmed **regal**
      mantle with tassels (epic), or a feathered **winged** cloak that flares at the shoulders
      (legendary). A pure, tested `cloakArchetype(def)` selector maps every cloak item to one of five
      archetypes + a material (from its `cloak` metadata, or inferred from set/rarity), sharing the set
      motif with the rest of the suit. Each cloak is a **tapered, segmented cloth drape** + clasp hung
      from a back pivot **behind the hips**; the billow is a **pure, dt-driven, frame-rate-independent**
      updater (`cloakBillowStep`) whose pivot is **clamped so the drape only ever trails behind** — so it
      reacts to movement/turns **without scything through the legs or feet**. Built once (no
      reallocation), tier-gated (per-frame sway + finer folds on high; core drape always drawn). Covered
      by `test/items.test.js` (incl. the pure billow updater + a behind-the-legs sway invariant) +
      `test/e2e/worn-cloaks.spec.js` (a real-browser screenshot of distinct cloaks draping mid-turn) — Task 31
- [x] **Real held weapons** — the equipped weapon shows as a real, layered weapon of its actual **class**
      in hand instead of three recoloured stand-ins: a **sword** (blade + crossguard + grip + pommel), an
      **axe** (haft + bladed head), a **dagger** (short blade + guard), a **bow** (riser + upper/lower
      limbs + string), a **staff** (long shaft + a glowing orb in a clawed cage) or a **wand** (shaft + a
      glowing crystal tip). Unlike the armour selectors, the class is **intrinsic to how the weapon
      fights**, so the pure, tested `weaponArchetype(def)` selector **infers** it from the weapon's own
      mechanics (ranged + shape + hands → bow/staff/wand; melee arc/speed/hands → sword/axe/dagger; an
      explicit `held` block wins) while the material follows rarity — the six buyable weapons span all six
      classes. Each class builds **once** under the hand grip (a child of the right arm, so it **tracks the
      hand through the attack**; the from-scratch attack motion + blade trail are Task 34, whose
      `AttackAnim` poses the arm and flashes the trail smear built here); a **dual-wield** shows an off-hand weapon on a mirror
      left grip, a **two-hander** one centred weapon, and the bolt/arrow muzzle rides the active weapon's
      tip. Built once (no reallocation), tier-gated (finer trims on high; core weapon always drawn), no
      `SAVE_VERSION` change. Covered by `test/items.test.js` (incl. a held-in-hand + no-detachment
      invariant) + `test/e2e/worn-weapons.spec.js` (a real-browser screenshot of each of the six weapon
      classes held in hand) — Task 32
- [x] **From-scratch per-weapon attack animations** — the single generic `Swing` is replaced by a
      per-weapon-class **`AttackAnim`** (windup → strike → recover, each with real weight + body
      involvement): sword swept diagonal slashes chaining a **3-hit combo** with a tier-gated **blade
      trail**, an axe weighty overhead chop, dagger quick stabs, a bow nock→draw→release→recoil, a wand
      point→release and a staff channel→release. Damage lands / projectiles launch on the **strike frame**
      in the weapon's real arc/reach (no early/late/double hit), `dt`-driven, **frame-rate independent**,
      **pause-correct** and headless-safe; no `SAVE_VERSION` change. Covered by `test/combat-anim.test.js`
      + `test/e2e/combat-anim.spec.js` (a real-browser clip of each class's distinct strike) — Task 34
- [x] **Visible jewelry** — the **necklace** and **rings**, equipped but previously invisible on the
      model, now show a subtle worn piece: a fine collar **chain + pendant** at the throat (a teardrop
      **pendant**, a round-medallion **amulet**, or a heavier twin-chain **torc**) and a slim gem-set band
      on the hand (a plain **band**, a flat **signet**, or a claw-set **gemband**). A pure, tested
      `jewelryArchetype(def)` selector maps every ring/necklace (via a `jewel` block, or inferred from
      rarity) to an archetype + a metal (silver → gold → dragonscale by rarity) + a **gem colour** (the
      item's signature, else its rarity colour). The necklace rides **in front of the chest** (its pendant
      proud, clear of any breastplate); the rings ride the hands and are **hidden when a glove covers the
      hand** so a ring never clips it. **High-tier only** — the tiniest, most additive piece, so **every
      phone skips it** cleanly. Built once (no reallocation), no `SAVE_VERSION` change (the worn meshes
      derive from the equipped items). Covered by `test/items.test.js` (incl. a throat / at-the-hand fit +
      glove-cover invariant) + `test/e2e/worn-jewelry.spec.js` (a real-browser screenshot of distinct
      necklaces + rings on the model, plus graceful omission on the Galaxy S24 phone tier) — Task 33
- [ ] Puzzles (levers, plates, gated doors)
