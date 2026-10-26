import { Game, SettingTarget, type SettingsCatalog, type SettingDef } from "@ark/shared";
import type { WorldRules } from "../servers/dragonwilds-save";

/**
 * RuneScape: Dragonwilds catalog. The server has no gameplay settings of its own;
 * world type is picked in-client, and the Custom-mode world rules (XP, damage,
 * survival…) live in the world save, which the config writer patches before each
 * start. First-class fields (server name, owner id via the admin slot, world
 * password, max players, port) are NOT here.
 */
function dwset(
  key: string,
  label: string,
  category: string,
  type: SettingDef["type"],
  def: SettingDef["default"],
  extra: Partial<SettingDef> = {},
): SettingDef {
  return { key, label, category, target: SettingTarget.Env, type, default: def, emitAs: key, ...extra };
}

/** Engine CVar behind the autosave timer (default 5 min); passed as a launch arg. */
export const DRAGONWILDS_AUTOSAVE_KEY = "AUTOSAVE_MINUTES";
/** Appended verbatim to the launch line. */
export const DRAGONWILDS_EXTRA_ARGS_KEY = "GAME_PARAMS_EXTRA";

const settings: SettingDef[] = [
  dwset("WORLD_NAME", "World name", "World", "string", "MyWorld", {
    help: "Names the world the server creates on first start and its save file. This is what players search for under Worlds → Public (case-sensitive, max 16 characters). Changing it later loads a different world; the old save stays on disk.",
  }),
  dwset(DRAGONWILDS_AUTOSAVE_KEY, "Autosave interval", "World", "int", 5, {
    unit: "min",
    min: 1,
    max: 60,
    help: "Stopping the server does NOT save — only this timer and a player's in-game quit do. A stop loses whatever happened since the last autosave, so 1–2 minutes is a sensible choice.",
  }),
  dwset(DRAGONWILDS_EXTRA_ARGS_KEY, "Extra launch arguments", "Advanced", "string", "", {
    advanced: true,
    help: "Appended to the server command line as-is.",
  }),
];

const RULES_NOTE =
  "Written into the world save before each start, so a change applies on the next restart (on a brand-new server, from the second start, once the world exists). Normal worlds only; existing characters keep working.";

/** A Custom-mode world rule, keyed by its gameplay tag; never sent to the image. */
function rule(
  tag: string,
  label: string,
  category: string,
  kind: "scale" | "bool" | "count",
  min = 0.5,
  max = 3,
  help = "",
): SettingDef {
  const base = { key: tag, label, category, target: SettingTarget.Env, noEmit: true, help: `${help} ${RULES_NOTE}`.trim() };
  if (kind === "bool") return { ...base, type: "bool", default: false };
  if (kind === "count") return { ...base, type: "int", default: 10, min, max, step: 1 };
  return { ...base, type: "float", default: 1, min, max, step: 0.1, unit: "×" };
}

const ENEMY_FAMILIES = [
  "Beast", "Boss", "Construct", "Critter", "Garou", "Goblin", "Kalphite", "Kothaar", "MiniBoss", "Skeleton", "Undead", "Zamorak",
];

const rules: SettingDef[] = [
  rule("Difficulty.Progression.XPGainScale", "XP gain", "Progression", "scale", 0.5, 3, "Multiplies all skill XP."),
  rule("Difficulty.Progression.CraftingCostScale", "Crafting cost", "Progression", "scale"),
  rule("Difficulty.Progression.BuildingMaterialCostScale", "Building material cost", "Progression", "scale"),
  rule("Difficulty.Progression.ProcessingSpeedScale", "Processing speed", "Progression", "scale"),
  rule("Difficulty.Progression.AllCraftingRecipesUnlocked", "All crafting recipes unlocked", "Progression", "bool"),
  rule("Difficulty.Progression.AllBuildingPiecesUnlocked", "All building pieces unlocked", "Progression", "bool"),
  rule("Difficulty.Progression.AllSkillsMaxed", "All skills maxed", "Progression", "bool"),
  rule("Difficulty.Player.HealthScale", "Health", "Player", "scale"),
  rule("Difficulty.Player.StaminaScale", "Stamina", "Player", "scale"),
  rule("Difficulty.Player.DamageScale", "Damage dealt", "Player", "scale"),
  rule("Difficulty.Player.ResistancesScale", "Resistances", "Player", "scale"),
  rule("Difficulty.Player.LifewardScale", "Lifeward", "Player", "scale", 1, 3),
  rule("Difficulty.Player.InventoryCarryCapacityScale", "Carry capacity", "Player", "scale", 0, 3),
  rule("Difficulty.Player.SpellCostScale", "Spell cost", "Player", "scale", 0, 3),
  rule("Difficulty.Player.SpellCooldownScale", "Spell cooldown", "Player", "scale", 0, 3),
  rule("Difficulty.Player.TeleportationCostScale", "Teleportation cost", "Player", "scale", 0, 3),
  rule("Difficulty.Player.MaxNumberOfGravestonesPerPlayer", "Max gravestones per player", "Player", "count", 0, 20),
  rule("Difficulty.Player.KeepInventoryOnDeath", "Keep inventory on death", "Player", "bool"),
  rule("Difficulty.Player.ResetLastCompletedXPLevelOnDeath", "Lose partial-level XP on death", "Player", "bool"),
  rule("Difficulty.Player.Invulnerable", "Invulnerable", "Player", "bool"),
  rule("Difficulty.Player.NoBuildingStability", "No building stability", "Player", "bool"),
  rule("Difficulty.Environment.FriendlyFire", "Friendly fire", "Player", "bool"),
  rule("Difficulty.SurvivalCore.SustenanceDrainScale", "Hunger drain", "Survival", "scale", 0, 3),
  rule("Difficulty.SurvivalCore.HydrationDrainScale", "Thirst drain", "Survival", "scale", 0, 3),
  rule("Difficulty.SurvivalCore.EnduranceDrainScale", "Endurance drain", "Survival", "scale", 0, 3),
  rule("Difficulty.SurvivalCore.HungerKills", "Hunger kills", "Survival", "bool"),
  rule("Difficulty.SurvivalCore.ThirstKills", "Thirst kills", "Survival", "bool"),
  rule("Difficulty.WorldEvents.MajorWorldEventFrequencyScale", "Raid frequency", "Survival", "scale", 0, 3),
  rule("Difficulty.WorldEvents.MinorWorldEventFrequencyScale", "Minor event frequency", "Survival", "scale", 0, 3),
  rule("Difficulty.AI.DisableAggressiveAI", "Disable aggressive enemies", "Enemies", "bool"),
  ...ENEMY_FAMILIES.flatMap((family) => {
    const name = family === "MiniBoss" ? "Mini-boss" : family;
    return [
      rule(`Difficulty.AI.${family}.Damage`, `${name} damage`, "Enemies", "scale"),
      rule(`Difficulty.AI.${family}.Health`, `${name} health`, "Enemies", "scale"),
      rule(`Difficulty.AI.${family}.Resistances`, `${name} resistances`, "Enemies", "scale"),
    ];
  }),
];

/** The world rules a server's config asks for: only those moved off their default. */
export function dragonwildsWorldRules(values: Record<string, unknown>): WorldRules {
  const out: WorldRules = {};
  for (const def of rules) {
    const v = values[def.key];
    if (v === undefined || v === def.default) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[def.key] = Math.min(Math.max(n, def.min ?? n), def.max ?? n);
  }
  return out;
}

settings.push(...rules);

export const DRAGONWILDS_CATALOG: SettingsCatalog = { game: Game.DRAGONWILDS, version: "1", settings };
