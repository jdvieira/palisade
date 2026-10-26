import { describe, it, expect } from "vitest";
import { readWorldSave, writeWorldRules } from "./dragonwilds-save";
import { dragonwildsWorldRules } from "../catalog/dragonwilds.catalog";

const XP = "Difficulty.Progression.XPGainScale";

const u32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
};
const fstr = (s: string) => Buffer.concat([u32(s.length + 1), Buffer.from(`${s}\0`, "latin1")]);
const chunk = (magic: string, ...body: Buffer[]) => {
  const b = Buffer.concat(body);
  return Buffer.concat([Buffer.from(magic, "latin1"), u32(b.length), b]);
};
const table = (values: Buffer[], names?: string[]) => {
  const offsets: Buffer[] = [];
  let at = 0;
  for (const v of values) {
    offsets.push(u32(at));
    at += v.length;
  }
  return Buffer.concat([...(names ? [u32(names.length), ...names.map(fstr)] : []), u32(values.length), ...offsets, u32(at), ...values]);
};

/** A fresh Normal world laid out like a 1.1.1 save (INFO/CINF, then GLOB/GOBS/NOBJ/PROP). */
function freshSave(): Buffer {
  const cinf = table(
    [u32(9), fstr("MyWorld"), fstr("L_World"), Buffer.from([0]), u32(0), u32(1), Buffer.alloc(8, 7), u32(3)],
    ["VERSION", "WorldName", "WorldMapName", "FriendlyFire", "SurvivalDifficulty", "HardcoreState", "TimeOfSave", "SessionPrivacy"],
  );
  const prop = table([
    u32(0),
    Buffer.alloc(16, 0xab),
    fstr("MyWorld"),
    fstr("MyWorld"),
    fstr("L_World"),
    Buffer.from([0]),
    Buffer.from([0, 0]),
    Buffer.from([1, 0]),
    Buffer.alloc(8),
    fstr("++dominion+hotfix"),
    u32(0x1c5e),
  ]);
  const glob = chunk("GLOB", fstr("L_World"), chunk("GOBS", chunk("NOBJ", fstr(""), fstr("DomPersistence"), Buffer.alloc(12), chunk("PROP", prop))));
  const body = Buffer.concat([chunk("INFO", Buffer.alloc(10, 1), chunk("CINF", cinf)), glob, chunk("LVLS", Buffer.alloc(64, 5))]);
  return Buffer.concat([Buffer.from("SAVE", "latin1"), u32(body.length), body]);
}

describe("Dragonwilds world save", () => {
  it("reads a fresh Normal world with no rules", () => {
    expect(readWorldSave(freshSave())).toEqual({ difficulty: 0, rules: {} });
  });

  it("rebuilds an unchanged save byte for byte", () => {
    const save = freshSave();
    expect(writeWorldRules(save, {}).equals(save)).toBe(true);
  });

  it("writes rules into both copies and keeps the rest of the save intact", () => {
    const save = freshSave();
    const patched = writeWorldRules(save, { [XP]: 3, "Difficulty.Player.KeepInventoryOnDeath": 1 });
    expect(readWorldSave(patched)).toEqual({ difficulty: 0, rules: { [XP]: 3, "Difficulty.Player.KeepInventoryOnDeath": 1 } });
    expect(patched.readUInt32LE(4)).toBe(patched.length - 8);
    const text = patched.toString("latin1");
    expect(text.indexOf(XP)).toBeLessThan(text.indexOf("TimeOfSave"));
    expect(text.lastIndexOf(XP)).toBeGreaterThan(text.indexOf("PROP"));
    expect(patched.subarray(-72).equals(save.subarray(-72))).toBe(true);
  });

  it("removes rules again and restores the original save", () => {
    const save = freshSave();
    expect(writeWorldRules(writeWorldRules(save, { [XP]: 2.5 }), {}).equals(save)).toBe(true);
  });

  it("rejects a file that is not a world save", () => {
    expect(() => readWorldSave(Buffer.from("not a save"))).toThrow(/SPUD/);
  });
});

describe("dragonwildsWorldRules", () => {
  it("keeps only rules moved off their default, clamped to the slider range", () => {
    expect(
      dragonwildsWorldRules({
        [XP]: 9,
        "Difficulty.Player.HealthScale": 1,
        "Difficulty.Player.KeepInventoryOnDeath": true,
        "Difficulty.AI.Goblin.Damage": 0.7,
        "Difficulty.Progression.BuildingMaterialCostScale": 0,
        WORLD_NAME: "XtSY",
      }),
    ).toEqual({
      [XP]: 3,
      "Difficulty.Player.KeepInventoryOnDeath": 1,
      "Difficulty.AI.Goblin.Damage": 0.7,
      "Difficulty.Progression.BuildingMaterialCostScale": 0,
    });
  });
});
