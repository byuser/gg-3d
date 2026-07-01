// Core: internationalization (English + Russian). Holds the LOCALES + RU
// dictionaries, t()/plural()/interp(), localStorage helpers, and the pure
// data-table display-name resolvers. The two resolvers that read runtime
// systems (tWeatherLabel -> Weather, bossDisplayName -> boss archetypes) live
// in the runtime module instead, to keep this layer dependency-acyclic.
import { RARITY, SLOT_META, getDef, AFFIXES, SETS } from "../data/items.js";
import { ELEMENTS, EFFECTS } from "../data/skills.js";
import {
  MATERIALS, RESOURCE_KINDS, RELICS, CASTLE_PART_BY_ID, LOCATION_BY_ID, NPC_BY_ID,
} from "../data/content.js";
import { STORY, CHAPTER_BY_ID } from "../data/story.js";
import { ZONE_BY_ID } from "../data/zones.js";

  // =========================================================================
  // INTERNATIONALIZATION (i18n) — English + Russian, switchable live from the
  // start screen and the pause settings and persisted in localStorage.
  //
  // Two layers keep this maintainable and fully testable:
  //   1. LOCALES = { en, ru } — flat dictionaries of every UI / dynamic string,
  //      resolved through t(key, params) (with {placeholder} interpolation and
  //      en fallback). A key-parity test guarantees en and ru stay in lock-step.
  //   2. The DATA tables (items, zones, quests, NPCs, …) keep their English text
  //      as the source of truth; Russian lives in the parallel `RU` object and
  //      is read by the tData / resolver helpers, falling back to the English
  //      field. A completeness test walks the tables so no data string can ship
  //      untranslated.
  // Everything is headless-safe: localStorage is feature-detected, so the Node
  // harness simply stays in English.
  // =========================================================================
  const I18N = { locale: "en" };
  const LOCALE_KEY = "gg3d_locale";

  // localStorage isn't present in the headless harness / some privacy modes —
  // fail soft everywhere it's touched (mirrors sessionGet/Set used for saves).
  function localGet(k) {
    try { return typeof localStorage !== "undefined" ? localStorage.getItem(k) : null; }
    catch (e) { return null; }
  }
  function localSet(k, v) {
    try { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); } catch (e) {}
  }

  const LOCALES = {
    en: {
      // ---- boot / start screen ----
      "hint.loading": "Loading engine…",
      "hint.ready": "Ready!",
      "hint.errorPrefix": "Error: ",
      "start.tagline": "Run with Lily across a living island of <b>separate lands</b> — meadow vale, " +
        "whispering wood, salt shore, frostpeak trail and the boss lairs. <b>Roaming monsters</b> " +
        "guard each place and <b>respawn</b> over time; <b>travel</b> between lands through paths, " +
        "bridges and cave mouths. Follow the <b>chaptered main quest</b> (with optional <b>side quests</b>), " +
        "<b>gather &amp; craft</b>, raise a <b>castle</b> from five relics, then slay the <b>dragon</b> to win!",
      "start.startBtn": "Start Adventure",
      "start.loadBtn": "Load Progress",
      "start.continueBtn": "Continue",
      "settings.controls": "Controls",
      "settings.language": "Language",
      "settings.display": "Display",
      "settings.fullscreen": "Fullscreen",
      "settings.enterFullscreen": "Enter fullscreen",
      "settings.graphics": "Graphics",
      "settings.gfxAuto": "Auto",
      "settings.gfxHigh": "High",
      "settings.gfxMedium": "Medium",
      "settings.gfxLow": "Low",
      "settings.gfxAutoIs": "Auto: {tier}",
      "settings.gfxReload": "Reloads to apply · progress is kept",
      "settings.audio": "Audio",
      "settings.volMaster": "Master",
      "settings.volMusic": "Music",
      "settings.volSfx": "Effects",
      "settings.volAmbience": "Ambience",
      "settings.mute": "Mute all",
      "settings.unmute": "Unmute",
      // ---- Cloud saves (Task 15: Google Drive, opt-in) ----
      "settings.cloud": "Cloud Saves",
      "cloud.google": "Google Drive",
      "cloud.signIn": "Sign in with Google",
      "cloud.signOut": "Sign out",
      "cloud.signedOut": "Not signed in",
      "cloud.signedIn": "Signed in to Drive",
      "cloud.notConfigured": "Cloud saves need a Google client ID — see the README to enable.",
      "cloud.unavailable": "Cloud saves aren't available here.",
      "cloud.save": "Save to Drive",
      "cloud.list": "Cloud saves…",
      "cloud.autosaveOn": "Autosave: On",
      "cloud.autosaveOff": "Autosave: Off",
      "cloud.title": "Cloud Saves",
      "cloud.intro": "Saves live in your private Drive app folder — invisible to other apps. Autosave keeps the last hour.",
      "cloud.manual": "Manual save",
      "cloud.autosave": "Autosave",
      "cloud.restore": "Restore",
      "cloud.empty": "No cloud saves yet.",
      "cloud.loading": "Loading cloud saves…",
      "cloud.signInFirst": "Sign in to browse your cloud saves.",
      "cloud.confirmOlder": "This cloud save is older than your current progress. Load it anyway?",
      // ---- Save management (Task 18) ----
      "saves.manage": "Manage Saves",
      "saves.title": "Saves",
      "saves.intro": "Keep several named saves on this device. Load, rename or delete any of them — or back them up to a file or the cloud.",
      "saves.local": "On this device",
      "saves.cloudSection": "Cloud (Google Drive)",
      "saves.file": "File",
      "saves.slotN": "Slot {n}",
      "saves.emptySlot": "Empty slot",
      "saves.migrated": "Resumed run",
      "saves.metaLine": "Lv {level} · {where} · {time} · {when}",
      "saves.load": "Load",
      "saves.newSave": "New save",
      "saves.overwrite": "Overwrite",
      "saves.rename": "Rename",
      "saves.renameSave": "Save",
      "saves.renameLabel": "Save name",
      "saves.delete": "Delete",
      "saves.export": "Export to file",
      "saves.import": "Import from file",
      "saves.cloudSignInHint": "Sign in to see your cloud saves.",
      "saves.confirmDelete": "Delete the save \"{name}\"? This can't be undone.",
      "saves.confirmOverwrite": "Overwrite the save \"{name}\" with your current run?",
      "saves.confirmOlder": "This save is older than your current progress. Load it anyway?",
      "saves.hm": "{h}h {m}m",
      "saves.ms": "{m}m {s}s",
      "saves.s": "{s}s",
      "ctrl.move": "Move", "ctrl.moveKeys": "WASD / Arrows · or the on-screen stick",
      "ctrl.attack": "Attack", "ctrl.attackKeys": "Space / F · or the ✨ button",
      "ctrl.interact": "Interact / talk / gather", "ctrl.interactKeys": "E · or the action button",
      "ctrl.inventory": "Inventory", "ctrl.inventoryKeys": "I · or the 🎒 button",
      "ctrl.craft": "Craft · Quests", "ctrl.craftKeys": "C · J · or the 🛠️ 📜 buttons",
      "ctrl.travel": "Travel", "ctrl.travelKeys": "walk into a path / bridge / cave portal",
      // ---- Customizable on-screen control layout (Task 36) ----
      "ctrl.layout": "On-screen controls", "ctrl.layoutKeys": "drag the joystick, skills, potions, E &amp; fire anywhere",
      "settings.controlLayout": "Edit control layout",
      "layout.title": "Edit control layout",
      "layout.hint": "Drag any control to a comfy spot. Each one stays on screen. Save to keep, or reset to the default.",
      "layout.touchOnly": "On-screen controls appear on touch devices. Connect a touchscreen or play on a phone to arrange them.",
      "layout.save": "Save layout",
      "layout.reset": "Reset to default",
      "layout.cancel": "Cancel",
      "layout.saved": "Control layout saved 🎮",
      "layout.wasReset": "Controls reset to default",
      "layout.handle.joystick": "Move stick",
      "layout.handle.skillBar": "Skills",
      "layout.handle.potionBar": "Potions",
      "layout.handle.actionBtn": "Interact (E)",
      "layout.handle.castBtn": "Fire",
      // ---- HUD button titles / aria ----
      "btnTitle.fullscreen": "Fullscreen", "btnAria.fullscreen": "Toggle fullscreen",
      "btnTitle.exitFullscreen": "Exit fullscreen",
      "btnTitle.menu": "Menu (Esc)", "btnAria.menu": "Open menu",
      "btnTitle.inventory": "Inventory (I)", "btnAria.inventory": "Open inventory",
      "btnTitle.crafting": "Crafting (C)", "btnAria.crafting": "Open crafting",
      "btnTitle.questLog": "Quest log (J)", "btnAria.questLog": "Open quest log",
      "btnTitle.muteMusic": "Mute music (M)", "btnTitle.playMusic": "Play music", "btnAria.music": "Toggle music",
      "prompt.pressE": "Press <b>E</b>",
      "prompt.withKey": "{label} · <b>E</b>",
      // ---- game over / victory ----
      "over.title": "Game Over 🍭",
      "over.tagline": "The wild monsters got you! You reached <b>Level {level}</b> ({xp} XP) and fell in <b>{where}</b>.",
      "over.replay": "Play Again",
      "win.title": "Victory! 🐉🏰",
      "win.tagline": "The castle stands and the <b>Ancient Dragon</b> is slain! Meadowgate is " +
        "saved. You finished at <b>Level {level}</b> with <b>{xp} XP</b>.",
      "win.replay": "Play Again",
      "win.ending": "<b>{title}</b><br>{text}",
      // Run recap (shared by the game-over + victory screens): the key tallies.
      "recap.tallies": "🗡️ {kills} monsters felled · 🏰 {relics} relics",
      // ---- pause menu ----
      "pause.title": "Paused",
      "pause.stats": "Level <b>{level}</b> · <b>{xp}</b> XP",
      "pause.resume": "Resume",
      "pause.save": "Save Progress",
      "pause.savedBtn": "Saved! 💾",
      "pause.applyingGfx": "Applying graphics…",
      "pause.restart": "Restart",
      "pause.exit": "Exit to Menu",
      "pause.confirmYes": "Yes",
      "pause.confirmNo": "Cancel",
      "pause.confirmRestart": "Restart the game? Your current progress will be lost unless you've saved it.",
      "pause.confirmExit": "Exit to the main menu? Your current progress will be lost unless you've saved it.",
      // ---- shop / inventory / anvil / crafting / castle / quest-log (static) ----
      "shop.title": "🧙 Travelling Merchant",
      "shop.tagline": "Buy weapons, armour &amp; accessories — or sell your spare gear.",
      "shop.titleAlchemist": "⚗️ Apothecary",
      "shop.taglineAlchemist": "Buy potions &amp; fresh ingredients — or sell your spare wares.",
      "shop.coins": "coins",
      "shop.tabBuy": "Buy", "shop.tabRare": "✨ Rare", "shop.tabSell": "Sell",
      "shop.done": "Done",
      "shop.gear": "⚔️ Gear", "shop.potions": "🧪 Potions", "shop.ingredients": "🧺 Ingredients",
      "shop.owned": "have {n}",
      "shop.rareNote": "✨ Rare wares — a fresh rotation every wave.",
      "shop.sellEmpty": "Your bag is empty. Gather, craft or unequip items (🎒) to sell them.",
      "inv.title": "🎒 Inventory &amp; Equipment",
      "inv.tagline": "Click a bag item to equip it; click an equipped slot to remove it.",
      "inv.done": "Done",
      "inv.twoHanded": "⟵ two-handed",
      "inv.unequipTitle": "Unequip {name}",
      "inv.empty": "{icon} empty",
      "inv.maxHealth": "❤ Max health",
      "inv.resist": "🛡️ Resist",
      "inv.speed": "👟 Speed",
      "inv.lifesteal": "🩸 Lifesteal",
      "inv.weapon": "⚔️ Weapon",
      "inv.damage": "💥 Damage",
      "inv.bag": "🎒 Bag ({n}/{cap})",
      "inv.bagEmpty": "Empty — buy gear from the merchant or beat a boss for rare loot.",
      // ----- Task 12: tabbed bag, filter/sort, compare, sets, enchantments -----
      "inv.tagline2": "Equip from the bag · click a slot to remove · drink potions.",
      "inv.tabGear": "Gear",
      "inv.tabMaterials": "Materials",
      "inv.tabPotions": "Potions",
      "inv.filterAll": "All",
      "inv.filterLabel": "Show",
      "inv.sortLabel": "Sort",
      "inv.sortRarity": "Rarity",
      "inv.sortType": "Type",
      "inv.sortName": "Name",
      "inv.matsTitle": "🧺 Materials",
      "inv.matsEmpty": "No materials yet — chop trees, mine rocks and gather herbs out in the wilds.",
      "inv.potionsTitle": "🧪 Potions in bag",
      "inv.potionsEmpty": "No potions in the bag — buy some from the apothecary or craft them.",
      "inv.quickSlots": "⚡ Combat quick-slots",
      "inv.potDragHint": "Drag a potion onto a slot to assign it (4 / 5 / 6 in combat). Drag between slots to reorder, or onto empty space to clear.",
      "inv.slotEmpty": "empty",
      "inv.slottedTag": "SLOTTED",
      "inv.assign": "Assign ▸",
      "inv.picked": "Tap a slot ▸",
      "inv.drink": "Drink",
      "inv.drinkOne": "Drink one",
      "inv.enchantments": "✨ Enchantments",
      "inv.setBonus": "🏅 Set bonus",
      "inv.setProgress": "{name} ({n}/{total})",
      "inv.setNext": "Wear {n} for the next bonus",
      "inv.setComplete": "Full set!",
      "inv.compareBetter": "▲ {text}",
      "inv.compareWorse": "▼ {text}",
      "inv.compareSame": "= no change",
      "inv.kindWeapon": "Weapons",
      "inv.kindArmor": "Armour",
      "inv.kindJewelry": "Jewelry",
      "anvil.title": "🔨 Blacksmith",
      "anvil.tagline": "Enhance your weapons &amp; equipment. Rarer gear forges further and gains more per level.",
      "anvil.done": "Done",
      "anvil.empty": "No gear to enhance. Buy or loot some weapons and armour first.",
      "anvil.bag": "Bag",
      "anvil.max": "MAX",
      "craft.title": "🛠️ Crafting Bench",
      "craft.tagline": "Turn gathered materials into potions &amp; gear. Cut trees, mine rock, gather herbs and collect water across the land.",
      "craft.done": "Done",
      "castleui.title": "🏰 Build the Castle",
      "castleui.tagline": "Raise the castle from five relics. Find the relics through quests and exploration, then build each part in order.",
      "castleui.coins": "coins ·",
      "castleui.done": "Done",
      "questlog.title": "📜 Quest Log",
      "questlog.tagline": "Your <b>main story</b> runs in chapters across the lands — follow the tracker from one ❗ giver to the next. <b>Side quests</b> are optional bounties &amp; errands, listed separately.",
      "questlog.done": "Done",
      // ---- shared buttons ----
      "btn.buyCost": "🪙 {cost}",
      "btn.sellWorth": "Sell 🪙 {worth}",
      "btn.equip": "Equip",
      "btn.craft": "Craft 🛠️",
      "btn.needMats": "Need mats",
      "btn.build": "Build 🏰",
      "btn.built": "Built",
      "btn.locked": "Locked",
      "btn.close": "Close",
      "btn.farewell": "Farewell",
      "btn.continue": "Continue ▶",
      "btn.beginAdventure": "Begin the adventure ▶",
      "btn.turnInQuest": "Turn in: {title} ✅",
      "btn.acceptMain": "Accept: {title} 📜",
      "btn.acceptSide": "Accept: {title} 🔸",
      // ---- stat summary ----
      "stat.healthRestore": "❤️ +{n} health",
      "stat.buffWrap": "✨ {inner} ({t}s)",
      "stat.rangedArrow": "🏹 ranged",
      "stat.rangedBolt": "🔮 ranged",
      "stat.melee": "⚔️ melee",
      "stat.dmg": "{n} dmg",
      "stat.multishot": "×{n}",
      "stat.pierce": "pierce {n}",
      "stat.twoHanded": "2-handed",
      "stat.oneHanded": "1-handed",
      "stat.hp": "+{n} HP",
      "stat.resist": "+{n}% resist",
      "stat.speed": "+{n} speed",
      "stat.damageBonus": "+{n} dmg",
      "stat.haste": "+{n}% haste",
      "stat.lifestealBonus": "+{n} lifesteal",
      "stat.coinMagnet": "coin magnet",
      // ---- interactable labels ----
      "label.shop": "Shop",
      "label.blacksmith": "Blacksmith",
      "label.alchemist": "Apothecary",
      "label.collectArtifact": "Collect artifact",
      "label.talkTo": "Talk to {name}",
      "label.turnIn": "✓ {name}: turn in",
      "label.newQuest": "❗ {name}: new quest",
      "label.buildCastle": "🏰 Build castle",
      "label.buildPart": "🏰 Build {part}",
      "label.castleNeed": "🏰 Castle (need {icon} {part})",
      "label.castleComplete": "🏰 Castle complete",
      // ---- objectives ----
      "obj.hunt": "Defeat sweets — {have}/{need}",
      "obj.gather": "Gather {icon} {label} — {have}/{need}",
      "obj.reach": "Reach {name}",
      "obj.talk": "Speak with {icon} {name}",
      "obj.defeatBoss": "Defeat 👑 {boss} in {zone}",
      "obj.build": "Raise the {part} at 🏰 Castle Hill",
      "obj.defeatDragon": "Slay the 🐉 Ancient Dragon",
      "obj.lairBoss": "the lair boss",
      "obj.doneMark": " ✓",
      // ---- guidance / story flow ----
      "guide.turnin": "Return to {icon} {giver} to turn in",
      "guide.accept": "Speak with {icon} {giver} at {place}",
      "guide.whereSuffix": " · {where}",
      "place.meadowgate": "Meadowgate",
      "quest.kindMission": "Mission",
      "quest.kindSide": "Side quest",
      // ---- dialogue ----
      "dlg.tagMission": "📜 Mission",
      "dlg.tagSide": "🔸 Side quest",
      "dlg.greetSettle": "Back already? Let's settle up.",
      "dlg.greetWorking": "Still on the job? Luck go with you.",
      "dlg.greetDone": "Thank you, hero — the vale owes you much.",
      "dlg.questLine": "{tag}: <b>{title}</b>",
      "dlg.readyTurnIn": " — ready to turn in!",
      "dlg.newMission": "📜 New mission: <b>{title}</b>",
      "dlg.sideQuest": "🔸 Side quest: <b>{title}</b>{rep}{done}",
      "dlg.repeatable": " (repeatable)",
      "dlg.doneTimes": " · done ×{n}",
      "dlg.story": "\"{story}\"",
      "dlg.reward": "Reward: {reward}",
      // ---- HUD trackers / bars / banners ----
      "qt.chapter": "Chapter {n} · {title}",
      "qt.missionTitle": "📜 {title}",
      "qt.sideTitle": "🔸 {title}",
      "qt.sideReturn": "✓ return to turn in",
      "buff.pill": "{icon} {label} <b>{n}s</b>",
      "potion.slotTitle": "{name} — {desc} (press {key})",
      "boss.barName": "👑 {name}",
      "banner.bossWave": "Wave {n} — 👑 {boss}!",
      "banner.sweepWave": "Wave {n} — {count} sweets!",
      "banner.theDragon": "The Dragon",
      "label.zone": "{icon} {name}",
      // ---- toasts ----
      "toast.fullHealth": "Already at full health",
      "toast.potionHeal": "{icon} +{heal} health",
      "toast.potionBuff": "{icon} {label}!",
      "toast.noMaterials": "Not enough materials",
      "toast.beltFull": "Potion belt full (3 kinds)",
      "toast.bagFull": "Bag full",
      "toast.crafted": "🛠️ Crafted {icon} {name}",
      "toast.gathered": "{icon} +{n} {label}",
      "toast.summonMinions": "👹 The Tyrant summons minions!",
      "toast.incomingBombs": "💣 Incoming bombs!",
      "toast.hydraSplits": "🦠 The Hydra splits!",
      "toast.partRaised": "🏰 {part} raised!",
      "toast.castleComplete": "🐉 The castle is complete... the DRAGON awakens!",
      "toast.dragonDives": "🐉 The dragon dives!",
      "toast.dragonBreath": "🔥 Dragon's breath!",
      "toast.artifact": "Artifact! +{xp} XP{extra}",
      "toast.artifactHeal": " · +{n} ❤",
      "toast.artifactCoin": " · 🪙 +{n}",
      "toast.noCoins": "Not enough coins",
      "toast.bought": "{icon} Bought {name}",
      "toast.sold": "Sold {name} for 🪙 {worth}",
      "toast.maxEnhance": "Already at max enhancement",
      "toast.forged": "🔨 {name} forged!",
      "toast.questAccepted": "📜 {kind}: {title}",
      "toast.questComplete": "✅ {title} complete! {bits}",
      "toast.reached": "📍 Reached {name}",
      "toast.chapterBegin": "📖 Chapter {n}: {title}",
      "toast.lairIntro": "⚔️ {intro}",
      "toast.bossDefeated": "👑 {boss} defeated! Dropped {item}!",
      "toast.pickedUp": "✨ Picked up {item}!",
      "toast.bagFullDrop": "Bag full — drop something!",
      "toast.coinPickup": "🪙 +{n}",
      "toast.nothingToSave": "Nothing to save yet",
      "toast.saved": "Progress saved! 💾",
      "toast.saveFailed": "Save failed",
      "toast.invalidSave": "That file isn't a valid Good Game 3D save.",
      "toast.readError": "Couldn't read that file.",
      "toast.loaded": "Progress loaded! 🎮",
      "toast.slotSaved": "Saved to slot 💾",
      "toast.slotDeleted": "Save deleted",
      "toast.sessionCleared": "Saved session cleared.",
      "session.note": "Your run auto-saves to this device and resumes on reload. Sign-in is remembered so you stay logged in.",
      "session.clear": "Clear saved session & sign out",
      "toast.cloudSignedIn": "Signed in to Google Drive ☁️",
      "toast.cloudSignedOut": "Signed out of Google Drive",
      "toast.cloudSignInFailed": "Google sign-in failed",
      "toast.cloudSaved": "Saved to Drive ☁️",
      "toast.cloudSaveFailed": "Cloud save failed — your local save is unaffected",
      "toast.cloudAutosaved": "Autosaved to Drive ☁️",
      "toast.cloudLoadFailed": "Couldn't load from Drive",
      "toast.cloudOffline": "Drive is offline — the local save still works",
      // ---- castle build panel ----
      "castle.built": "✅ Built",
      "castle.lockedPrev": "🔒 Build the previous part first",
      "castle.needs": "Needs {relic} · {coins}",
      "castle.relicHave": "{icon} ✓",
      "castle.relicNeed": "{icon} {name} ✗",
      "castle.coinsHave": "🪙 {cost} ✓",
      "castle.coinsNeed": "🪙 {cost} ✗",
      "castle.complete": "The castle stands! The dragon stirs…",
      "castle.progress": "{built}/{total} {word} raised",
      "castle.partWord": { one: "part", other: "parts" },
      // ---- quest log ----
      "log.mainStory": "📜 Main Story",
      "log.sideQuests": "🔸 Side Quests",
      "log.now": "<b>Chapter {n}: {title}</b><br>{text}",
      "log.allDone": "The castle stands and the Ancient Dragon is slain — the vale is saved! 🏰🐉",
      "log.chapterRow": "{icon} Chapter {n}: {title}",
      "log.returnTo": " — return to {icon} {giver}",
      "log.speakAt": "Speak with {icon} {giver} at {place}",
      "log.sideNone": "None yet — visit the ❗ folk for optional bounties &amp; errands.",
      "log.sideFrom": "from {icon} {name}{ret} · reward {reward}",
      "log.sideReturn": " · return to turn in",
      "log.sideCompleted": "Completed side quests",
      // ---- skills, leveling & fusion (Task 14) ----
      "ctrl.skills": "Skills", "ctrl.skillsKeys": "1 / 2 / 3 · or tap a quick-bar slot",
      "btnTitle.skills": "Skills (K)", "btnAria.skills": "Open skills",
      "hud.levelBadge": "Lv {level}",
      "hud.focusLabel": "Focus",
      "skills.title": "✨ Skills &amp; Fusion",
      "skills.tagline": "Learn skills as you level, <b>fuse up to three</b> into a new one, and slot three on your quick bar.",
      "skills.done": "Done",
      "skills.level": "Level {level}",
      "skills.xp": "{xp} / {next} XP",
      "skills.focus": "Focus {focus} / {max}",
      "skills.owned": "Your Skills",
      "skills.none": "No skills yet — defeat foes and level up to learn your first.",
      "skills.toolbar": "Quick Bar (1 · 2 · 3)",
      "skills.slotEmpty": "Empty",
      "skills.fusion": "Skill Fusion",
      "skills.fuseHint": "Select 2–3 skills to forge a new fused skill.",
      "skills.fuseBtn": "🌀 Fuse",
      "skills.fuseCost": "Cost: 🪙 {coins} · 🔮 {crystal}",
      "skills.fuseResult": "Result: <b>{name}</b>",
      "skills.fuseNeedMore": "Select {n} more…",
      "skills.assignTitle": "Assign to a quick-bar slot",
      "skills.assignSlot": "→ {n}",
      "skills.clear": "Clear",
      "skills.slotHint": "Drag a skill onto a slot to assign it — drag between slots to swap, or onto empty space to clear. Tap to pick, then tap a slot.",
      "skills.slottedTag": "Slot {n}",
      "skills.fuseTag": "fuse",
      "skills.srcBase": "Leveled",
      "skills.srcBoss": "Boss loot",
      "skills.srcFused": "Fused",
      "skills.lockHint": "🔒 Reach level {level}",
      "skills.statPower": "⚔ {power}",
      "skills.statCost": "🔵 {cost}",
      "skills.statCooldown": "⏱ {s}s",
      "skills.statAoe": "◎ {radius}",
      "skills.statHeal": "💚 {power}",
      "skills.statBuff": "⏳ {s}s",
      "skills.fusedName": "{effect} · {element}",
      "skills.fusedDesc": "A fused {element} skill, blended from {n} skills.",
      "toast.levelUp": "⭐ Level {level}! +{hp} max health, +{focus} focus.",
      "toast.skillLearned": "✨ Learned {name}!",
      "toast.bossSkill": "📖 A rare skill drops: {name}!",
      "toast.skillFused": "🌀 Fused a new skill: {name}!",
      "toast.fuseNeed": "Need 🪙 {coins} and 🔮 {crystal} to fuse.",
      "toast.fuseSelect": "Select 2–3 skills to fuse.",
      "toast.noFocus": "Not enough focus.",
      "toast.skillCooling": "Recharging…",
      "toast.skillEmpty": "No skill slotted there.",
      "toast.slotAssigned": "Slotted {name}.",
      // ---- Minimap / world map / guided waypoint (Task 13) ----
      "btnTitle.map": "World map (Tab)", "btnAria.map": "Open world map",
      "ctrl.map": "Map", "ctrl.mapKeys": "Tab · tap the minimap · N toggles the minimap",
      "map.openTitle": "Open map (Tab)",
      "map.tapHint": "Tap to open map",
      "map.title": "🗺️ World Map",
      "map.tabZone": "This Land", "map.tabWorld": "World",
      "map.searchPlaceholder": "Search a place or person…",
      "map.guide": "Guide me there", "map.clearGuide": "Clear waypoint", "map.done": "Done",
      "map.noResults": "Nothing matches your search.",
      "map.selectHint": "Pick a place or person to find the way there.",
      "map.routeHere": "You are in this land.",
      "map.routeVia": "Route: {path}",
      "map.activeWaypoint": "Guiding to: {name}",
      "map.kind.zone": "Land", "map.kind.location": "Landmark", "map.kind.npc": "Person",
      "map.guideSet": "🧭 Guiding you to {name}.",
      "map.guideCleared": "Waypoint cleared.",
      "map.arrived": "🏁 Arrived at {name}.",
      "map.compassTo": "{name} · {dist}m",
      "map.compassPortal": "Take the {kind} to {zone} · {dist}m",
      "portalKind.path": "path", "portalKind.bridge": "bridge", "portalKind.cave": "cave",
    },
    ru: {
      // ---- boot / start screen ----
      "hint.loading": "Загрузка движка…",
      "hint.ready": "Готово!",
      "hint.errorPrefix": "Ошибка: ",
      "start.tagline": "Бегите за Лили по живому острову из <b>отдельных земель</b> — луговая долина, " +
        "шепчущий лес, солёный берег, морозный перевал и логова боссов. <b>Бродячие монстры</b> " +
        "охраняют каждое место и со временем <b>возрождаются</b>; <b>путешествуйте</b> между землями по тропам, " +
        "мостам и пещерам. Следуйте за <b>главным сюжетом по главам</b> (и необязательными <b>побочными заданиями</b>), " +
        "<b>собирайте и мастерите</b>, возведите <b>замок</b> из пяти реликвий, а затем сразите <b>дракона</b> ради победы!",
      "start.startBtn": "Начать приключение",
      "start.loadBtn": "Загрузить прогресс",
      "start.continueBtn": "Продолжить",
      "settings.controls": "Управление",
      "settings.language": "Язык",
      "settings.display": "Дисплей",
      "settings.fullscreen": "Полный экран",
      "settings.enterFullscreen": "Войти в полноэкранный режим",
      "settings.graphics": "Графика",
      "settings.gfxAuto": "Авто",
      "settings.gfxHigh": "Высокое",
      "settings.gfxMedium": "Среднее",
      "settings.gfxLow": "Низкое",
      "settings.gfxAutoIs": "Авто: {tier}",
      "settings.gfxReload": "Применится после перезагрузки · прогресс сохранится",
      "settings.audio": "Звук",
      "settings.volMaster": "Общий",
      "settings.volMusic": "Музыка",
      "settings.volSfx": "Эффекты",
      "settings.volAmbience": "Атмосфера",
      "settings.mute": "Выключить звук",
      "settings.unmute": "Включить звук",
      // ---- Облачные сохранения (Задача 15: Google Drive, по желанию) ----
      "settings.cloud": "Облачные сохранения",
      "cloud.google": "Google Drive",
      "cloud.signIn": "Войти через Google",
      "cloud.signOut": "Выйти",
      "cloud.signedOut": "Вход не выполнен",
      "cloud.signedIn": "Вход в Drive выполнен",
      "cloud.notConfigured": "Для облачных сохранений нужен идентификатор клиента Google — см. README.",
      "cloud.unavailable": "Облачные сохранения здесь недоступны.",
      "cloud.save": "Сохранить в Drive",
      "cloud.list": "Облачные сохранения…",
      "cloud.autosaveOn": "Автосохранение: вкл.",
      "cloud.autosaveOff": "Автосохранение: выкл.",
      "cloud.title": "Облачные сохранения",
      "cloud.intro": "Сохранения хранятся в личной папке приложения на Drive — другим приложениям они не видны. Автосохранение хранит последний час.",
      "cloud.manual": "Ручное сохранение",
      "cloud.autosave": "Автосохранение",
      "cloud.restore": "Восстановить",
      "cloud.empty": "Облачных сохранений пока нет.",
      "cloud.loading": "Загрузка облачных сохранений…",
      "cloud.signInFirst": "Войдите, чтобы просмотреть облачные сохранения.",
      "cloud.confirmOlder": "Это облачное сохранение старше текущего прогресса. Всё равно загрузить?",
      // ---- Управление сохранениями (Task 18) ----
      "saves.manage": "Сохранения",
      "saves.title": "Сохранения",
      "saves.intro": "Храните несколько именованных сохранений на этом устройстве. Любое можно загрузить, переименовать или удалить — а также сделать резервную копию в файл или облако.",
      "saves.local": "На этом устройстве",
      "saves.cloudSection": "Облако (Google Drive)",
      "saves.file": "Файл",
      "saves.slotN": "Слот {n}",
      "saves.emptySlot": "Пустой слот",
      "saves.migrated": "Текущая игра",
      "saves.metaLine": "Ур. {level} · {where} · {time} · {when}",
      "saves.load": "Загрузить",
      "saves.newSave": "Новое",
      "saves.overwrite": "Перезаписать",
      "saves.rename": "Переименовать",
      "saves.renameSave": "Сохранить",
      "saves.renameLabel": "Название сохранения",
      "saves.delete": "Удалить",
      "saves.export": "Экспорт в файл",
      "saves.import": "Импорт из файла",
      "saves.cloudSignInHint": "Войдите, чтобы увидеть облачные сохранения.",
      "saves.confirmDelete": "Удалить сохранение «{name}»? Это действие необратимо.",
      "saves.confirmOverwrite": "Перезаписать сохранение «{name}» текущей игрой?",
      "saves.confirmOlder": "Это сохранение старше текущего прогресса. Всё равно загрузить?",
      "saves.hm": "{h} ч {m} м",
      "saves.ms": "{m} м {s} с",
      "saves.s": "{s} с",
      "ctrl.move": "Движение", "ctrl.moveKeys": "WASD / стрелки · или экранный джойстик",
      "ctrl.attack": "Атака", "ctrl.attackKeys": "Пробел / F · или кнопка ✨",
      "ctrl.interact": "Действие / разговор / сбор", "ctrl.interactKeys": "E · или кнопка действия",
      "ctrl.inventory": "Инвентарь", "ctrl.inventoryKeys": "I · или кнопка 🎒",
      "ctrl.craft": "Ремесло · Задания", "ctrl.craftKeys": "C · J · или кнопки 🛠️ 📜",
      "ctrl.travel": "Путешествие", "ctrl.travelKeys": "войдите в тропу / мост / пещеру",
      // ---- Настраиваемое расположение экранных кнопок (Задача 36) ----
      "ctrl.layout": "Экранные кнопки", "ctrl.layoutKeys": "перетащите джойстик, навыки, зелья, E и атаку куда удобно",
      "settings.controlLayout": "Настроить расположение кнопок",
      "layout.title": "Настройка расположения кнопок",
      "layout.hint": "Перетащите любую кнопку в удобное место. Каждая остаётся на экране. Сохраните или сбросьте к стандарту.",
      "layout.touchOnly": "Экранные кнопки появляются на сенсорных устройствах. Подключите сенсорный экран или играйте на телефоне, чтобы расставить их.",
      "layout.save": "Сохранить расположение",
      "layout.reset": "Сбросить к стандарту",
      "layout.cancel": "Отмена",
      "layout.saved": "Расположение кнопок сохранено 🎮",
      "layout.wasReset": "Кнопки сброшены к стандарту",
      "layout.handle.joystick": "Джойстик",
      "layout.handle.skillBar": "Навыки",
      "layout.handle.potionBar": "Зелья",
      "layout.handle.actionBtn": "Действие (E)",
      "layout.handle.castBtn": "Атака",
      // ---- HUD button titles / aria ----
      "btnTitle.fullscreen": "Во весь экран", "btnAria.fullscreen": "Переключить полноэкранный режим",
      "btnTitle.exitFullscreen": "Выйти из полноэкранного режима",
      "btnTitle.menu": "Меню (Esc)", "btnAria.menu": "Открыть меню",
      "btnTitle.inventory": "Инвентарь (I)", "btnAria.inventory": "Открыть инвентарь",
      "btnTitle.crafting": "Ремесло (C)", "btnAria.crafting": "Открыть ремесло",
      "btnTitle.questLog": "Журнал заданий (J)", "btnAria.questLog": "Открыть журнал заданий",
      "btnTitle.muteMusic": "Выключить музыку (M)", "btnTitle.playMusic": "Включить музыку", "btnAria.music": "Переключить музыку",
      "prompt.pressE": "Нажмите <b>E</b>",
      "prompt.withKey": "{label} · <b>E</b>",
      // ---- game over / victory ----
      "over.title": "Игра окончена 🍭",
      "over.tagline": "Дикие монстры одолели вас! Вы достигли <b>{level}-го уровня</b> ({xp} опыта) и пали в <b>{where}</b>.",
      "over.replay": "Играть снова",
      "win.title": "Победа! 🐉🏰",
      "win.tagline": "Замок стоит, а <b>Древний Дракон</b> повержен! Лугоград спасён. " +
        "Вы завершили на <b>{level}-м уровне</b> с <b>{xp} опыта</b>.",
      "win.replay": "Играть снова",
      "win.ending": "<b>{title}</b><br>{text}",
      // Сводка забега (для экранов поражения и победы): ключевые показатели.
      "recap.tallies": "🗡️ Монстров сражено: {kills} · 🏰 Реликвий: {relics}",
      // ---- pause menu ----
      "pause.title": "Пауза",
      "pause.stats": "Уровень <b>{level}</b> · <b>{xp}</b> опыта",
      "pause.resume": "Продолжить",
      "pause.save": "Сохранить прогресс",
      "pause.savedBtn": "Сохранено! 💾",
      "pause.applyingGfx": "Применение настроек…",
      "pause.restart": "Заново",
      "pause.exit": "Выйти в меню",
      "pause.confirmYes": "Да",
      "pause.confirmNo": "Отмена",
      "pause.confirmRestart": "Начать игру заново? Текущий прогресс будет потерян, если вы его не сохранили.",
      "pause.confirmExit": "Выйти в главное меню? Текущий прогресс будет потерян, если вы его не сохранили.",
      // ---- shop / inventory / anvil / crafting / castle / quest-log (static) ----
      "shop.title": "🧙 Странствующий торговец",
      "shop.tagline": "Покупайте оружие, броню и аксессуары — или продавайте лишнее снаряжение.",
      "shop.titleAlchemist": "⚗️ Аптекарь",
      "shop.taglineAlchemist": "Покупайте зелья и свежие ингредиенты — или продавайте лишние товары.",
      "shop.coins": "монет",
      "shop.tabBuy": "Купить", "shop.tabRare": "✨ Редкое", "shop.tabSell": "Продать",
      "shop.done": "Готово",
      "shop.gear": "⚔️ Снаряжение", "shop.potions": "🧪 Зелья", "shop.ingredients": "🧺 Ингредиенты",
      "shop.owned": "есть {n}",
      "shop.rareNote": "✨ Редкие товары — обновляются каждую волну.",
      "shop.sellEmpty": "Ваша сумка пуста. Соберите, скрафтите или снимите предметы (🎒), чтобы продать их.",
      "inv.title": "🎒 Инвентарь и снаряжение",
      "inv.tagline": "Нажмите на предмет в сумке, чтобы надеть его; нажмите на занятый слот, чтобы снять.",
      "inv.done": "Готово",
      "inv.twoHanded": "⟵ двуручное",
      "inv.unequipTitle": "Снять: {name}",
      "inv.empty": "{icon} пусто",
      "inv.maxHealth": "❤ Макс. здоровье",
      "inv.resist": "🛡️ Защита",
      "inv.speed": "👟 Скорость",
      "inv.lifesteal": "🩸 Вампиризм",
      "inv.weapon": "⚔️ Оружие",
      "inv.damage": "💥 Урон",
      "inv.bag": "🎒 Сумка ({n}/{cap})",
      "inv.bagEmpty": "Пусто — купите снаряжение у торговца или одолейте босса ради редкой добычи.",
      // ----- Task 12 -----
      "inv.tagline2": "Надевайте из сумки · нажмите на слот, чтобы снять · пейте зелья.",
      "inv.tabGear": "Снаряжение",
      "inv.tabMaterials": "Материалы",
      "inv.tabPotions": "Зелья",
      "inv.filterAll": "Все",
      "inv.filterLabel": "Показать",
      "inv.sortLabel": "Сорт.",
      "inv.sortRarity": "Редкость",
      "inv.sortType": "Тип",
      "inv.sortName": "Имя",
      "inv.matsTitle": "🧺 Материалы",
      "inv.matsEmpty": "Материалов пока нет — рубите деревья, добывайте камень и собирайте травы в дикой местности.",
      "inv.potionsTitle": "🧪 Зелья в сумке",
      "inv.potionsEmpty": "В сумке нет зелий — купите их у аптекаря или сварите.",
      "inv.quickSlots": "⚡ Боевые быстрые ячейки",
      "inv.potDragHint": "Перетащите зелье на ячейку, чтобы назначить его (4 / 5 / 6 в бою). Перетаскивайте между ячейками для перестановки или на пустое место, чтобы убрать.",
      "inv.slotEmpty": "пусто",
      "inv.slottedTag": "В ЯЧЕЙКЕ",
      "inv.assign": "Назначить ▸",
      "inv.picked": "Коснитесь ячейки ▸",
      "inv.drink": "Выпить",
      "inv.drinkOne": "Выпить одно",
      "inv.enchantments": "✨ Чары",
      "inv.setBonus": "🏅 Бонус комплекта",
      "inv.setProgress": "{name} ({n}/{total})",
      "inv.setNext": "Наденьте {n} для следующего бонуса",
      "inv.setComplete": "Полный комплект!",
      "inv.compareBetter": "▲ {text}",
      "inv.compareWorse": "▼ {text}",
      "inv.compareSame": "= без изменений",
      "inv.kindWeapon": "Оружие",
      "inv.kindArmor": "Броня",
      "inv.kindJewelry": "Украшения",
      "anvil.title": "🔨 Кузнец",
      "anvil.tagline": "Улучшайте оружие и снаряжение. Чем реже предмет, тем дальше его можно усилить и тем больше прирост за уровень.",
      "anvil.done": "Готово",
      "anvil.empty": "Нечего улучшать. Сначала купите или добудьте оружие и броню.",
      "anvil.bag": "Сумка",
      "anvil.max": "МАКС",
      "craft.title": "🛠️ Верстак",
      "craft.tagline": "Превращайте собранные материалы в зелья и снаряжение. Рубите деревья, добывайте камень, собирайте травы и воду по всей земле.",
      "craft.done": "Готово",
      "castleui.title": "🏰 Построить замок",
      "castleui.tagline": "Возведите замок из пяти реликвий. Добудьте реликвии заданиями и исследованием, затем стройте части по порядку.",
      "castleui.coins": "монет ·",
      "castleui.done": "Готово",
      "questlog.title": "📜 Журнал заданий",
      "questlog.tagline": "Ваш <b>главный сюжет</b> идёт по главам через земли — следуйте за трекером от одного ❗ дарителя к другому. <b>Побочные задания</b> — необязательные награды и поручения, перечислены отдельно.",
      "questlog.done": "Готово",
      // ---- shared buttons ----
      "btn.buyCost": "🪙 {cost}",
      "btn.sellWorth": "Продать 🪙 {worth}",
      "btn.equip": "Надеть",
      "btn.craft": "Создать 🛠️",
      "btn.needMats": "Нужны материалы",
      "btn.build": "Строить 🏰",
      "btn.built": "Готово",
      "btn.locked": "Закрыто",
      "btn.close": "Закрыть",
      "btn.farewell": "Прощайте",
      "btn.continue": "Продолжить ▶",
      "btn.beginAdventure": "Начать приключение ▶",
      "btn.turnInQuest": "Сдать: {title} ✅",
      "btn.acceptMain": "Принять: {title} 📜",
      "btn.acceptSide": "Принять: {title} 🔸",
      // ---- stat summary ----
      "stat.healthRestore": "❤️ +{n} здоровья",
      "stat.buffWrap": "✨ {inner} ({t}с)",
      "stat.rangedArrow": "🏹 дальний бой",
      "stat.rangedBolt": "🔮 дальний бой",
      "stat.melee": "⚔️ ближний бой",
      "stat.dmg": "{n} ур.",
      "stat.multishot": "×{n}",
      "stat.pierce": "пробой {n}",
      "stat.twoHanded": "двуручное",
      "stat.oneHanded": "одноручное",
      "stat.hp": "+{n} ОЗ",
      "stat.resist": "+{n}% защиты",
      "stat.speed": "+{n} скорости",
      "stat.damageBonus": "+{n} ур.",
      "stat.haste": "+{n}% скорости атаки",
      "stat.lifestealBonus": "+{n} вампиризма",
      "stat.coinMagnet": "магнит для монет",
      // ---- interactable labels ----
      "label.shop": "Торговец",
      "label.blacksmith": "Кузнец",
      "label.alchemist": "Аптекарь",
      "label.collectArtifact": "Подобрать артефакт",
      "label.talkTo": "Поговорить: {name}",
      "label.turnIn": "✓ {name}: сдать",
      "label.newQuest": "❗ {name}: новое задание",
      "label.buildCastle": "🏰 Строить замок",
      "label.buildPart": "🏰 Строить: {part}",
      "label.castleNeed": "🏰 Замок (нужно {icon} {part})",
      "label.castleComplete": "🏰 Замок достроен",
      // ---- objectives ----
      "obj.hunt": "Победите сладости — {have}/{need}",
      "obj.gather": "Соберите {icon} {label:acc} — {have}/{need}",
      "obj.reach": "Дойдите до {name:gen}",
      "obj.talk": "Поговорите с {icon} {name:ins}",
      "obj.defeatBoss": "Одолейте 👑 {boss:acc} в {zone:pre}",
      "obj.build": "Возведите {part:acc} на 🏰 Замковом холме",
      "obj.defeatDragon": "Сразите 🐉 Древнего Дракона",
      "obj.lairBoss": "босса логова",
      "obj.doneMark": " ✓",
      // ---- guidance / story flow ----
      "guide.turnin": "Вернитесь к {icon} {giver:dat}, чтобы сдать",
      "guide.accept": "Поговорите с {icon} {giver:ins} {prep} {place:pre}",
      "guide.whereSuffix": " · {where}",
      "place.meadowgate": "Лугоград",
      "quest.kindMission": "Задание",
      "quest.kindSide": "Побочное задание",
      // ---- dialogue ----
      "dlg.tagMission": "📜 Задание",
      "dlg.tagSide": "🔸 Побочное задание",
      "dlg.greetSettle": "Уже вернулись? Давайте рассчитаемся.",
      "dlg.greetWorking": "Всё ещё за делом? Удачи вам.",
      "dlg.greetDone": "Спасибо, герой — долина в долгу перед вами.",
      "dlg.questLine": "{tag}: <b>{title}</b>",
      "dlg.readyTurnIn": " — можно сдавать!",
      "dlg.newMission": "📜 Новое задание: <b>{title}</b>",
      "dlg.sideQuest": "🔸 Побочное задание: <b>{title}</b>{rep}{done}",
      "dlg.repeatable": " (повторяемое)",
      "dlg.doneTimes": " · сдано ×{n}",
      "dlg.story": "«{story}»",
      "dlg.reward": "Награда: {reward}",
      // ---- HUD trackers / bars / banners ----
      "qt.chapter": "Глава {n} · {title}",
      "qt.missionTitle": "📜 {title}",
      "qt.sideTitle": "🔸 {title}",
      "qt.sideReturn": "✓ вернитесь, чтобы сдать",
      "buff.pill": "{icon} {label} <b>{n}с</b>",
      "potion.slotTitle": "{name} — {desc} (нажмите {key})",
      "boss.barName": "👑 {name}",
      "banner.bossWave": "Волна {n} — 👑 {boss}!",
      "banner.sweepWave": "Волна {n} — сладостей: {count}!",
      "banner.theDragon": "Дракон",
      "label.zone": "{icon} {name}",
      // ---- toasts ----
      "toast.fullHealth": "Здоровье уже полное",
      "toast.potionHeal": "{icon} +{heal} здоровья",
      "toast.potionBuff": "{icon} {label}!",
      "toast.noMaterials": "Недостаточно материалов",
      "toast.beltFull": "Пояс зелий полон (3 вида)",
      "toast.bagFull": "Сумка полна",
      "toast.crafted": "🛠️ Создано: {icon} {name}",
      // {label} is count-agreed at the call site (2 камня / 5 камней).
      "toast.gathered": "{icon} +{n} {label}",
      "toast.summonMinions": "👹 Тиран призывает прислужников!",
      "toast.incomingBombs": "💣 Летят бомбы!",
      "toast.hydraSplits": "🦠 Гидра делится!",
      // {verb} agrees with the part's gender/number via select() at the call
      // site: возведён / возведена / возведено / возведены.
      "toast.partRaised": "🏰 {part} {verb}!",
      "toast.castleComplete": "🐉 Замок достроен... ДРАКОН пробуждается!",
      "toast.dragonDives": "🐉 Дракон пикирует!",
      "toast.dragonBreath": "🔥 Дыхание дракона!",
      "toast.artifact": "Артефакт! +{xp} опыта{extra}",
      "toast.artifactHeal": " · +{n} ❤",
      "toast.artifactCoin": " · 🪙 +{n}",
      "toast.noCoins": "Недостаточно монет",
      "toast.bought": "{icon} Куплено: {name}",
      "toast.sold": "Продано: {name} за 🪙 {worth}",
      "toast.maxEnhance": "Уже максимальное улучшение",
      "toast.forged": "🔨 {name} выковано!",
      "toast.questAccepted": "📜 {kind}: {title}",
      "toast.questComplete": "✅ {title} — выполнено! {bits}",
      "toast.reached": "📍 Достигнуто: {name:gen}",
      "toast.chapterBegin": "📖 Глава {n}: {title}",
      "toast.lairIntro": "⚔️ {intro}",
      // {verb} agrees with the boss's gender: повержен / повержена.
      "toast.bossDefeated": "👑 {boss} {verb}! Выпало: {item}!",
      "toast.pickedUp": "✨ Подобрано: {item}!",
      "toast.bagFullDrop": "Сумка полна — что-нибудь выбросьте!",
      "toast.coinPickup": "🪙 +{n}",
      "toast.nothingToSave": "Пока нечего сохранять",
      "toast.saved": "Прогресс сохранён! 💾",
      "toast.saveFailed": "Не удалось сохранить",
      "toast.invalidSave": "Этот файл не является сохранением Good Game 3D.",
      "toast.readError": "Не удалось прочитать файл.",
      "toast.loaded": "Прогресс загружен! 🎮",
      "toast.slotSaved": "Сохранено в слот 💾",
      "toast.slotDeleted": "Сохранение удалено",
      "toast.sessionCleared": "Сохранённая сессия очищена.",
      "session.note": "Ваша игра автоматически сохраняется на этом устройстве и возобновляется при перезагрузке. Вход запоминается, чтобы вы оставались в системе.",
      "session.clear": "Очистить сохранённую сессию и выйти",
      "toast.cloudSignedIn": "Вход в Google Drive выполнен ☁️",
      "toast.cloudSignedOut": "Выход из Google Drive выполнен",
      "toast.cloudSignInFailed": "Не удалось войти через Google",
      "toast.cloudSaved": "Сохранено в Drive ☁️",
      "toast.cloudSaveFailed": "Не удалось сохранить в облако — локальное сохранение не затронуто",
      "toast.cloudAutosaved": "Автосохранение в Drive ☁️",
      "toast.cloudLoadFailed": "Не удалось загрузить из Drive",
      "toast.cloudOffline": "Drive недоступен — локальное сохранение работает",
      // ---- castle build panel ----
      "castle.built": "✅ Построено",
      "castle.lockedPrev": "🔒 Сначала постройте предыдущую часть",
      "castle.needs": "Нужно {relic} · {coins}",
      "castle.relicHave": "{icon} ✓",
      "castle.relicNeed": "{icon} {name} ✗",
      "castle.coinsHave": "🪙 {cost} ✓",
      "castle.coinsNeed": "🪙 {cost} ✗",
      "castle.complete": "Замок стоит! Дракон пробуждается…",
      "castle.progress": "{word}: {built}/{total}",
      "castle.partWord": { one: "Возведена часть", few: "Возведено частей", many: "Возведено частей" },
      // ---- quest log ----
      "log.mainStory": "📜 Главный сюжет",
      "log.sideQuests": "🔸 Побочные задания",
      "log.now": "<b>Глава {n}: {title}</b><br>{text}",
      "log.allDone": "Замок стоит, а Древний Дракон повержен — долина спасена! 🏰🐉",
      "log.chapterRow": "{icon} Глава {n}: {title}",
      "log.returnTo": " — вернитесь к {icon} {giver:dat}",
      "log.speakAt": "Поговорите с {icon} {giver:ins} {prep} {place:pre}",
      "log.sideNone": "Пока ничего — навестите ❗ людей ради необязательных наград и поручений.",
      "log.sideFrom": "от {icon} {name}{ret} · награда {reward}",
      "log.sideReturn": " · вернитесь, чтобы сдать",
      "log.sideCompleted": "Выполненные побочные задания",
      // ---- skills, leveling & fusion (Task 14) ----
      "ctrl.skills": "Навыки", "ctrl.skillsKeys": "1 / 2 / 3 · или коснитесь ячейки панели",
      "btnTitle.skills": "Навыки (K)", "btnAria.skills": "Открыть навыки",
      "hud.levelBadge": "Ур. {level}",
      "hud.focusLabel": "Фокус",
      "skills.title": "✨ Навыки и слияние",
      "skills.tagline": "Изучайте навыки с ростом уровня, <b>сливайте до трёх</b> в новый и ставьте три на панель быстрого доступа.",
      "skills.done": "Готово",
      "skills.level": "Уровень {level}",
      "skills.xp": "{xp} / {next} опыта",
      "skills.focus": "Фокус {focus} / {max}",
      "skills.owned": "Ваши навыки",
      "skills.none": "Навыков пока нет — побеждайте врагов и повышайте уровень, чтобы изучить первый.",
      "skills.toolbar": "Панель (1 · 2 · 3)",
      "skills.slotEmpty": "Пусто",
      "skills.fusion": "Слияние навыков",
      "skills.fuseHint": "Выберите 2–3 навыка, чтобы создать новый слитый навык.",
      "skills.fuseBtn": "🌀 Слить",
      "skills.fuseCost": "Цена: 🪙 {coins} · 🔮 {crystal}",
      "skills.fuseResult": "Итог: <b>{name}</b>",
      "skills.fuseNeedMore": "Выберите ещё {n}…",
      "skills.assignTitle": "Назначить в ячейку панели",
      "skills.assignSlot": "→ {n}",
      "skills.clear": "Очистить",
      "skills.slotHint": "Перетащите умение на ячейку, чтобы назначить — между ячейками для обмена, на пустое место для очистки. Коснитесь, затем коснитесь ячейки.",
      "skills.slottedTag": "Ячейка {n}",
      "skills.fuseTag": "слить",
      "skills.srcBase": "За уровень",
      "skills.srcBoss": "С босса",
      "skills.srcFused": "Слитый",
      "skills.lockHint": "🔒 Нужен уровень {level}",
      "skills.statPower": "⚔ {power}",
      "skills.statCost": "🔵 {cost}",
      "skills.statCooldown": "⏱ {s}с",
      "skills.statAoe": "◎ {radius}",
      "skills.statHeal": "💚 {power}",
      "skills.statBuff": "⏳ {s}с",
      "skills.fusedName": "{effect} · {element}",
      "skills.fusedDesc": "Слитый навык школы «{element}», созданный из {n} навыков.",
      "toast.levelUp": "⭐ Уровень {level}! +{hp} к макс. здоровью, +{focus} фокуса.",
      "toast.skillLearned": "✨ Изучен навык: {name}!",
      "toast.bossSkill": "📖 Выпал редкий навык: {name}!",
      "toast.skillFused": "🌀 Создан новый навык: {name}!",
      "toast.fuseNeed": "Для слияния нужно 🪙 {coins} и 🔮 {crystal}.",
      "toast.fuseSelect": "Выберите 2–3 навыка для слияния.",
      "toast.noFocus": "Недостаточно фокуса.",
      "toast.skillCooling": "Перезарядка…",
      "toast.skillEmpty": "В ячейке нет навыка.",
      "toast.slotAssigned": "Навык в ячейке: {name}.",
      // ---- Миникарта / карта мира / навигатор (Task 13) ----
      "btnTitle.map": "Карта мира (Tab)", "btnAria.map": "Открыть карту мира",
      "ctrl.map": "Карта", "ctrl.mapKeys": "Tab · коснитесь миникарты · N — миникарта",
      "map.openTitle": "Открыть карту (Tab)",
      "map.tapHint": "Коснитесь, чтобы открыть карту",
      "map.title": "🗺️ Карта мира",
      "map.tabZone": "Этот край", "map.tabWorld": "Мир",
      "map.searchPlaceholder": "Найти место или персонажа…",
      "map.guide": "Проложить путь", "map.clearGuide": "Снять метку", "map.done": "Готово",
      "map.noResults": "Ничего не найдено.",
      "map.selectHint": "Выберите место или персонажа, чтобы найти дорогу.",
      "map.routeHere": "Вы в этом краю.",
      "map.routeVia": "Путь: {path}",
      "map.activeWaypoint": "Цель: {name}",
      "map.kind.zone": "Край", "map.kind.location": "Место", "map.kind.npc": "Персонаж",
      "map.guideSet": "🧭 Веду вас к цели: {name}.",
      "map.guideCleared": "Метка снята.",
      "map.arrived": "🏁 Вы на месте: {name}.",
      "map.compassTo": "{name} · {dist}м",
      // {prep} + {zone:acc} agree at the call site (в Хрустальные пещеры / на
      // Морозную тропу) — motion "to" governs the accusative.
      "map.compassPortal": "Идите через {kind} {prep} {zone:acc} · {dist}м",
      "portalKind.path": "тропу", "portalKind.bridge": "мост", "portalKind.cave": "пещеру",
    },
  };

  // Russian translations for the DATA tables (English stays in the tables as the
  // source + fallback). Keyed by the same ids the tables use. A completeness
  // test walks the tables and fails if any of these is missing.
  const RU = {
    item: {
      magic_wand: { name: "Волшебная палочка", desc: "Надёжный метатель зарядов." },
      short_bow: { name: "Короткий лук", desc: "Двуручный. Быстрые пробивающие стрелы, летящие по дуге." },
      apprentice_staff: { name: "Посох ученика", desc: "Двуручный. Бьёт веером из 3 зарядов." },
      iron_dagger: { name: "Железный кинжал", desc: "Одноручный. Быстрые короткие удары — хорош в паре." },
      iron_sword: { name: "Железный меч", desc: "Одноручный. Сбалансированный удар ближнего боя." },
      war_axe: { name: "Боевой топор", desc: "Одноручный. Медленный, но тяжёлый, с широким взмахом." },
      leather_cap: { name: "Кожаный шлем", desc: "+15 к макс. здоровью." },
      iron_helm: { name: "Железный шлем", desc: "+25 здоровья, +4% защиты." },
      leather_vest: { name: "Кожаный жилет", desc: "+20 здоровья, +4% защиты." },
      iron_plate: { name: "Железные латы", desc: "+35 здоровья, +10% защиты." },
      leather_boots: { name: "Кожаные сапоги", desc: "+0,8 к скорости." },
      iron_greaves: { name: "Железные поножи", desc: "+0,4 скорости, +5% защиты." },
      amulet_vigor: { name: "Амулет бодрости", desc: "+25 к макс. здоровью." },
      coin_amulet: { name: "Подвеска-магнит", desc: "Притягивает монеты издалека." },
      ring_power: { name: "Кольцо мощи", desc: "+1 к урону оружия." },
      ring_swift: { name: "Кольцо проворства", desc: "Атака на 12% быстрее." },
      ring_guard: { name: "Кольцо защиты", desc: "+6% к сопротивлению урону." },
      excalibur: { name: "Экскалибур", desc: "Двуручный меч. Разрушительный широкий взмах." },
      storm_bow: { name: "Грозовой лук", desc: "Двуручный. Выпускает 3 пробивающие стрелы." },
      archmage_wand: { name: "Жезл архимага", desc: "Одноручный. Буря из 3 пробивающих зарядов." },
      twin_fang: { name: "Клинок-клык", desc: "Одноручный. Стремительные удары, крадущие жизнь." },
      thunder_hammer: { name: "Громовой молот", desc: "Двуручный. Сокрушительный, с огромным взмахом." },
      dragon_helm: { name: "Драконий шлем", desc: "+40 здоровья, +10% защиты." },
      aegis_plate: { name: "Латы Эгиды", desc: "+55 здоровья, +16% защиты." },
      winged_boots: { name: "Крылатые сапоги", desc: "+1,4 скорости, +5% защиты." },
      vampiric_ring: { name: "Вампирское кольцо", desc: "+3 к здоровью за убийство." },
      titan_pendant: { name: "Подвеска титана", desc: "+45 здоровья, +8% защиты, +2 урона." },
      void_scythe: { name: "Коса пустоты", desc: "Двуручная. Жатва по дуге, крадущая жизнь." },
      sunfire_staff: { name: "Посох солнечного огня", desc: "Двуручный. Палящий веер из 5 зарядов." },
      phoenix_plate: { name: "Латы феникса", desc: "+75 здоровья, +20% защиты." },
      seraph_ring: { name: "Кольцо серафима", desc: "+3 урона, +5 вампиризма." },
      world_ender: { name: "Крушитель миров", desc: "Двуручный. Катастрофическое, всё сметающее разрушение." },
      astral_bow: { name: "Астральный лук", desc: "Двуручный. Буря из 5 пробивающих стрел." },
      crown_eternal: { name: "Вечная корона", desc: "+90 здоровья, +18% защиты, +3 урона." },
      minor_potion: { name: "Малое зелье здоровья", desc: "Восстанавливает 30 здоровья." },
      health_potion: { name: "Зелье здоровья", desc: "Восстанавливает 65 здоровья." },
      greater_potion: { name: "Большое зелье здоровья", desc: "Восстанавливает 140 здоровья." },
      elixir_might: { name: "Эликсир мощи", desc: "+4 урона на 18 с.", label: "Мощь" },
      elixir_swift: { name: "Эликсир проворства", desc: "+2,5 скорости на 18 с.", label: "Проворство" },
      // ----- Task 21: crafting materials as bag items (names mirror MATERIALS) -----
      wood: { name: "Дерево", desc: "Крепкая древесина для крафта." },
      stone: { name: "Камень", desc: "Прочный строительный камень." },
      water: { name: "Вода", desc: "Чистая вода для варки." },
      herb: { name: "Трава", desc: "Душистая лечебная трава." },
      fiber: { name: "Волокно", desc: "Прочное растительное волокно для ткани." },
      crystal: { name: "Кристалл", desc: "Гудящий магический кристалл." },
      // ----- Task 12: new equipment slots, sets & enchanted gear -----
      leather_pauldrons: { name: "Кожаные наплечники", desc: "+12 к макс. здоровью." },
      iron_pauldrons: { name: "Железные наплечники", desc: "+18 здоровья, +5% защиты." },
      leather_gloves: { name: "Кожаные перчатки", desc: "+1 к урону оружия." },
      iron_gauntlets: { name: "Железные рукавицы", desc: "+12 здоровья, +1 урон." },
      leather_belt: { name: "Кожаный пояс", desc: "+10 к макс. здоровью." },
      reinforced_belt: { name: "Укреплённый пояс", desc: "+14 здоровья, +3% защиты." },
      travel_cloak: { name: "Дорожный плащ", desc: "+0,7 к скорости." },
      guard_cloak: { name: "Защитный плащ", desc: "+18 здоровья, +4% защиты." },
      dragonscale_plate: { name: "Латы из драконьей чешуи", desc: "+50 здоровья, +14% защиты." },
      dragon_pauldrons: { name: "Наплечники из драконьей чешуи", desc: "+30 здоровья, +8% защиты." },
      dragon_gauntlets: { name: "Рукавицы из драконьей чешуи", desc: "+18 здоровья, +2 урона." },
      dragon_belt: { name: "Пояс из драконьей чешуи", desc: "+22 здоровья, +5% защиты." },
      dragon_cloak: { name: "Плащ из драконьей чешуи", desc: "+0,8 скорости, +6% защиты." },
      shadow_cloak: { name: "Теневой плащ", desc: "+1,1 скорости, +5% защиты." },
      swift_gloves: { name: "Перчатки ловкача", desc: "Атака на 10% быстрее." },
      storm_pauldrons: { name: "Наплечники бури", desc: "+45 здоровья, +12% защиты." },
      titan_gauntlets: { name: "Рукавицы титана", desc: "+25 здоровья, +3 урона." },
      wings_of_dawn: { name: "Крылья рассвета", desc: "+1,6 скорости, +35 здоровья, +8% защиты." },
      fists: { name: "Кулаки" },
    },
    rarity: { normal: "Обычное", rare: "Редкое", epic: "Эпическое", legendary: "Легендарное" },
    slot: { helmet: "Шлем", pauldrons: "Наплечники", breastplate: "Нагрудник", gloves: "Перчатки",
            belt: "Пояс", boots: "Сапоги", cloak: "Плащ", necklace: "Ожерелье",
            ring: "Кольцо", hand1: "Основная рука", hand2: "Вторая рука" },
    // Enchantment (affix) labels — shown as chips on item cards (prefix / "of X").
    affix: {
      fierce: "Свирепое", keen: "Острое", vampiric: "Вампирское", swift: "Быстрое",
      sturdy: "Крепкое", guarded: "Защищённое", fleet: "Лёгкое",
      of_vigor: "бодрости", of_warding: "ограждения", of_power: "мощи", of_haste: "спешки",
      of_swiftness: "проворства", of_leeching: "вытягивания", of_fortune: "удачи",
    },
    set: { ironguard: "Железный страж", dragonscale: "Драконья чешуя" },
    material: { wood: "Дерево", stone: "Камень", water: "Вода", herb: "Трава", fiber: "Волокно", crystal: "Кристалл" },
    resource: { tree: "Срубить дерево", rock: "Добыть камень", herb: "Собрать травы",
                water: "Набрать воды", fiber: "Срезать волокна", crystal: "Добыть кристалл" },
    relic: {
      relic_foundation: { name: "Камень основания", desc: "Огромный краеугольный камень, испещрённый рунами." },
      relic_walls: { name: "Руны стен", desc: "Камни, помнящие, как стоять стенами." },
      relic_towers: { name: "Кристалл башен", desc: "Кристалл, что поёт шпили в бытие." },
      relic_gate: { name: "Ключ от золотых врат", desc: "Великий ключ, что творит несокрушимые врата." },
      relic_keep: { name: "Печать дракона", desc: "Печать старой цитадели — и внимание дракона." },
    },
    castlePart: {
      foundation: { name: "Основание", desc: "Заложите великий краеугольный камень." },
      walls: { name: "Стены", desc: "Возведите крепостные стены." },
      towers: { name: "Башни", desc: "Сотворите угловые шпили." },
      gate: { name: "Надвратная башня", desc: "Навесьте золотые врата." },
      keep: { name: "Цитадель", desc: "Увенчайте цитадель — и разбудите дракона." },
    },
    boss: {
      charger: "Желейный король", caster: "Шоколадный властелин", summoner: "Леденцовый тиран",
      stomper: "Кексовый колосс", bomber: "Военачальник-карамель", splitter: "Желатиновая гидра",
    },
    lairBoss: { caverns: "Подземельный Гамлорд", thicket: "Колючая Гидра" },
    lairIntro: {
      caverns: "Колоссальный конфетный голем правит Хрустальными пещерами. Сразите его!",
      thicket: "Колючая Гидра свернулась в глубокой чаще, делясь, когда падает. Покончите с ней!",
    },
    zone: {
      meadow: "Долина Лугоград", forest: "Глубь Шепчущего леса", shore: "Соляное побережье",
      peaks: "Морозная тропа", caverns: "Хрустальные пещеры", thicket: "Колючая чаща",
    },
    location: {
      village: "Деревня Лугоград", apothecary: "Аптека Лугограда", grove: "Роща Шепчущего леса",
      seaside: "Соляной берег", mountain: "Морозный перевал", ruins: "Затонувшие руины", castle: "Замковый холм",
    },
    npc: {
      mayor: { name: "Мэр Слива", intro: "Лугоград осаждают живые сладости! Говорят, когда-то долину защищал замок. Помогите нам возвести его вновь, герой." },
      alchemist: { name: "Аптекарь Мириэль", intro: "Ищете снадобье? Я варю все зелья в долине, а ещё торгую свежими реагентами." },
      herbalist: { name: "Мудрая Ива", intro: "Шепчущий лес щедр к тем, кто умеет слушать. Собирайте со мной, и я поделюсь старыми тайнами." },
      fisher: { name: "Старый Брин", intro: "Ха! Сухопутный гость на моём берегу. Море хранит Кристалл башен — заслужите его, и он ваш." },
      smith2: { name: "Праматерь-кузнец Това", intro: "Морозное железо — лучшее из всех. Докажите силу руки, и я выкую вам Ключ от врат." },
      hermit: { name: "Отшельник", intro: "Ищете Печать дракона? Немногие готовы. Сначала поговорите с мэром, затем возвращайтесь ко мне." },
    },
    quest: {
      m_cull: { title: "Привкус битвы", story: "Истребите сладости, рыщущие по нашим полям, и покажите долине, что есть надежда.", where: "Долина Лугоград" },
      m_cornerstone: { title: "Краеугольный камень", story: "Камень основания лежит в Затонувших руинах на востоке. Отыщите его." },
      m_foundation: { title: "Заложить краеугольный камень", story: "Отнесите Камень основания на Замковый холм и заложите наш краеугольный камень." },
      m_poultice: { title: "Зелёные руки", story: "Соберите травы в роще, чтобы я мог варить припарки для ополчения.", where: "Роща Шепчущего леса" },
      m_stone: { title: "Камни для стен", story: "Стенам нужен добрый камень. Добудьте его в холмах и высоких скалах.", where: "Морозный перевал и холмы" },
      m_walls: { title: "Возвести валы", story: "С Рунами стен в руках возведите наши крепостные стены." },
      m_water: { title: "Свежая вода", story: "Принесите чистой воды из реки для моих сетей, и я расскажу вам о глубоких пещерах.", where: "Река и Соляное побережье" },
      m_caverns: { title: "Глубины внизу", story: "Конфетный голем хранит Кристалл башен в Хрустальных пещерах, через морскую пещеру за моим берегом. Покончите с ним!", where: "Хрустальные пещеры (через Соляное побережье)" },
      m_towers: { title: "Сотворить шпили", story: "Впойте Кристалл башен в угловые шпили замка." },
      m_ore: { title: "Руда для горна", story: "Принесите мне кристалл из высоких скал, чтобы разжечь горн.", where: "Морозная тропа" },
      m_gatekey: { title: "Золотые врата", story: "Перебейте сладости, бродящие по морозному перевалу, и заберите выкованный Ключ от врат.", where: "Морозная тропа" },
      m_gate: { title: "Навесить золотые врата", story: "Навесьте золотые врата и запечатайте наши стены." },
      m_word: { title: "Слово из долины", story: "Поговорите с мэром Сливой, чтобы он поручился за вас, затем возвращайтесь ко мне." },
      m_thicket: { title: "Сердце чащи", story: "Колючая Гидра свернулась в глубокой чаще за Шепчущим лесом. Вырвите её сердце — и Печать дракона ваша.", where: "Колючая чаща (через Шепчущий лес)" },
      m_keep: { title: "Увенчать цитадель", story: "Установите Печать дракона и увенчайте цитадель — хотя это наверняка разбудит зверя внизу." },
      m_dragon: { title: "Сразить Древнего Дракона", story: "Древний Дракон пробудился. Встретьте его перед новым замком и положите конец долгой осаде.", where: "Замковый холм" },
      sq_pests: { title: "Борьба с вредителями", story: "Сладости всё забредают на площадь. Проредите их — за это есть монеты, и так часто, как пожелаете." },
      sq_supplies: { title: "Запасы целителя", story: "Пополните мои полки травами, и я выделю вам тоник." },
      sq_nets: { title: "Починить сети", story: "Мои сети в лохмотьях. Принесите волокно, и я с вами поделюсь." },
      sq_forgefuel: { title: "Топливо для горна", story: "Горн жаждет кристалла. Накормите его и заберите этот клинок." },
      sq_relics: { title: "Испытания павших", story: "Докажите свою сталь против дикой стаи и заслужите мой старый оберег." },
      sq_wilds: { title: "Проредить дикарей", story: "За дикие сладости назначена постоянная награда — приносите подсчёт в любое время." },
    },
    chapter: {
      ch1: { title: "Долина в осаде", blurb: "Ответьте на зов Лугограда и заложите первый камень замка." },
      ch2: { title: "Камень и сталь", blurb: "Закалите ополчение и возведите крепостные стены." },
      ch3: { title: "Хрустальный прилив", blurb: "Дерзните в морские пещеры за Кристаллом башен." },
      ch4: { title: "Золотые врата", blurb: "Выкуйте Ключ от врат в огне Морозного перевала." },
      ch5: { title: "Печать дракона", blurb: "Завладейте Печатью дракона, увенчайте цитадель и покончите со зверем." },
    },
    story: {
      title: "Замок Лугограда",
      introTitle: "📜 Сказание о Лугограде",
      introText: "Давным-давно великий замок защищал эту долину — пока он не рухнул, и земли не наполнились живыми сладостями. " +
        "Вы — Лили, герой, о котором молился Лугоград. Соберите пять утраченных реликвий, возведите замок заново и " +
        "встретьте Древнего Дракона, что спит под цитаделью. " +
        "Следуйте за светящимися ❗ людьми и трекером заданий — каждое дело ведёт к следующему. Долина в ваших руках.",
      endingTitle: "🏰 Рассвет над долиной",
      endingText: "Древний Дракон повержен, и замок стоит увенчанный навстречу рассвету. Сладости разбегаются по диким землям, " +
        "жители Лугограда распахивают двери, и ваше имя воспевают от рощи до берега. Долина спасена — отлично, герой.",
    },
    weather: { clear: "Ясно", cloudy: "Облачно", fog: "Туман", rain: "Дождь", storm: "Гроза" },
    dragon: { name: "Древний Дракон" },
    // Skills, their schools (elements) and effect families (Task 14).
    skill: {
      firebolt: { name: "Веер огнезарядов", desc: "Метните веер из трёх огненных зарядов." },
      frost_nova: { name: "Морозная вспышка", desc: "Взрыв мороза, что бьёт и замедляет врагов рядом." },
      mend: { name: "Исцеление", desc: "Затяните раны, мгновенно восстановив здоровье." },
      war_focus: { name: "Боевой настрой", desc: "Соберитесь: больше силы и быстрее удары на время." },
      chain_spark: { name: "Цепная искра", desc: "Выпустите пробивающую бурю из пяти искр." },
      quake: { name: "Землетрясение", desc: "Ударьте оземь, сокрушая всё вокруг себя." },
      meteor: { name: "Метеор", desc: "Призовите метеор губительного огня." },
      soul_harvest: { name: "Жатва душ", desc: "Пожните врагов рядом, выпивая их суть ради исцеления." },
      tempest: { name: "Буря", desc: "Обрушьте бурю из семи пробивающих зарядов." },
      time_warp: { name: "Искажение времени", desc: "Согните время — бейте и двигайтесь куда быстрее." },
    },
    element: { arcane: "Чары", fire: "Огонь", frost: "Мороз", storm: "Гроза",
               nature: "Природа", shadow: "Тень", mixed: "Призма" },
    effect: { nova: "Вспышка", volley: "Залп", buff: "Аура", heal: "Исцеление" },
  };

  // =========================================================================
  // RUSSIAN GRAMMATICAL MORPHOLOGY (Task 24) — Android-style declensions,
  // gender & number agreement. Russian is heavily inflected: a noun dropped
  // into a sentence must take the case its verb/preposition governs, and the
  // verbs/adjectives that describe it must agree in gender + number. English
  // has none of this, so the whole layer collapses to identity for `en` (a
  // noun-ref there is just its plain English display name, and select/agree
  // pick the simple one/other forms). Everything here is a PURE function of
  // (lemma + metadata + case/number/gender) — no DOM, headless-safe.
  //
  // Model (per the task hint): a noun is `{ g, animate?, forms }`, where `g`
  // is gender ("m" | "f" | "n" | "pl" for pluralia-tantum like Стены/Башни)
  // and `forms` gives the six cases (nom/gen/dat/acc/ins/pre). Multi-word
  // adjective+noun names (zones, locations, bosses) are irregular, so they
  // carry EXPLICIT `forms`; simple single nouns (materials, relics) may omit
  // `forms` and fall back to `declineRegular`. A completeness test (mirroring
  // the untranslated-key gate) fails the build if an interpolated RU noun
  // lacks its gender/case metadata.
  // =========================================================================
  const CASES = ["nom", "gen", "dat", "acc", "ins", "pre"];
  const GENDERS = ["m", "f", "n", "pl"];

  // Rule-based decliner for a single REGULAR Russian noun (hard/soft stems).
  // Used as the fallback when an override form is absent, and directly for the
  // regular vocabulary (materials, relics). Returns the lemma unchanged for
  // patterns it doesn't recognise, so it never throws or blanks.
  function declineRegular(lemma, g, animate, gcase) {
    if (!lemma || gcase === "nom") return lemma;
    const low = lemma.toLowerCase();
    const last = low.slice(-1);
    const stem = lemma.slice(0, -1);
    if (g === "m") {
      // -й / -ь soft-stem masculine (Гамлорд is hard; король/камень are soft-ish).
      if (last === "й") {
        const s = stem;
        switch (gcase) {
          case "gen": return s + "я";
          case "dat": return s + "ю";
          case "acc": return animate ? s + "я" : lemma;
          case "ins": return s + "ем";
          case "pre": return s + "е";
        }
      }
      if (last === "ь") {
        // Soft masculine. Fugitive-vowel nouns in -ень drop the е before the
        // ending (Камень → Камн-); this regularises the common pattern. Genuine
        // irregulars still ship explicit forms and never reach here.
        let s = stem; // stem without the soft sign, e.g. "Камен"
        if (low.slice(-3) === "ень") s = stem.slice(0, -2) + "н"; // Камен → Камн
        switch (gcase) {
          case "gen": return s + "я";
          case "dat": return s + "ю";
          case "acc": return animate ? s + "я" : lemma;
          case "ins": return s + "ем";
          case "pre": return s + "е";
        }
      }
      // Hard-consonant masculine (Кристалл, Гамлорд…).
      switch (gcase) {
        case "gen": return lemma + "а";
        case "dat": return lemma + "у";
        case "acc": return animate ? lemma + "а" : lemma;
        case "ins": return lemma + "ом";
        case "pre": return lemma + "е";
      }
    }
    if (g === "f") {
      if (last === "а") {
        switch (gcase) {
          case "gen": return stem + "ы";
          case "dat": return stem + "е";
          case "acc": return stem + "у";
          case "ins": return stem + "ой";
          case "pre": return stem + "е";
        }
      }
      if (last === "я") {
        switch (gcase) {
          case "gen": return stem + "и";
          case "dat": return stem + "е";
          case "acc": return stem + "ю";
          case "ins": return stem + "ей";
          case "pre": return stem + "е";
        }
      }
      if (last === "ь") {
        switch (gcase) {
          case "gen": return stem + "и";
          case "dat": return stem + "и";
          case "acc": return lemma;
          case "ins": return stem + "ью";
          case "pre": return stem + "и";
        }
      }
    }
    if (g === "n") {
      if (last === "о") {
        switch (gcase) {
          case "gen": return stem + "а";
          case "dat": return stem + "у";
          case "acc": return lemma;
          case "ins": return stem + "ом";
          case "pre": return stem + "е";
        }
      }
      if (last === "е") {
        switch (gcase) {
          case "gen": return stem + "я";
          case "dat": return stem + "ю";
          case "acc": return lemma;
          case "ins": return stem + "ем";
          case "pre": return stem + "и";
        }
      }
    }
    return lemma; // pluralia-tantum / unknown pattern: caller supplies forms.
  }

  // Explicit case forms for the interpolated Russian nouns, grouped by the same
  // ids the data tables use. Multi-word names are irregular → full `forms`.
  // A material also carries `count` = { one, few, many } for count agreement in
  // "+{n} {label}" toasts (2 камня / 5 камней), and `acc` for "Gather {label}".
  const RU_NOUNS = {
    zone: {
      meadow: { g: "f", forms: { nom: "Долина Лугоград", gen: "Долины Лугоград", dat: "Долине Лугоград", acc: "Долину Лугоград", ins: "Долиной Лугоград", pre: "Долине Лугоград" }, loc: "в" },
      forest: { g: "f", forms: { nom: "Глубь Шепчущего леса", gen: "Глуби Шепчущего леса", dat: "Глуби Шепчущего леса", acc: "Глубь Шепчущего леса", ins: "Глубью Шепчущего леса", pre: "Глуби Шепчущего леса" }, loc: "в" },
      shore: { g: "n", forms: { nom: "Соляное побережье", gen: "Соляного побережья", dat: "Соляному побережью", acc: "Соляное побережье", ins: "Соляным побережьем", pre: "Соляном побережье" }, loc: "на" },
      peaks: { g: "f", forms: { nom: "Морозная тропа", gen: "Морозной тропы", dat: "Морозной тропе", acc: "Морозную тропу", ins: "Морозной тропой", pre: "Морозной тропе" }, loc: "на" },
      caverns: { g: "pl", forms: { nom: "Хрустальные пещеры", gen: "Хрустальных пещер", dat: "Хрустальным пещерам", acc: "Хрустальные пещеры", ins: "Хрустальными пещерами", pre: "Хрустальных пещерах" }, loc: "в" },
      thicket: { g: "f", forms: { nom: "Колючая чаща", gen: "Колючей чащи", dat: "Колючей чаще", acc: "Колючую чащу", ins: "Колючей чащей", pre: "Колючей чаще" }, loc: "в" },
    },
    location: {
      village: { g: "f", forms: { nom: "Деревня Лугоград", gen: "Деревни Лугоград", dat: "Деревне Лугоград", acc: "Деревню Лугоград", ins: "Деревней Лугоград", pre: "Деревне Лугоград" }, loc: "в" },
      apothecary: { g: "f", forms: { nom: "Аптека Лугограда", gen: "Аптеки Лугограда", dat: "Аптеке Лугограда", acc: "Аптеку Лугограда", ins: "Аптекой Лугограда", pre: "Аптеке Лугограда" }, loc: "в" },
      grove: { g: "f", forms: { nom: "Роща Шепчущего леса", gen: "Рощи Шепчущего леса", dat: "Роще Шепчущего леса", acc: "Рощу Шепчущего леса", ins: "Рощей Шепчущего леса", pre: "Роще Шепчущего леса" }, loc: "в" },
      seaside: { g: "m", forms: { nom: "Соляной берег", gen: "Соляного берега", dat: "Соляному берегу", acc: "Соляной берег", ins: "Соляным берегом", pre: "Соляном берегу" }, loc: "на" },
      mountain: { g: "m", forms: { nom: "Морозный перевал", gen: "Морозного перевала", dat: "Морозному перевалу", acc: "Морозный перевал", ins: "Морозным перевалом", pre: "Морозном перевале" }, loc: "на" },
      ruins: { g: "pl", forms: { nom: "Затонувшие руины", gen: "Затонувших руин", dat: "Затонувшим руинам", acc: "Затонувшие руины", ins: "Затонувшими руинами", pre: "Затонувших руинах" }, loc: "в" },
      castle: { g: "m", forms: { nom: "Замковый холм", gen: "Замкового холма", dat: "Замковому холму", acc: "Замковый холм", ins: "Замковым холмом", pre: "Замковом холме" }, loc: "на" },
    },
    castlePart: {
      foundation: { g: "n", forms: { nom: "Основание", gen: "Основания", dat: "Основанию", acc: "Основание", ins: "Основанием", pre: "Основании" } },
      walls: { g: "pl", forms: { nom: "Стены", gen: "Стен", dat: "Стенам", acc: "Стены", ins: "Стенами", pre: "Стенах" } },
      towers: { g: "pl", forms: { nom: "Башни", gen: "Башен", dat: "Башням", acc: "Башни", ins: "Башнями", pre: "Башнях" } },
      gate: { g: "f", forms: { nom: "Надвратная башня", gen: "Надвратной башни", dat: "Надвратной башне", acc: "Надвратную башню", ins: "Надвратной башней", pre: "Надвратной башне" } },
      keep: { g: "f", forms: { nom: "Цитадель", gen: "Цитадели", dat: "Цитадели", acc: "Цитадель", ins: "Цитаделью", pre: "Цитадели" } },
    },
    material: {
      wood: { g: "n", lemma: "Дерево", count: { one: "дерево", few: "дерева", many: "дерева" }, forms: { nom: "Дерево", acc: "Дерево", gen: "Дерева" } },
      stone: { g: "m", lemma: "Камень", count: { one: "камень", few: "камня", many: "камней" }, forms: { nom: "Камень", acc: "Камень", gen: "Камня" } },
      water: { g: "f", lemma: "Вода", count: { one: "вода", few: "воды", many: "воды" }, forms: { nom: "Вода", acc: "Воду", gen: "Воды" } },
      herb: { g: "f", lemma: "Трава", count: { one: "трава", few: "травы", many: "трав" }, forms: { nom: "Трава", acc: "Траву", gen: "Травы" } },
      fiber: { g: "n", lemma: "Волокно", count: { one: "волокно", few: "волокна", many: "волокон" }, forms: { nom: "Волокно", acc: "Волокно", gen: "Волокна" } },
      crystal: { g: "m", lemma: "Кристалл", count: { one: "кристалл", few: "кристалла", many: "кристаллов" }, forms: { nom: "Кристалл", acc: "Кристалл", gen: "Кристалла" } },
    },
    // Bosses are animate: одолеть + animate acc = genitive form; the verb
    // "повержен" agrees in gender. Names are multi-word → explicit forms.
    boss: {
      charger: { g: "m", animate: true, forms: { nom: "Желейный король", gen: "Желейного короля", acc: "Желейного короля", pre: "Желейном короле" } },
      caster: { g: "m", animate: true, forms: { nom: "Шоколадный властелин", gen: "Шоколадного властелина", acc: "Шоколадного властелина", pre: "Шоколадном властелине" } },
      summoner: { g: "m", animate: true, forms: { nom: "Леденцовый тиран", gen: "Леденцового тирана", acc: "Леденцового тирана", pre: "Леденцовом тиране" } },
      stomper: { g: "m", animate: true, forms: { nom: "Кексовый колосс", gen: "Кексового колосса", acc: "Кексового колосса", pre: "Кексовом колоссе" } },
      bomber: { g: "m", animate: true, forms: { nom: "Военачальник-карамель", gen: "Военачальника-карамель", acc: "Военачальника-карамель", pre: "Военачальнике-карамель" } },
      splitter: { g: "f", animate: true, forms: { nom: "Желатиновая гидра", gen: "Желатиновой гидры", acc: "Желатиновую гидру", pre: "Желатиновой гидре" } },
    },
    lairBoss: {
      caverns: { g: "m", animate: true, forms: { nom: "Подземельный Гамлорд", gen: "Подземельного Гамлорда", acc: "Подземельного Гамлорда", pre: "Подземельном Гамлорде" } },
      thicket: { g: "f", animate: true, forms: { nom: "Колючая Гидра", gen: "Колючей Гидры", acc: "Колючую Гидру", pre: "Колючей Гидре" } },
    },
    dragon: {
      ancient: { g: "m", animate: true, forms: { nom: "Древний Дракон", gen: "Древнего Дракона", dat: "Древнему Дракону", acc: "Древнего Дракона", ins: "Древним Драконом", pre: "Древнем Драконе" } },
    },
    // NPCs are animate proper names; "talk with {npc}" governs the instrumental
    // (Поговорите с Мэром Сливой). Only the cases actually used are provided;
    // the rest fall back to the nominative display name.
    npc: {
      mayor: { g: "m", animate: true, forms: { nom: "Мэр Слива", gen: "Мэра Сливы", dat: "Мэру Сливе", acc: "Мэра Сливу", ins: "Мэром Сливой", pre: "Мэре Сливе" } },
      alchemist: { g: "f", animate: true, forms: { nom: "Аптекарь Мириэль", gen: "Аптекаря Мириэль", dat: "Аптекарю Мириэль", acc: "Аптекаря Мириэль", ins: "Аптекарем Мириэль", pre: "Аптекаре Мириэль" } },
      herbalist: { g: "f", animate: true, forms: { nom: "Мудрая Ива", gen: "Мудрой Ивы", dat: "Мудрой Иве", acc: "Мудрую Иву", ins: "Мудрой Ивой", pre: "Мудрой Иве" } },
      fisher: { g: "m", animate: true, forms: { nom: "Старый Брин", gen: "Старого Брина", dat: "Старому Брину", acc: "Старого Брина", ins: "Старым Брином", pre: "Старом Брине" } },
      smith2: { g: "f", animate: true, forms: { nom: "Праматерь-кузнец Това", gen: "Праматери-кузнеца Товы", dat: "Праматери-кузнецу Тове", acc: "Праматерь-кузнеца Тову", ins: "Праматерью-кузнецом Товой", pre: "Праматери-кузнеце Тове" } },
      hermit: { g: "m", animate: true, forms: { nom: "Отшельник", gen: "Отшельника", dat: "Отшельнику", acc: "Отшельника", ins: "Отшельником", pre: "Отшельнике" } },
    },
    relic: {
      relic_foundation: { g: "m", forms: { nom: "Камень основания", gen: "Камня основания", dat: "Камню основания", acc: "Камень основания", ins: "Камнем основания", pre: "Камне основания" } },
      relic_walls: { g: "pl", forms: { nom: "Руны стен", gen: "Рун стен", dat: "Рунам стен", acc: "Руны стен", ins: "Рунами стен", pre: "Рунах стен" } },
      relic_towers: { g: "m", forms: { nom: "Кристалл башен", gen: "Кристалла башен", dat: "Кристаллу башен", acc: "Кристалл башен", ins: "Кристаллом башен", pre: "Кристалле башен" } },
      relic_gate: { g: "m", forms: { nom: "Ключ от золотых врат", gen: "Ключа от золотых врат", dat: "Ключу от золотых врат", acc: "Ключ от золотых врат", ins: "Ключом от золотых врат", pre: "Ключе от золотых врат" } },
      relic_keep: { g: "f", forms: { nom: "Печать дракона", gen: "Печати дракона", dat: "Печати дракона", acc: "Печать дракона", ins: "Печатью дракона", pre: "Печати дракона" } },
    },
  };

  // Resolve one grammatical form of a noun-metadata entry: explicit override →
  // regular-noun decliner (from `lemma`) → nominative → "".
  function ruForm(meta, gcase) {
    if (!meta) return "";
    const c = gcase || "nom";
    if (meta.forms && meta.forms[c] != null) return meta.forms[c];
    const base = meta.lemma || (meta.forms && meta.forms.nom) || "";
    if (c === "nom") return base;
    return declineRegular(base, meta.g, !!meta.animate, c);
  }

  // ICU-style gender/number `select`: pick the form for a grammatical gender
  // ("m"/"f"/"n"/"pl"). English callers pass a single string (or {other}) and
  // get it back unchanged, so shared templates stay simple. Russian: agreement
  // verbs/adjectives, e.g. select("f", { m:"возведён", f:"возведена",
  // n:"возведено", pl:"возведены" }).
  function select(gender, forms) {
    if (typeof forms === "string") return forms;
    if (I18N.locale !== "ru") return forms.other != null ? forms.other : (forms.m != null ? forms.m : forms.n);
    if (forms[gender] != null) return forms[gender];
    return forms.m != null ? forms.m : (forms.n != null ? forms.n : (forms.other || ""));
  }

  // Number agreement for count nouns — an alias of `plural()` named for the
  // "{n} <thing>" call sites (2 камня / 5 камней). English: one/other.
  function agree(n, forms) { return plural(n, forms); }

  // A locale-aware reference to a data-table noun. The call site passes the
  // already-resolved *display name* (English in `en` mode, the RU nominative in
  // `ru` mode — from the existing tZoneName/tLairBossName/… resolvers), plus the
  // (group,id) so interp() can look up the RU case forms. In English, interp
  // substitutes the display name and ignores any `:case` tag; in Russian it
  // declines via the metadata. Falls back to the display name if the noun has
  // no morphology entry, so nothing ever blanks.
  function nounRef(group, id, display) {
    const meta = RU_NOUNS[group] && RU_NOUNS[group][id];
    return { __noun: true, group, id, meta: meta || null, en: display != null ? display : "", g: meta ? meta.g : null };
  }
  // Directly decline a data-table noun to a case string (for non-template use);
  // `display` is the resolved name used as the English/non-metadata fallback.
  function declineNoun(group, id, gcase, display) {
    if (I18N.locale === "ru") {
      const meta = RU_NOUNS[group] && RU_NOUNS[group][id];
      if (meta) return ruForm(meta, gcase);
    }
    return display != null ? display : "";
  }
  // The gender of a data-table noun (for select()-based agreement at call sites).
  function nounGender(group, id) {
    const meta = RU_NOUNS[group] && RU_NOUNS[group][id];
    return meta ? meta.g : "m";
  }

  // {placeholder} interpolation with optional grammatical case tags. A plain
  // {x} substitutes params.x as before (backward-compatible). A tagged
  // {x:case} (case ∈ nom/gen/dat/acc/ins/pre) declines the param when it is a
  // noun-ref (RU) — otherwise it substitutes the value and drops the tag, so an
  // English template written as {name} and a Russian one as {name:acc} share
  // the same param. Missing params are left intact so a bad key stays visible.
  function interp(s, p) {
    return s.replace(/\{(\w+)(?::(\w+))?\}/g, (m, k, gcase) => {
      if (!p || p[k] == null) return m;
      const v = p[k];
      if (v && typeof v === "object" && v.__noun) {
        if (I18N.locale === "ru" && v.meta) return ruForm(v.meta, gcase || "nom");
        return v.en != null ? String(v.en) : "";
      }
      return String(v);
    });
  }
  // The core lookup: current locale → English fallback → the key itself.
  function t(key, params) {
    const L = LOCALES[I18N.locale] || LOCALES.en;
    let s = (L && L[key] != null) ? L[key] : LOCALES.en[key];
    if (s == null) s = key;
    return (params && typeof s === "string") ? interp(s, params) : s;
  }
  // Pick a plural form. English: one/other; Russian: one/few/many by the usual
  // Slavic rule. `forms` is e.g. { one, few, many } (or { one, other } for en).
  function plural(n, forms) {
    if (I18N.locale === "ru") {
      const a = n % 10, b = n % 100;
      if (a === 1 && b !== 11) return forms.one;
      if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return forms.few != null ? forms.few : forms.many;
      return forms.many != null ? forms.many : forms.one;
    }
    return n === 1 ? forms.one : (forms.other != null ? forms.other : forms.many);
  }

  // ---- Data-table resolvers (RU override → English table field) -------------
  const _ruGroup = (g) => (I18N.locale === "ru" && RU[g]) ? RU[g] : null;
  function tField(group, id, field, fallback) {
    const g = _ruGroup(group); const e = g && g[id];
    return (e && e[field] != null) ? e[field] : fallback;
  }
  function tFlat(group, id, fallback) {
    const g = _ruGroup(group);
    return (g && g[id] != null) ? g[id] : fallback;
  }
  const tItemName = (d) => d ? tField("item", d.id, "name", d.name) : "";
  const tItemDesc = (d) => d ? tField("item", d.id, "desc", d.desc || "") : "";
  const tPotionLabel = (id) => {
    const d = getDef(id); const base = (d && d.potion && d.potion.label) || (d && d.name) || id;
    return tField("item", id, "label", base);
  };
  const tRarityLabel = (r) => tFlat("rarity", r, (RARITY[r] || RARITY.normal).label);
  const tSlotLabel = (slot) => tFlat("slot", (slot === "ring1" || slot === "ring2") ? "ring" : slot, (SLOT_META[slot] || {}).label || slot);
  const tAffixLabel = (id) => tFlat("affix", id, (AFFIXES[id] || {}).label || id);
  const tSetName = (id) => tFlat("set", id, (SETS[id] || {}).name || id);
  // Skills (Task 14): leveled/boss skills resolve through the `skill` group; a
  // FUSED skill's name/desc is composed from i18n element + effect labels (it
  // has no static dictionary entry, since it's generated at runtime).
  const tElementLabel = (id) => tFlat("element", id, (ELEMENTS[id] || ELEMENTS.arcane).label);
  const tEffectLabel = (id) => tFlat("effect", id, (EFFECTS[id] || {}).label || id);
  const tSkillName = (def) => {
    if (!def) return "";
    if (def.generated) return t("skills.fusedName", { effect: tEffectLabel(def.effect), element: tElementLabel(def.element) });
    return tField("skill", def.id, "name", def.name || def.id);
  };
  const tSkillDesc = (def) => {
    if (!def) return "";
    if (def.generated) return t("skills.fusedDesc", { element: tElementLabel(def.element), n: (def.parts || []).length });
    return tField("skill", def.id, "desc", def.desc || "");
  };
  const tMaterialLabel = (id) => tFlat("material", id, (MATERIALS[id] || {}).label || id);
  const tResourceLabel = (k) => tFlat("resource", k, (RESOURCE_KINDS[k] || {}).label || k);
  const tRelicName = (id) => tField("relic", id, "name", (RELICS[id] || {}).name || id);
  const tCastlePartName = (id) => tField("castlePart", id, "name", (CASTLE_PART_BY_ID[id] || {}).name || id);
  const tCastlePartDesc = (id) => tField("castlePart", id, "desc", (CASTLE_PART_BY_ID[id] || {}).desc || "");
  const tZoneName = (z) => z ? tFlat("zone", z.id, z.name) : "";
  const tLocationName = (id) => tFlat("location", id, (LOCATION_BY_ID[id] || {}).name || id);
  const tNpcName = (id) => tField("npc", id, "name", (NPC_BY_ID[id] || {}).name || id);
  const tNpcIntro = (id) => tField("npc", id, "intro", (NPC_BY_ID[id] || {}).intro || "");
  const tQuestTitle = (q) => tField("quest", q.id, "title", q.title);
  const tQuestStory = (q) => tField("quest", q.id, "story", q.story);
  const tQuestWhere = (q) => q.where ? tField("quest", q.id, "where", q.where) : "";
  const tChapterTitle = (id) => tField("chapter", id, "title", (CHAPTER_BY_ID[id] || {}).title || id);
  const tChapterBlurb = (id) => tField("chapter", id, "blurb", (CHAPTER_BY_ID[id] || {}).blurb || "");
  const tDragonName = () => (I18N.locale === "ru" && RU.dragon) ? RU.dragon.name : "Ancient Dragon";
  const _ruStory = (field) => (I18N.locale === "ru" && RU.story && RU.story[field] != null) ? RU.story[field] : null;
  const tStoryTitle = () => _ruStory("title") || STORY.title;
  const tStoryIntroTitle = () => _ruStory("introTitle") || STORY.intro.title;
  const tStoryIntroText = () => _ruStory("introText") || STORY.intro.text;
  const tStoryEndingTitle = () => _ruStory("endingTitle") || STORY.ending.title;
  const tStoryEndingText = () => _ruStory("endingText") || STORY.ending.text;
  // The lair-boss name comes from the zone table (English) with an RU override.
  const tLairBossName = (zoneId) => {
    const z = ZONE_BY_ID[zoneId]; const base = (z && z.boss) ? z.boss.name : t("obj.lairBoss");
    return tFlat("lairBoss", zoneId, base);
  };
  const tLairBossIntro = (zoneId) => {
    const z = ZONE_BY_ID[zoneId]; const base = (z && z.boss) ? z.boss.intro : "";
    return tFlat("lairIntro", zoneId, base);
  };

export {
  I18N, LOCALES, LOCALE_KEY, RU, RU_NOUNS, CASES, GENDERS, _ruGroup, _ruStory, interp,
  declineRegular, ruForm, select, agree, nounRef, declineNoun, nounGender,
  localGet, localSet, plural, t,
  tCastlePartDesc, tCastlePartName, tChapterBlurb, tChapterTitle, tDragonName, tField, tFlat,
  tItemDesc, tItemName, tLairBossIntro, tLairBossName, tLocationName, tMaterialLabel,
  tNpcIntro, tNpcName, tPotionLabel, tQuestStory, tQuestTitle, tQuestWhere, tRarityLabel,
  tRelicName, tResourceLabel, tSlotLabel, tAffixLabel, tSetName, tStoryEndingText, tStoryEndingTitle,
  tStoryIntroText, tStoryIntroTitle, tStoryTitle, tZoneName,
  tElementLabel, tEffectLabel, tSkillName, tSkillDesc,
};
