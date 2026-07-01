// Task 24 — Russian grammatical morphology. Locks in the declension model for
// interpolated in-game nouns (gender/animacy + six cases × number), the ICU-style
// gender/number `select()` agreement, the strengthened Slavic `plural()`/`agree()`
// over the one/few/many boundaries, the case-aware `interp()` (a noun-ref declines
// in RU and collapses to the plain English name in EN), a completeness gate that
// every interpolated RU noun ships its gender+case metadata, and a retrofit smoke
// that key RU sentences render grammatically. English is unaffected (identity).
import { describe, it, expect, afterEach, afterAll } from "vitest";
import "../src/game.js";

const T = globalThis.window.__GG_TEST__;

// The suite toggles the locale; every case restores English afterwards so it
// can't leak into the other test files (Vitest runs them in one shared thread).
afterEach(() => { T.I18N.locale = "en"; });
afterAll(() => { T.I18N.locale = "en"; });

// Decline a single regular noun through all six cases in Russian.
function ruDecline(lemma, g, animate) {
  T.I18N.locale = "ru";
  const out = {};
  for (const c of T.CASES) out[c] = T.declineRegular(lemma, g, animate, c);
  return out;
}

describe("Task 24 — the rule-based decliner (regular nouns, six cases)", () => {
  it("declines a hard-consonant masculine inanimate (Кристалл)", () => {
    expect(ruDecline("Кристалл", "m", false)).toEqual({
      nom: "Кристалл", gen: "Кристалла", dat: "Кристаллу",
      acc: "Кристалл", ins: "Кристаллом", pre: "Кристалле",
    });
  });

  it("applies the animate-accusative rule (acc = gen) for an animate masculine (Дракон)", () => {
    const d = ruDecline("Дракон", "m", true);
    expect(d.acc).toBe("Дракона");
    expect(d.acc).toBe(d.gen); // animate: accusative borrows the genitive
    expect(d.ins).toBe("Драконом");
  });

  it("keeps the accusative = nominative for an inanimate masculine", () => {
    const d = ruDecline("Кристалл", "m", false);
    expect(d.acc).toBe(d.nom);
  });

  it("handles the -ень fugitive vowel (Камень → Камн-)", () => {
    expect(ruDecline("Камень", "m", false)).toEqual({
      nom: "Камень", gen: "Камня", dat: "Камню",
      acc: "Камень", ins: "Камнем", pre: "Камне",
    });
  });

  it("declines a feminine -а noun (Трава)", () => {
    expect(ruDecline("Трава", "f", false)).toEqual({
      nom: "Трава", gen: "Травы", dat: "Траве",
      acc: "Траву", ins: "Травой", pre: "Траве",
    });
  });

  it("declines a neuter -о noun (Волокно)", () => {
    expect(ruDecline("Волокно", "n", false)).toEqual({
      nom: "Волокно", gen: "Волокна", dat: "Волокну",
      acc: "Волокно", ins: "Волокном", pre: "Волокне",
    });
  });

  it("returns the lemma unchanged for the nominative and for unknown patterns", () => {
    T.I18N.locale = "ru";
    expect(T.declineRegular("Стены", "pl", false, "gen")).toBe("Стены"); // pluralia-tantum: caller supplies forms
    expect(T.declineRegular("Кристалл", "m", false, "nom")).toBe("Кристалл");
    expect(T.declineRegular("", "m", false, "gen")).toBe("");
  });
});

describe("Task 24 — explicit case-form overrides (irregular / multi-word nouns)", () => {
  it("uses the override table for irregular genitives, not the naive rule", () => {
    // The regular rule would give "Каменя"; the override ships the correct
    // fugitive-vowel form.
    expect(T.ruForm(T.RU_NOUNS.material.stone, "gen")).toBe("Камня");
    expect(T.ruForm(T.RU_NOUNS.relic.relic_foundation, "gen")).toBe("Камня основания");
  });

  it("declines multi-word adjective+noun zone names across cases", () => {
    const caverns = T.RU_NOUNS.zone.caverns; // pluralia-tantum "Хрустальные пещеры"
    expect(T.ruForm(caverns, "pre")).toBe("Хрустальных пещерах");
    expect(T.ruForm(caverns, "acc")).toBe("Хрустальные пещеры");
    const peaks = T.RU_NOUNS.zone.peaks; // feminine "Морозная тропа"
    expect(T.ruForm(peaks, "gen")).toBe("Морозной тропы");
    expect(T.ruForm(peaks, "acc")).toBe("Морозную тропу");
  });

  it("falls back through override → decliner → nominative → empty", () => {
    expect(T.ruForm(null, "gen")).toBe("");
    // material.wood has acc/gen overrides but no dat → decliner fills it from lemma
    expect(T.ruForm(T.RU_NOUNS.material.wood, "dat")).toBe("Дереву");
  });
});

describe("Task 24 — gender/number agreement via select()", () => {
  const RAISED = { m: "возведён", f: "возведена", n: "возведено", pl: "возведены" };

  it("picks the agreeing verb form for each grammatical gender in Russian", () => {
    T.I18N.locale = "ru";
    expect(T.select("m", RAISED)).toBe("возведён");
    expect(T.select("f", RAISED)).toBe("возведена");
    expect(T.select("n", RAISED)).toBe("возведено");
    expect(T.select("pl", RAISED)).toBe("возведены");
  });

  it("agrees a sample of adjectives/verbs with the actual castle-part genders", () => {
    T.I18N.locale = "ru";
    const g = (id) => T.nounGender("castlePart", id);
    expect(T.select(g("foundation"), RAISED)).toBe("возведено"); // Основание (n)
    expect(T.select(g("gate"), RAISED)).toBe("возведена");       // Надвратная башня (f)
    expect(T.select(g("walls"), RAISED)).toBe("возведены");      // Стены (pl)
    expect(T.select(g("keep"), RAISED)).toBe("возведена");       // Цитадель (f)
  });

  it("collapses to the English form (identity / other) outside Russian", () => {
    T.I18N.locale = "en";
    expect(T.select("f", { other: "raised", f: "возведена" })).toBe("raised");
    expect(T.select("f", "raised")).toBe("raised"); // a plain string passes through
  });
});

describe("Task 24 — strengthened Slavic plural()/agree() across the boundaries", () => {
  const ru = { one: "камень", few: "камня", many: "камней" };
  const en = { one: "stone", other: "stones" };

  it("picks one/few/many correctly over a full 0–1000 sweep (Russian)", () => {
    T.I18N.locale = "ru";
    const pick = (n) => T.agree(n, ru);
    // one: n%10==1 and n%100!=11
    for (const n of [1, 21, 31, 101, 121, 1001]) expect(pick(n)).toBe("камень");
    // few: n%10 in 2..4 and n%100 not in 12..14
    for (const n of [2, 3, 4, 22, 23, 24, 102, 104, 1002]) expect(pick(n)).toBe("камня");
    // many: everything else, incl. the 11–14 teens exception
    for (const n of [0, 5, 6, 9, 10, 11, 12, 13, 14, 15, 25, 100, 111, 112, 113, 114, 1000]) expect(pick(n)).toBe("камней");
  });

  it("teens 11–14 are always 'many' even though their last digit is 1–4", () => {
    T.I18N.locale = "ru";
    expect(T.agree(11, ru)).toBe("камней");
    expect(T.agree(12, ru)).toBe("камней");
    expect(T.agree(14, ru)).toBe("камней");
    expect(T.agree(112, ru)).toBe("камней");
  });

  it("English uses one/other (agree is an alias of plural)", () => {
    T.I18N.locale = "en";
    expect(T.agree(1, en)).toBe("stone");
    expect(T.agree(2, en)).toBe("stones");
    expect(T.agree(11, en)).toBe("stones");
    expect(T.plural(1, en)).toBe(T.agree(1, en));
  });
});

describe("Task 24 — case-aware interpolation (noun-refs)", () => {
  it("declines a noun-ref to the tagged case in Russian", () => {
    T.I18N.locale = "ru";
    const ref = T.nounRef("zone", "meadow", "Meadow Vale");
    expect(T.t("obj.reach", { name: ref })).toBe("Дойдите до Долины Лугоград");
  });

  it("substitutes the plain English display name (ignoring the case tag) in English", () => {
    T.I18N.locale = "en";
    const ref = T.nounRef("zone", "meadow", "Meadow Vale");
    expect(T.t("obj.reach", { name: ref })).toBe("Reach Meadow Vale");
  });

  it("keeps plain {x} interpolation backward-compatible (no tag, no noun-ref)", () => {
    T.I18N.locale = "en";
    expect(T.t("toast.coinPickup", { n: 7 })).toBe("🪙 +7");
    T.I18N.locale = "ru";
    expect(T.t("toast.coinPickup", { n: 7 })).toBe("🪙 +7");
  });

  it("leaves an unresolved placeholder intact so a bad key stays visible", () => {
    T.I18N.locale = "ru";
    expect(T.t("obj.reach", {})).toBe("Дойдите до {name:gen}");
  });

  it("falls back to the display name for a noun that has no morphology entry", () => {
    T.I18N.locale = "ru";
    const ref = T.nounRef("zone", "no_such_zone", "Nowhere");
    expect(T.t("obj.reach", { name: ref })).toBe("Дойдите до Nowhere");
  });

  it("declineNoun() resolves a case string directly (RU) or the display name (EN)", () => {
    T.I18N.locale = "ru";
    expect(T.declineNoun("zone", "caverns", "pre", "Crystal Caverns")).toBe("Хрустальных пещерах");
    T.I18N.locale = "en";
    expect(T.declineNoun("zone", "caverns", "pre", "Crystal Caverns")).toBe("Crystal Caverns");
  });
});

describe("Task 24 — completeness: every interpolated RU noun has gender + case metadata", () => {
  // Mirrors the untranslated-key gate: fail the build if an interpolated noun
  // ships without the grammar the retrofit sentences need. Each group lists the
  // ids that are dropped into a case-governed RU sentence and the cases required.
  const REQUIRED = {
    zone: { ids: () => T.ZONES.map((z) => z.id), cases: ["gen", "acc", "pre"], prep: true },
    location: { ids: () => Object.keys(T.RU_NOUNS.location), cases: ["gen", "pre"], prep: true },
    castlePart: { ids: () => T.CASTLE_PARTS.map((p) => p.id), cases: ["acc"], gender: true },
    material: { ids: () => T.MATERIAL_IDS, cases: ["acc"], count: true },
    npc: { ids: () => T.NPC_DATA.map((n) => n.id), cases: ["dat", "ins"] },
    boss: { ids: () => T.BOSS_ARCHES.map((a) => a.id), cases: ["acc"], gender: true },
    lairBoss: { ids: () => ["caverns", "thicket"], cases: ["acc"], gender: true },
    relic: { ids: () => Object.keys(T.RELICS), cases: ["gen", "acc"] },
    dragon: { ids: () => ["ancient"], cases: ["acc"], gender: true },
  };

  it("provides gender for every interpolated noun", () => {
    const gaps = [];
    for (const group in REQUIRED) {
      for (const id of REQUIRED[group].ids()) {
        const meta = T.RU_NOUNS[group] && T.RU_NOUNS[group][id];
        if (!meta) { gaps.push(`${group}.${id} (missing)`); continue; }
        if (!T.GENDERS.includes(meta.g)) gaps.push(`${group}.${id}.gender`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("provides every required case form for every interpolated noun", () => {
    const gaps = [];
    for (const group in REQUIRED) {
      const spec = REQUIRED[group];
      for (const id of spec.ids()) {
        const meta = T.RU_NOUNS[group] && T.RU_NOUNS[group][id];
        if (!meta) { gaps.push(`${group}.${id} (missing)`); continue; }
        for (const c of spec.cases) {
          const form = T.ruForm(meta, c);
          if (!form) gaps.push(`${group}.${id}.${c}`);
        }
        if (spec.prep && !(meta.loc === "в" || meta.loc === "на")) gaps.push(`${group}.${id}.loc`);
        if (spec.count && !(meta.count && meta.count.one && meta.count.few && meta.count.many)) gaps.push(`${group}.${id}.count`);
      }
    }
    expect(gaps).toEqual([]);
  });

  it("declines every interpolated noun in every case without throwing or blanking", () => {
    T.I18N.locale = "ru";
    for (const group in T.RU_NOUNS) {
      for (const id in T.RU_NOUNS[group]) {
        const meta = T.RU_NOUNS[group][id];
        for (const c of T.CASES) {
          const form = T.ruForm(meta, c);
          expect(typeof form).toBe("string");
          expect(form.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe("Task 24 — retrofit smoke: key RU sentences render grammatically", () => {
  it("objectives take the noun in the case their verb/preposition governs", () => {
    T.I18N.locale = "ru";
    // reach → до + genitive
    expect(T.Quests.objectiveText(T.QUEST_BY_ID.m_cornerstone)).toContain("Дойдите до"); // reach the ruins
    // defeat_boss → одолеть + animate accusative, в + prepositional
    const bossLine = T.Quests.objectiveText(T.QUEST_BY_ID.m_caverns);
    expect(bossLine).toContain("Подземельного Гамлорда"); // accusative (animate)
    expect(bossLine).toContain("Хрустальных пещерах");     // prepositional
    // build → возвести + accusative
    expect(T.Quests.objectiveText(T.QUEST_BY_ID.m_walls)).toContain("Возведите Стены");
    // gather → собрать + accusative (an icon sits between the verb and noun)
    expect(T.Quests.objectiveText(T.QUEST_BY_ID.m_poultice)).toMatch(/Соберите .*Траву/);
    // talk → поговорить с + instrumental
    expect(T.Quests.objectiveText(T.QUEST_BY_ID.m_word)).toContain("Мэром Сливой");
  });

  it("'{part} raised' toasts agree the verb with the part's gender/number", () => {
    T.I18N.locale = "ru";
    const raised = (id) => T.t("toast.partRaised", {
      part: T.nounRef("castlePart", id, T.tCastlePartName(id)),
      verb: T.select(T.nounGender("castlePart", id), T.AGREE_RAISED),
    });
    expect(raised("foundation")).toBe("🏰 Основание возведено!");
    expect(raised("gate")).toBe("🏰 Надвратная башня возведена!");
    expect(raised("walls")).toBe("🏰 Стены возведены!");
  });

  it("'{n} {material}' gather toasts count-agree the material noun", () => {
    T.I18N.locale = "ru";
    expect(T.materialLabel("stone", 1)).toBe("камень");
    expect(T.materialLabel("stone", 2)).toBe("камня");
    expect(T.materialLabel("stone", 5)).toBe("камней");
    expect(T.t("toast.gathered", { icon: "🪨", n: 2, label: T.materialLabel("stone", 2) })).toBe("🪨 +2 камня");
    expect(T.t("toast.gathered", { icon: "🪨", n: 5, label: T.materialLabel("stone", 5) })).toBe("🪨 +5 камней");
  });

  it("the map compass sends the player 'to' a zone in the accusative with в/на", () => {
    T.I18N.locale = "ru";
    const line = T.t("map.compassPortal", {
      kind: T.t("portalKind.cave"),
      prep: T.zonePrep("caverns"),
      zone: T.nounRef("zone", "caverns", T.tZoneName(T.ZONE_BY_ID.caverns)),
      dist: 40,
    });
    expect(line).toBe("Идите через пещеру в Хрустальные пещеры · 40м");
    // "на" zones (the frostpeak trail) take the right preposition
    const peaksLine = T.t("map.compassPortal", {
      kind: T.t("portalKind.path"), prep: T.zonePrep("peaks"),
      zone: T.nounRef("zone", "peaks", T.tZoneName(T.ZONE_BY_ID.peaks)), dist: 12,
    });
    expect(peaksLine).toContain("на Морозную тропу");
  });

  it("guidance declines the giver (dative/instrumental) and the place (prepositional)", () => {
    T.I18N.locale = "ru";
    // Story.giverRef / npcPlaceRef feed the retrofit templates.
    const dat = T.t("guide.turnin", { icon: "🧙", giver: T.nounRef("npc", "mayor", "Mayor Plum") });
    expect(dat).toBe("Вернитесь к 🧙 Мэру Сливе, чтобы сдать");
    const acc = T.t("guide.accept", {
      icon: "🌿", giver: T.nounRef("npc", "herbalist", "Wyla the Wise"),
      prep: "в", place: T.nounRef("location", "grove", "Whisperwood Grove"),
    });
    expect(acc).toBe("Поговорите с 🌿 Мудрой Ивой в Роще Шепчущего леса");
  });

  it("the boss-defeated toast declines + agrees the boss name", () => {
    T.I18N.locale = "ru";
    // A feminine lair boss (Колючая Гидра) → повержена.
    const fem = T.t("toast.bossDefeated", {
      boss: T.nounRef("lairBoss", "thicket", "Thornspine Hydra"),
      verb: T.select(T.nounGender("lairBoss", "thicket"), T.AGREE_DEFEATED),
      item: "X",
    });
    expect(fem).toContain("Колючая Гидра повержена");
  });

  it("English renders the same sentences without any case machinery", () => {
    T.I18N.locale = "en";
    expect(T.Quests.objectiveText(T.QUEST_BY_ID.m_walls)).toContain("Raise the Walls");
    expect(T.materialLabel("stone", 5)).toBe("Stone");
    const raised = T.t("toast.partRaised", {
      part: T.nounRef("castlePart", "gate", "Gatehouse"),
      verb: T.select(T.nounGender("castlePart", "gate"), T.AGREE_RAISED),
    });
    expect(raised).toBe("🏰 Gatehouse raised!");
  });
});

describe("Task 24 — no English leaks in RU (and vice-versa) after the retrofit", () => {
  it("EN⇄RU still toggles the objective text live", () => {
    T.applyLocale("ru");
    const ru = T.Quests.objectiveText(T.QUEST_BY_ID.m_walls);
    expect(/[А-Яа-я]/.test(ru)).toBe(true);
    expect(/[A-Za-z]/.test(ru.replace(/🏰/g, ""))).toBe(false); // no Latin leak (emoji aside)
    T.applyLocale("en");
    const en = T.Quests.objectiveText(T.QUEST_BY_ID.m_walls);
    expect(/[А-Яа-я]/.test(en)).toBe(false); // no Cyrillic leak
    expect(/Raise the Walls/.test(en)).toBe(true);
  });
});
