/**
 * Reads and rewrites the world rules ("Difficulty.*" tags) in a Dragonwilds SPUD
 * world save. The rules live twice: as floats in the INFO/CINF metadata and as a
 * TagName array in the GLOB PROP block's CustomDifficultySettings field. The server
 * applies them on Normal worlds too (verified live on 1.1.1), which keeps Standard
 * characters joinable. Format per https://github.com/PaulMcGinley/RSDWSaveEditor.
 */

export type WorldRules = Record<string, number>;

/** ESurvivalDifficulty as stored in the save. */
export const DW_DIFFICULTY_NORMAL = 0;

// PROP field order of the flattened WorldSaveSettings struct.
const PROP_SURVIVAL = 6;
const PROP_CDS = 8;

function readFString(b: Buffer, o: number): [string, number] {
  const n = b.readInt32LE(o);
  o += 4;
  if (n < 0) return [b.toString("utf16le", o, o - 2 * n).replace(/\0+$/, ""), o - 2 * n];
  return [b.toString("latin1", o, o + n).replace(/\0+$/, ""), o + n];
}

function fstring(s: string): Buffer {
  const body = Buffer.from(`${s}\0`, "latin1");
  const len = Buffer.alloc(4);
  len.writeInt32LE(body.length);
  return Buffer.concat([len, body]);
}

const u32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v);
  return b;
};
const f32 = (v: number) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(v);
  return b;
};
const roundF32 = (v: number) => f32(v).readFloatLE(0);

function chunkAt(b: Buffer, magic: string, from: number, to: number): number {
  const at = b.indexOf(magic, from, "latin1");
  if (at < 0 || at >= to) throw new Error(`Dragonwilds save: missing ${magic} chunk`);
  return at;
}

const chunkLen = (b: Buffer, at: number) => b.readUInt32LE(at + 4);

interface Layout {
  info: number;
  cinf: number;
  glob: number;
  gobs: number;
  nobj: number;
  prop: number;
}

function layout(b: Buffer): Layout {
  if (b.toString("latin1", 0, 4) !== "SAVE" || 8 + b.readUInt32LE(4) !== b.length) {
    throw new Error("Dragonwilds save: not a SPUD save");
  }
  const info = chunkAt(b, "INFO", 8, 9);
  const infoEnd = info + 8 + chunkLen(b, info);
  const cinf = chunkAt(b, "CINF", info + 8, infoEnd);
  const glob = chunkAt(b, "GLOB", infoEnd, infoEnd + 1);
  const globEnd = glob + 8 + chunkLen(b, glob);
  const gobs = chunkAt(b, "GOBS", glob + 8, globEnd);
  const nobj = chunkAt(b, "NOBJ", gobs + 8, globEnd);
  const prop = chunkAt(b, "PROP", nobj + 8, globEnd);
  return { info, cinf, glob, gobs, nobj, prop };
}

type CinfProp = [name: string, value: Buffer];

function parseCinf(body: Buffer): CinfProp[] {
  let o = 0;
  const n = body.readInt32LE(o);
  o += 4;
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    const [s, next] = readFString(body, o);
    names.push(s);
    o = next;
  }
  if (body.readInt32LE(o) !== n) throw new Error("Dragonwilds save: CINF name/offset mismatch");
  o += 4;
  const offsets = Array.from({ length: n }, (_, i) => body.readUInt32LE(o + 4 * i));
  o += 4 * n;
  const data = body.subarray(o + 4, o + 4 + body.readInt32LE(o));
  return names.map((name, i) => [name, data.subarray(offsets[i], offsets[i + 1] ?? data.length)]);
}

function buildCinf(props: CinfProp[]): Buffer {
  const offsets: Buffer[] = [];
  let at = 0;
  for (const [, v] of props) {
    offsets.push(u32(at));
    at += v.length;
  }
  return Buffer.concat([
    u32(props.length),
    ...props.map(([name]) => fstring(name)),
    u32(props.length),
    ...offsets,
    u32(at),
    ...props.map(([, v]) => v),
  ]);
}

function parseCds(blob: Buffer): WorldRules {
  const out: WorldRules = {};
  if (blob.length < 8) return out;
  let o = 4;
  const count = blob.readUInt32LE(o);
  o += 4;
  for (let i = 0; i < count; i++) {
    [, o] = readFString(blob, o); // TagName
    [, o] = readFString(blob, o); // NameProperty
    const size = blob.readUInt32LE(o + 4);
    o += 9;
    const [tag] = readFString(blob, o);
    o += size;
    [, o] = readFString(blob, o); // None
    out[tag] = blob.readFloatLE(o);
    o += 4;
  }
  return out;
}

function buildCds(rules: WorldRules): Buffer {
  const parts: Buffer[] = [u32(0), u32(Object.keys(rules).length)];
  for (const [tag, value] of Object.entries(rules)) {
    const payload = fstring(tag);
    parts.push(fstring("TagName"), fstring("NameProperty"), u32(0), u32(payload.length), Buffer.from([0]));
    parts.push(payload, fstring("None"), f32(value));
  }
  return Buffer.concat(parts);
}

function readProp(b: Buffer, prop: number) {
  const p = prop + 8;
  const n = b.readInt32LE(p);
  const offsets = Array.from({ length: n }, (_, i) => b.readUInt32LE(p + 4 + 4 * i));
  const start = p + 8 + 4 * n;
  const raw = b.subarray(start, start + b.readInt32LE(p + 4 + 4 * n));
  if (offsets.length <= PROP_CDS + 1) throw new Error("Dragonwilds save: unexpected PROP layout");
  return { offsets, raw, survivalAt: offsets[PROP_SURVIVAL]!, cdsStart: offsets[PROP_CDS]!, cdsEnd: offsets[PROP_CDS + 1]! };
}

/** Replaces chunk `at`'s body and grows/shrinks the enclosing chunks to match. */
function replaceBody(b: Buffer, at: number, body: Buffer, parents: number[]): Buffer {
  const old = chunkLen(b, at);
  const out = Buffer.concat([b.subarray(0, at + 8), body, b.subarray(at + 8 + old)]);
  out.writeUInt32LE(body.length, at + 4);
  for (const p of parents) out.writeUInt32LE(chunkLen(out, p) + body.length - old, p + 4);
  return out;
}

export function readWorldSave(b: Buffer): { difficulty: number; rules: WorldRules } {
  const l = layout(b);
  const { raw, survivalAt, cdsStart, cdsEnd } = readProp(b, l.prop);
  return { difficulty: raw.readUInt16LE(survivalAt), rules: parseCds(raw.subarray(cdsStart, cdsEnd)) };
}

/** Returns the save with exactly `rules` as its world rules, in both copies. */
export function writeWorldRules(b: Buffer, rules: WorldRules): Buffer {
  const exact = Object.fromEntries(Object.entries(rules).map(([k, v]) => [k, roundF32(v)]));
  let l = layout(b);

  const { offsets, raw, cdsStart, cdsEnd } = readProp(b, l.prop);
  const cds = buildCds(exact);
  const delta = cds.length - (cdsEnd - cdsStart);
  const newRaw = Buffer.concat([raw.subarray(0, cdsStart), cds, raw.subarray(cdsEnd)]);
  const newOffsets = offsets.map((o, i) => (i > PROP_CDS ? o + delta : o));
  const propBody = Buffer.concat([u32(newOffsets.length), ...newOffsets.map(u32), u32(newRaw.length), newRaw]);
  b = replaceBody(b, l.prop, propBody, [l.nobj, l.gobs, l.glob, 0]);

  l = layout(b);
  const props = parseCinf(b.subarray(l.cinf + 8, l.cinf + 8 + chunkLen(b, l.cinf))).filter(
    ([name]) => !name.startsWith("Difficulty."),
  );
  const at = props.findIndex(([name]) => name === "TimeOfSave");
  props.splice(at < 0 ? props.length : at, 0, ...Object.entries(exact).map(([k, v]): CinfProp => [k, f32(v)]));
  return replaceBody(b, l.cinf, buildCinf(props), [l.info, 0]);
}

export function sameWorldRules(a: WorldRules, b: WorldRules): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => b[k] === a[k]);
}
