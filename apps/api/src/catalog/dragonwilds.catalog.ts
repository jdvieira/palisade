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

/** A Custom-mode world rule, keyed by its gameplay tag; never sent to the image. */
function rule(
  tag: string,
  label: string,
  category: string,
  kind: "scale" | "bool" | "count",
  help: string,
  min = 0.5,
  max = 3,
): SettingDef {
  const base = { key: tag, label, category, target: SettingTarget.Env, noEmit: true, help };
  if (kind === "bool") return { ...base, type: "bool", default: false };
  if (kind === "count") return { ...base, type: "int", default: 10, min, max, step: 1 };
  return { ...base, type: "float", default: 1, min, max, step: 0.1, unit: "×" };
}

const ENEMY_FAMILIES = [
  "Beast", "Boss", "Construct", "Critter", "Garou", "Goblin", "Kalphite", "Kothaar", "MiniBoss", "Skeleton", "Undead", "Zamorak",
];

const rules: SettingDef[] = [
  rule("Difficulty.Progression.XPGainScale", "XP gain", "Progression", "scale",
    "XP earned from everything that grants XP. 2× levels skills twice as fast. Like every world rule, it is written into the world save and applies from the next restart."),
  rule("Difficulty.Progression.CraftingCostScale", "Crafting cost", "Progression", "scale",
    "Materials needed to craft items. 0.5× halves every recipe. The in-game menu stops at 0.5×; lower values go beyond what the game offers.", 0),
  rule("Difficulty.Progression.BuildingMaterialCostScale", "Building material cost", "Progression", "scale",
    "Materials needed to place building pieces (walls, floors, roofs, stations). 0× makes building free.", 0),
  rule("Difficulty.Progression.ProcessingSpeedScale", "Processing time", "Progression", "scale",
    "Time crafting stations take to process materials. Below 1× is faster, above 1× is slower."),
  rule("Difficulty.Progression.AllCraftingRecipesUnlocked", "All crafting recipes unlocked", "Progression", "bool",
    "Every crafting recipe is available from the start, without learning it first."),
  rule("Difficulty.Progression.AllBuildingPiecesUnlocked", "All building pieces unlocked", "Progression", "bool",
    "The whole building catalogue is available from the start, without unlocking pieces."),
  rule("Difficulty.Progression.AllSkillsMaxed", "All skills maxed", "Progression", "bool",
    "Every skill is at max level for everyone on this world."),
  rule("Difficulty.Player.HealthScale", "Health", "Player", "scale",
    "Players' maximum health. 2× doubles the health bar."),
  rule("Difficulty.Player.StaminaScale", "Stamina", "Player", "scale",
    "Players' maximum stamina."),
  rule("Difficulty.Player.DamageScale", "Damage dealt", "Player", "scale",
    "Damage players deal to enemies with weapons and spells."),
  rule("Difficulty.Player.ResistancesScale", "Resistances", "Player", "scale",
    "Players' resistance to each damage type. Higher means players take less damage."),
  rule("Difficulty.Player.LifewardScale", "Lifeward", "Player", "scale",
    "Players' maximum Lifeward. Can only be raised above 1×.", 1),
  rule("Difficulty.Player.InventoryCarryCapacityScale", "Carry capacity", "Player", "scale",
    "Maximum weight a player can carry before being slowed down. 2× doubles it.", 0),
  rule("Difficulty.Player.SpellCostScale", "Spell rune cost", "Player", "scale",
    "Runes each spell consumes when cast. 0× makes casting free.", 0),
  rule("Difficulty.Player.SpellCooldownScale", "Spell cooldown", "Player", "scale",
    "Time before a spell can be cast again. 0× removes cooldowns.", 0),
  rule("Difficulty.Player.TeleportationCostScale", "Teleport rune cost", "Player", "scale",
    "Runes needed to teleport between lodestones. 0× makes teleporting free.", 0),
  rule("Difficulty.Player.MaxNumberOfGravestonesPerPlayer", "Max gravestones per player", "Player", "count",
    "How many gravestones, which hold the items dropped on death, each player can have in the world at once.", 0, 20),
  rule("Difficulty.Player.KeepInventoryOnDeath", "Keep inventory on death", "Player", "bool",
    "Players keep their whole inventory and worn gear when they die, instead of dropping it at a gravestone."),
  rule("Difficulty.Player.ResetLastCompletedXPLevelOnDeath", "Lose partial-level XP on death", "Player", "bool",
    "Dying loses any XP earned since each skill's last level-up. Levels themselves are never lost."),
  rule("Difficulty.Player.Invulnerable", "Invulnerable", "Player", "bool",
    "Enemy attacks cannot hurt players."),
  rule("Difficulty.Player.NoBuildingStability", "No building stability", "Player", "bool",
    "Turns off building stability, so pieces don't need supports to stay up."),
  rule("Difficulty.Environment.FriendlyFire", "Friendly fire", "Player", "bool",
    "Lets players damage each other."),
  rule("Difficulty.SurvivalCore.SustenanceDrainScale", "Hunger drain", "Survival", "scale",
    "How fast the sustenance (food) bar empties. 0× means players never get hungry.", 0),
  rule("Difficulty.SurvivalCore.HydrationDrainScale", "Thirst drain", "Survival", "scale",
    "How fast the hydration (water) bar empties. 0× means players never get thirsty.", 0),
  rule("Difficulty.SurvivalCore.EnduranceDrainScale", "Endurance drain", "Survival", "scale",
    "How fast the endurance bar drains. 0× means it never drains.", 0),
  rule("Difficulty.SurvivalCore.HungerKills", "Hunger kills", "Survival", "bool",
    "Players can die from not eating."),
  rule("Difficulty.SurvivalCore.ThirstKills", "Thirst kills", "Survival", "bool",
    "Players can die from not drinking."),
  rule("Difficulty.WorldEvents.MajorWorldEventFrequencyScale", "Major world events", "Survival", "scale",
    "How often major world events happen. 0× stops them.", 0),
  rule("Difficulty.WorldEvents.MinorWorldEventFrequencyScale", "Minor world events", "Survival", "scale",
    "How often minor world events happen. 0× stops them.", 0),
  rule("Difficulty.AI.DisableAggressiveAI", "Disable aggressive enemies", "Enemies", "bool",
    "Enemies are no longer aggressive towards players."),
  ...ENEMY_FAMILIES.flatMap((family) => {
    const name = family === "MiniBoss" ? "Mini-boss" : family;
    const who = family === "Boss" ? "bosses" : family === "MiniBoss" ? "mini-bosses" : `${family} enemies`;
    return [
      rule(`Difficulty.AI.${family}.Damage`, `${name} damage`, "Enemies", "scale", `Damage ${who} deal to players.`),
      rule(`Difficulty.AI.${family}.Health`, `${name} health`, "Enemies", "scale", `Maximum health of ${who}. Higher takes longer to kill.`),
      rule(`Difficulty.AI.${family}.Resistances`, `${name} resistances`, "Enemies", "scale", `Resistance of ${who} to each damage type. Higher means players' hits do less.`),
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
