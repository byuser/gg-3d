// Task 38 — quest-givers are spawned + talkable in their HOME zones (not only the
// hub). Before this fix populateAdventure() was called only inside the
// `if (zone.home)` branch of setupZoneContent(), so the four non-hub quest-givers
// (herbalist / fisher / smith2 / hermit) were never spawned even though the
// campaign sends the player to them — they were untalkable everywhere but the
// meadow. This suite locks in: (1) the pure landmark → zone placement, (2) that
// travelling into a wild zone registers that zone's NPC interactable and the
// talk → Dialogue → accept → turn-in flow runs there, (3) that a save-load into a
// wild zone still yields talkable NPCs, and (4) that teardown disposes the NPCs.

import { describe, it, expect, beforeAll } from "vitest";
import { scenes } from "./setup/stubs.js";
import "../src/game.js";
import { NPC_DATA, LOCATION_BY_ID, landmarkZone } from "../src/data/content.js";
import { ZONE_BY_ID, HUB_ZONE } from "../src/data/zones.js";

const T = globalThis.window.__GG_TEST__;
const scene = scenes[0];
const step = (n = 1) => { for (let i = 0; i < n; i++) scene.onBeforeRenderObservable._fire(); };

// The four story quest-givers that used to be hub-only, paired with the zone they
// should now live in (derived purely from their landmark → zone mapping).
const WILD_GIVERS = [
  { npc: "herbalist", zone: "forest" },
  { npc: "fisher", zone: "shore" },
  { npc: "smith2", zone: "peaks" },
  { npc: "hermit", zone: "caverns" },
];

describe("Task 38 — landmark → zone placement (pure)", () => {
  it("every quest-giver's landmark resolves to a real zone", () => {
    for (const data of NPC_DATA) {
      if (data.vendor) continue; // vendors are placed separately, in every land (Task 40)
      const z = landmarkZone(data.loc);
      expect(ZONE_BY_ID[z], `${data.id} @ ${data.loc} → ${z}`).toBeTruthy();
    }
  });

  it("the four formerly-hub-only givers map to their own wild lands", () => {
    for (const { npc, zone } of WILD_GIVERS) {
      const data = NPC_DATA.find((n) => n.id === npc);
      expect(data).toBeTruthy();
      expect(landmarkZone(data.loc)).toBe(zone);
    }
  });

  it("the Mayor (and other village folk) stay in the hub meadow", () => {
    expect(landmarkZone("village")).toBe(HUB_ZONE);
    expect(landmarkZone("apothecary")).toBe(HUB_ZONE);
    expect(landmarkZone("castle")).toBe(HUB_ZONE);
    const mayor = NPC_DATA.find((n) => n.id === "mayor");
    expect(landmarkZone(mayor.loc)).toBe(HUB_ZONE);
  });

  it("questGiversForZone returns exactly the givers whose landmark is in that zone", () => {
    // The hub holds the Mayor (the alchemist is a vendor, never a quest-giver).
    const hub = T.questGiversForZone(HUB_ZONE).map((d) => d.id);
    expect(hub).toContain("mayor");
    expect(hub).not.toContain("alchemist");
    expect(hub).not.toContain("herbalist");
    // Each wild zone holds exactly its one resident, and no other zone does.
    for (const { npc, zone } of WILD_GIVERS) {
      expect(T.questGiversForZone(zone).map((d) => d.id)).toEqual([npc]);
      for (const other of WILD_GIVERS) {
        if (other.zone === zone) continue;
        expect(T.questGiversForZone(other.zone).map((d) => d.id)).not.toContain(npc);
      }
    }
  });

  it("every wild giver's in-zone landmark point sits inside its zone fence", () => {
    for (const { npc, zone } of WILD_GIVERS) {
      const data = NPC_DATA.find((n) => n.id === npc);
      const l = LOCATION_BY_ID[data.loc];
      const z = ZONE_BY_ID[zone];
      // The QuestGiver stands at landmark + (3,3); keep it well inside the fence.
      const d = Math.hypot(l.x + 3, l.z + 3);
      expect(d, `${npc} @ (${l.x + 3},${l.z + 3}) within radius ${z.radius}`).toBeLessThan(z.radius - 6);
    }
  });
});

describe("Task 38 — NPCs spawn + are talkable in every zone (runtime)", () => {
  beforeAll(() => {
    T.startGame();
    step(4);
  });

  const giverInState = (id) => (T.state.npcs || []).find((n) => n.data && n.data.id === id);

  it("the hub seeds only its own quest-giver (the Mayor), not the wild ones", () => {
    expect(T.state.zoneId).toBe(HUB_ZONE);
    expect(giverInState("mayor")).toBeTruthy();
    for (const { npc } of WILD_GIVERS) expect(giverInState(npc)).toBeFalsy();
  });

  it("travelling to each wild land spawns its resident and registers the talk interactable", () => {
    for (const { npc, zone } of WILD_GIVERS) {
      T.zoneManager._swap(T.state.zoneId, zone, ZONE_BY_ID[zone]);
      expect(T.state.zoneId).toBe(zone);
      // Exactly this zone's resident is present; the hub Mayor is gone.
      expect(giverInState(npc), `${npc} spawned in ${zone}`).toBeTruthy();
      expect(giverInState("mayor")).toBeFalsy();
      const npcObj = giverInState(npc);
      // Its interactable is freshly registered in the (cleared-then-rebuilt) registry.
      expect(T.interaction.items.includes(npcObj.it)).toBe(true);
      // Walk up to the NPC and confirm it becomes the active interactable (talk prompt).
      const p = npcObj.root.getAbsolutePosition();
      T.player.root.position.set(p.x, 0, p.z);
      T.interaction.update(T.player.position);
      expect(T.interaction.current).toBe(npcObj.it);
    }
    // Return to the hub for the remaining tests; the wild residents stream out.
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
    expect(giverInState("herbalist")).toBeFalsy();
  });

  it("regression: the talk → accept → turn-in flow runs for a wild-zone NPC (was zero NPCs outside the hub)", () => {
    // Drive the bug's exact failure mode: be in the forest, walk to the herbalist,
    // press the interact key, and run a full side-quest accept → turn-in there.
    T.zoneManager._swap(T.state.zoneId, "forest", ZONE_BY_ID.forest);
    const herb = giverInState("herbalist");
    expect(herb).toBeTruthy();

    // Make sure the herbalist's side quest is offerable + not yet active/done.
    const SIDE = "sq_supplies"; // herbalist: gather 8 herb → health_potion
    T.Quests.active = T.Quests.active.filter((id) => id !== SIDE);
    T.Quests.completed = T.Quests.completed.filter((id) => id !== SIDE);
    expect(T.Story.offerSide("herbalist") && T.Story.offerSide("herbalist").id).toBe(SIDE);

    // Walk up + press E → the Dialogue opens on the herbalist.
    const p = herb.root.getAbsolutePosition();
    T.player.root.position.set(p.x, 0, p.z);
    T.interaction.update(T.player.position);
    expect(T.interaction.current).toBe(herb.it);
    T.interaction.trigger();
    expect(T.Dialogue.open).toBe(true);
    expect(T.Dialogue.npc).toBe(herb);

    // Accept the side quest through the quest system, satisfy it, and turn it in.
    expect(T.Quests.accept(SIDE)).toBe(true);
    expect(T.Quests.isActive(SIDE)).toBe(true);
    const q = T.QUEST_BY_ID[SIDE];
    T.bagSpend(T.player, "herb", 9999);
    T.bagAdd(T.player, "herb", 8);
    T.Quests.onGather();
    expect(T.Quests.isComplete(q)).toBe(true);
    const coins0 = T.state.coins;
    expect(T.Quests.turnIn(SIDE)).toBe(true);
    expect(T.state.coins).toBeGreaterThan(coins0); // reward paid in the wild zone
    T.Dialogue.close();
    T.zoneManager._swap(T.state.zoneId, HUB_ZONE, ZONE_BY_ID[HUB_ZONE]);
  });

  it("a save-load INTO a wild zone still yields a talkable NPC there", () => {
    // Save from the hub but stamp the saved zone as a wild land, then reload.
    const save = T.serializeGame();
    expect(save.v).toBe(T.SAVE_VERSION); // no schema bump — world rebuilds from data
    save.zone = "peaks";
    save.player.pos = [-15, 19]; // near the Frostpeak landmark (smith2 @ -18,16 + 3,3)
    T.applySave(save);
    expect(T.state.zoneId).toBe("peaks");
    const smith = giverInState("smith2");
    expect(smith, "smith2 present after load into Frostpeak").toBeTruthy();
    expect(T.interaction.items.includes(smith.it)).toBe(true);
    // The NPC is talkable right where we loaded in.
    const p = smith.root.getAbsolutePosition();
    T.player.root.position.set(p.x, 0, p.z);
    T.interaction.update(T.player.position);
    expect(T.interaction.current).toBe(smith.it);
  });

  it("teardown disposes the zone's NPCs (no leaks across travel)", () => {
    T.zoneManager._swap(T.state.zoneId, "shore", ZONE_BY_ID.shore);
    const fisher = giverInState("fisher");
    expect(fisher).toBeTruthy();
    const root = fisher.root;
    let disposed = false;
    const orig = root.dispose.bind(root);
    root.dispose = () => { disposed = true; orig(); };
    // Tear the zone down (what a travel/teardown does): NPCs are disposed + cleared.
    T.teardownZone(T.state, T.interaction);
    expect(disposed).toBe(true);
    expect(T.state.npcs.length).toBe(0);
    expect(T.interaction.items.includes(fisher.it)).toBe(false);
  });
});
