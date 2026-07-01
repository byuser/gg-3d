# Task 24 — Russian grammatical morphology (Android-style declensions, gender & plural agreement)

> Part of the [Good Game 3D backlog](../TODO.md). Shared rules + Definition of Done live there.
- **Status:** `[x]` — 2026-07-01 · Added an Android-/ICU-style morphology layer to `src/core/i18n.js`:
  a declension model (`RU_NOUNS`: gender m/f/n/pl + animacy + explicit six-case forms for every
  interpolated noun — zones, landmarks, NPCs, materials, relics, castle parts, bosses, dragon) with a
  rule-based `declineRegular` fallback (animate-accusative + `-ень` fugitive vowel); case-aware
  `interp()` that declines a `nounRef` on a `{name:gen}`-style tag in RU and substitutes the plain
  English name in EN (plain `{x}` unchanged); an ICU-style `select()` for gender/number agreement
  (возведён/возведена/возведено/возведены) and a strengthened Slavic `plural()`/`agree()` now backing
  **every** count string (2 камня / 5 камней). Retrofitted the affected RU strings — objectives
  (reach→gen, gather→acc, talk→ins, defeat-boss→acc+pre, build→acc), toasts (gathered / part-raised /
  reached / boss-defeated), the guidance/quest-log givers (dat/ins) + places (pre with в/на), and the
  map compass portal (в/на + acc). New `test/i18n-morphology.test.js` [33 cases] (decliner × six cases,
  agreement, the one/few/many boundaries 1/2/5/11/21/112, case-aware interp, a noun-metadata
  completeness gate, a retrofit smoke) + strengthened the [28] i18n harness; Vitest **335 → 368**.
  English path unchanged (collapses to identity); no `SAVE_VERSION` change.
- **Depends on:** Task 7 (the i18n layer — `LOCALES` / `t()` / `interp()` /
  `plural()` in `src/core/i18n.js`, the `RU` data-table dictionary + resolvers).
  None else.
- **Goal.** The Russian localization is **grammatically flat**: every string is
  hand-written and every interpolated noun (`{name}`, `{label}`, `{boss}`,
  `{zone}`, `{part}`, …) is dropped in its **nominative** form regardless of the
  surrounding sentence's grammatical case, and adjectives/verbs don't agree in
  **gender/number**. Russian is heavily inflected — "Reach {name}", "Gather
  {label}", "Bought {name}", "Defeat {boss} in {zone}", "{n} parts raised" all need
  the noun in the right **case** (and the verb/adjective to **agree**), or the text
  reads broken to a native speaker. Build a proper morphology layer — the way
  well-localized RPGs and **Android apps** do it (Android `<plurals>` quantity
  strings + ICU `MessageFormat` `select` / `plural` / gender) — so Russian sentences
  are grammatically correct, not just word-substituted.
- **Scope (build this):**
  - **A declension model for in-game nouns.** Give every interpolated Russian noun
    (item / zone / landmark / NPC / material / relic / skill / boss names) the
    grammatical metadata it needs: **gender** (m/f/n), animacy, and either explicit
    **case forms** (nominative / genitive / dative / accusative / instrumental /
    prepositional, singular + plural) or a small **rule-based decliner** for regular
    nouns with an explicit-override table for irregulars. Store this alongside the
    existing `RU` dictionary in `src/core/i18n.js` (additive — the English source
    stays untouched).
  - **Case-aware interpolation.** Extend the i18n core so a template can request a
    noun in a specific case — e.g. `t("obj.reach", { name: nounRef("zone", id) })`
    resolving a `{name:accusative}`-style marker, with the resolver returning the
    correctly inflected form. Keep `interp()` backward-compatible (plain `{x}` still
    works); layer the grammar on top.
  - **Gender/number agreement.** Make adjectives and past-tense verbs that describe
    a noun **agree** with its gender/number (e.g. "{part} raised" → возведён /
    возведена / возведено / возведены). Provide an ICU-style **`select`** (by
    gender) and a strengthened **`plural`** (the existing `plural()` already does
    Slavic one/few/many — extend its reach so **all** count strings use it, not just
    `castle.partWord`, which is currently the only call site).
  - **Retrofit the affected strings.** Sweep every RU string that interpolates a
    noun or a count and route it through the new case/agreement helpers (objectives,
    toasts like `toast.bought` / `toast.gathered` / `toast.reached`, dialogue, quest
    text, the map compass, boss banners). English is unaffected (its `select` /
    `plural` collapse to the simple forms).
  - **Pure + testable + headless-safe.** The decliner/agreement helpers are pure
    functions of (lemma + metadata + case/number/gender); no DOM. English path
    unchanged.
- **Acceptance criteria:**
  - Interpolated Russian nouns appear in the **correct grammatical case** for their
    sentence, and adjectives/verbs **agree** in gender/number — verified by a
    native-correct sample set across objectives, toasts, dialogue and the map.
  - Count strings use proper Slavic **one/few/many** everywhere (not only the castle
    counter); English still reads correctly (one/other).
  - EN⇄RU still toggles live, persists, and the **key-parity + data-completeness
    tests stay green** (now also covering the new case/gender metadata — no noun may
    ship without it in RU).
  - Headless-safe; full pipeline green; no English leaks in RU and vice-versa.
- **Tests to add:** unit tests for the **decliner / agreement** helpers (regular +
  irregular nouns across all six cases × number; gender agreement for a sample of
  adjectives/verbs); the strengthened `plural()` over 0–1000 hitting the one/few/many
  boundaries (1, 2, 5, 11, 21, 112…); a **completeness test** that every interpolated
  RU noun has the required gender + case data (fails the build otherwise, mirroring
  the existing untranslated-key gate); a retrofit smoke that key sentences render
  grammatically in RU.
- **Files:** `src/core/i18n.js` (new morphology metadata on `RU`, the decliner +
  agreement + ICU-style `select`, extended `interp` / `plural` / `t`, retrofit
  resolvers), `src/game.js` (call sites that interpolate nouns/counts now pass
  grammatical refs), `test/harness.test.js` (the i18n suite [28]) or a new
  `test/i18n-morphology.test.js`, `README.md` (i18n section). No `SAVE_VERSION`
  change.
- **Out of scope:** a full general-purpose Russian NLP morphology engine (cover the
  game's vocabulary with rules + an override table, not every Russian word); adding
  new locales (EN+RU only); machine translation.
- **Hints:** model nouns as `{ lemma, gender, animate, forms?: { nom, gen, dat, acc,
  ins, pre, … } }` with a regular-noun fallback decliner; keep English collapsing to
  identity so the shared templates stay simple; extend the existing `plural()` rather
  than replacing it.

**Worn-equipment appearance + combat-animation overhaul (Tasks 25–35) — the
per-category breakdown.** Today equipped gear shows on Lily as **single-colour
primitive blobs**: every helmet is the same dome + brim, every chest the same
cylinder, every part tinted only by rarity colour (`_buildWornGear` /
`refreshWornGear`, `src/game.js` ~1175-1275 — flat `mat` / `emat` materials, **no
per-item shape**), and combat is the **one `Swing` arc** from Task 5. This family
reworks **how each equipment category looks when worn on the character** and
**rewrites the weapon firing + attack animations from scratch**, to the readability
of a real MMORPG. Per the request it is split **one task per equipment category** so
each ships + merges independently. **Shared bar for every worn-gear task (25–33):**
build the part **procedurally** (no large binaries — the published site stays static,
Golden Rules 1 & 6) but give **each item def a distinct silhouette** (shape varies by
item type / material / set, not just a rarity tint); recolour + sheen by **rarity**
(reuse the Task 12 `paint()` rule) and add a **set** motif (Ironguard / Dragonscale);
**tier-gate** detail via `wornDetailFor`; attach to the correct body segment and
**animate with the character** (and the Task 34 attacks); **dispose on teardown /
re-equip** (no leaks); stay **headless-safe** (feature-detect Babylon); and **clip
cleanly** for that part (no poke-through of the body or neighbours — the full-loadout
integration is **Task 35**). Each task adds a **real-browser screenshot** for its
category + a unit test for its pure shape/spec helper, and needs **no save-schema
change** (visuals/animation are transient).

