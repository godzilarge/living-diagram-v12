// Le presse-papiers (lot 3 de docs/11), la partie pure : ce qu'une copie emporte (la charge versionnée
// `{ "living-diagram": 1, … }`), comment elle s'écrit en texte, comment un texte se relit (le nôtre, un autre, ou une
// charge illisible), et ce qu'un collage envoie à l'API. Annotations et connecteurs se collent ; un équipement vient
// de la donnée (D6 : copié, il donne son nom en texte, collé, il ne crée rien) ; un groupe ne se copie pas.
//
// Coller : chaque annotation garde son ancrage si l'ancre existe à destination (un équipement du même nom ; un groupe
// du même id dans la même infrastructure seulement, un id de groupe ne veut rien dire ailleurs), sinon elle devient
// libre à la même place du plan ; un bout de connecteur suit une annotation collée avec lui (sa nouvelle identité, que
// seule la réponse de l'API donne : ces connecteurs partent dans une seconde requête), reste attaché à ce qui existe à
// destination, sinon devient un point libre à sa dernière place. Un connecteur dont aucun bout ne bougerait (tous
// attachés à des éléments restés en place) serait collé exactement sur l'original : ses bouts sont alors libérés et
// décalés. Sans DOM ni React, sans minuterie, testé sous Node (`LDApp.clipboard`).
import type { Point } from "../../canvas/layout";
import type { Annotation, Connector } from "../../canvas/types";
import type { Op } from "../../shell/apps";
import { findSecrets, maskSecrets } from "../code/secrets";

export const CLIP_KEY = "living-diagram";
export const CLIP_VERSION = 1;
/** Le format propre dans un `DataTransfer` (événements `copy` / `paste`). */
export const CLIP_MIME = "application/x-living-diagram+json";
/** Le même, pour l'API asynchrone du presse-papiers (Chromium : un format web porte le préfixe « web »). */
export const CLIP_WEB = "web " + CLIP_MIME;
/** Une requête de l'API porte 500 opérations au plus : un collage aussi (annotations et connecteurs). */
export const MAX_PASTE = 500;
/** Un texte plus long n'est pas lu comme une charge (garde de lecture, en caractères ; la borne d'une requête, en
 *  octets, est `MAX_REQUEST_BYTES`). */
export const MAX_CLIP_CHARS = 2 * 1024 * 1024;
/** Le corps d'une requête de collage, au plus, en octets UTF-8 : le défaut de `LD_MAX_INTENT_BYTES` côté serveur
 *  (1 Mio), moins la place de l'enveloppe (`author`, clés) ; au-delà, le collage est refusé avant tout envoi. */
export const MAX_REQUEST_BYTES = 1024 * 1024 - 1024;
/** Le pas d'un collage répété et d'une duplication : un carreau de la grille (20). */
export const STEP = 20;
/** Les images qu'un collage d'une autre infrastructure renvoie au magasin d'ici, au plus (4 Mo chacune). */
export const MAX_CARRIED = 50;
const MAX_ID = 64, MAX_NAME = 253, MAX_HOSTS = 10_000;
const SHA256 = /^[0-9a-f]{64}$/;

export interface Box { x: number; y: number; w: number; h: number }
type End = Connector["start"];
/** Une annotation copiée : ce qui la recrée, plus sa boîte dans le plan au moment de la copie (`frame`). */
export interface ClipAnnotation {
  id: string; anchor: Annotation["anchor"]; x: number; y: number; w: number; h: number; z: Annotation["z"]; leader: boolean;
  content: Annotation["content"]; style: Annotation["style"]; frame: Box;
}
/** Un connecteur copié : ce qui le recrée, plus la place de ses deux bouts dans le plan au moment de la copie. */
export interface ClipConnector {
  id: string; start: End; end: End; heads: Connector["heads"]; route: Connector["route"]; bend: number; label: string; z: Connector["z"];
  style: Connector["style"]; a: Point; b: Point;
}
/** La charge : versionnée, l'infrastructure d'origine, ce qui se colle, et les noms des équipements copiés. */
export interface Payload {
  "living-diagram": typeof CLIP_VERSION; infrastructure: string;
  annotations: ClipAnnotation[]; connectors: ClipConnector[]; hosts: string[];
}

// ——— Copier ———
export interface Source {
  infrastructure: string;
  annotations: { a: Annotation; frame: Box }[];
  connectors: { c: Connector; a: Point; b: Point }[];
  hosts: string[];
}
const pt = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });
/** La charge d'une sélection (ce que la toile dessine : boîte des annotations, bouts des connecteurs). */
export function payloadOf(source: Source): Payload {
  return {
    [CLIP_KEY]: CLIP_VERSION, infrastructure: source.infrastructure,
    annotations: source.annotations.map(({ a, frame }): ClipAnnotation => ({
      id: a.id, anchor: a.anchor, x: a.x, y: a.y, w: a.w, h: a.h, z: a.z, leader: a.leader, content: a.content, style: a.style,
      frame: { x: Math.round(frame.x), y: Math.round(frame.y), w: Math.round(frame.w), h: Math.round(frame.h) },
    })),
    connectors: source.connectors.map(({ c, a, b }): ClipConnector => ({
      id: c.id, start: c.start, end: c.end, heads: c.heads, route: c.route, bend: c.bend, label: c.label, z: c.z, style: c.style, a: pt(a), b: pt(b),
    })),
    hosts: source.hosts.slice(),
  } as Payload;
}
/** Ce qui se colle (annotations et connecteurs) ; les noms des équipements ne comptent pas. */
export const pastable = (p: Payload): number => p.annotations.length + p.connectors.length;
/** Le texte de la charge : la charge entière en JSON s'il y a quelque chose à coller, sinon les noms des équipements,
 *  un par ligne (D6) ; rien sans rien. */
export const textOf = (p: Payload): string => (pastable(p) ? JSON.stringify(p) : p.hosts.join("\n"));

// ——— Relire ———
export type Parsed = { kind: "payload"; payload: Payload } | { kind: "unknown" } | { kind: "foreign" };
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1_000_000;
const isText = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;
const isPoint = (v: unknown): v is Point => isObject(v) && isNumber(v.x) && isNumber(v.y);
const isBox = (v: unknown): v is Box => isObject(v) && isNumber(v.x) && isNumber(v.y) && isNumber(v.w) && isNumber(v.h);
const isZ = (v: unknown): boolean => v === "back" || v === "front";
function isEnd(v: unknown): v is End {
  if (!isObject(v)) return false;
  if (v.kind === "free") return isNumber(v.x) && isNumber(v.y);
  return (v.kind === "device" || v.kind === "group" || v.kind === "annotation") && isText(v.ref, MAX_NAME) && typeof v.side === "string";
}
function isAnchor(v: unknown): v is Annotation["anchor"] {
  if (!isObject(v)) return false;
  if (v.kind === "free") return v.ref === null;
  return (v.kind === "device" || v.kind === "group") && isText(v.ref, MAX_NAME);
}
// La forme seulement : le contenu et le style se valident côté serveur (422). Une requête refusée l'est en entier ;
// un collage en deux requêtes dont la seconde est refusée est défait par la page (clipboard-commands.ts).
function isClipAnnotation(v: unknown): v is ClipAnnotation {
  return isObject(v) && isText(v.id, MAX_ID) && isAnchor(v.anchor) && [v.x, v.y, v.w, v.h].every(isNumber) && isZ(v.z) && typeof v.leader === "boolean"
    && isObject(v.content) && ["note", "shape", "table", "image", "code"].includes(v.content.kind as string) && isObject(v.style) && isBox(v.frame)
    // une image se cite par son empreinte : elle part dans une adresse (lecture, renvoi), jamais n'importe quel texte
    && (v.content.kind !== "image" || (typeof v.content.asset === "string" && SHA256.test(v.content.asset) && typeof v.content.alt === "string"));
}
function isClipConnector(v: unknown): v is ClipConnector {
  return isObject(v) && isText(v.id, MAX_ID) && isEnd(v.start) && isEnd(v.end) && isObject(v.heads) && typeof v.route === "string" && isNumber(v.bend)
    && typeof v.label === "string" && isZ(v.z) && isObject(v.style) && isPoint(v.a) && isPoint(v.b);
}
function readPayload(v: unknown): Payload | null {
  if (!isObject(v) || v[CLIP_KEY] !== CLIP_VERSION || typeof v.infrastructure !== "string") return null;
  const { annotations, connectors, hosts } = v;
  if (!Array.isArray(annotations) || !Array.isArray(connectors) || !Array.isArray(hosts) || hosts.length > MAX_HOSTS) return null;
  if (!annotations.every(isClipAnnotation) || !connectors.every(isClipConnector) || !hosts.every((h) => isText(h, MAX_NAME))) return null;
  const ids = annotations.map((a) => a.id).concat(connectors.map((c) => c.id));
  if (new Set(ids).size !== ids.length) return null; // deux éléments sous la même identité : on ne saurait plus relier
  return v as unknown as Payload;
}
const OURS = /^\s*\{\s*"living-diagram"\s*:/;
/** Un texte du presse-papiers : notre charge (version connue, forme lisible), une charge à nous illisible (version
 *  inconnue, abîmée, trop longue : rien ne se colle, la page le dit), ou un texte d'ailleurs (comportement d'avant). */
export function parse(text: string | null | undefined): Parsed {
  if (!text || !OURS.test(text)) return { kind: "foreign" };
  if (text.length > MAX_CLIP_CHARS) return { kind: "unknown" };
  let value: unknown;
  try { value = JSON.parse(text); } catch (error) { return { kind: "unknown" }; }
  const payload = readPayload(value);
  return payload ? { kind: "payload", payload } : { kind: "unknown" };
}

// ——— Où coller ———
/** La boîte englobante de ce qui se colle (boîtes des annotations, bouts des connecteurs) ; `null` sans rien. */
export function boundsOf(p: Payload): Box | null {
  const xs: number[] = [], ys: number[] = [];
  p.annotations.forEach((a) => { xs.push(a.frame.x, a.frame.x + a.frame.w); ys.push(a.frame.y, a.frame.y + a.frame.h); });
  p.connectors.forEach((c) => { xs.push(c.a.x, c.b.x); ys.push(c.a.y, c.b.y); });
  if (!xs.length) return null;
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
const snapped = (v: number, snap: boolean): number => (snap ? Math.round(v / STEP) * STEP : Math.round(v));
/** L'écart à appliquer : au pointeur (le coin haut gauche du collage sous lui, aimanté à la grille si l'aimant est
 *  actif), sinon à la place d'origine ; le `repeat`-ième collage de suite au même endroit décale encore de +20 / +20
 *  (le premier au pointeur ne décale pas, le premier sans pointeur décale d'un pas). */
export function offsetFor(box: Box, pointer: Point | null, repeat: number, snap: boolean): Point {
  const n = Math.max(1, Math.round(repeat));
  if (!pointer) return { x: STEP * n, y: STEP * n };
  return { x: snapped(pointer.x, snap) + STEP * (n - 1) - Math.round(box.x), y: snapped(pointer.y, snap) + STEP * (n - 1) - Math.round(box.y) };
}

// ——— Coller ———
/** Ce que la destination sait : son infrastructure et ce qui y existe. */
export interface Target {
  infrastructure: string; hasHost: (hostname: string) => boolean; hasGroup: (id: string) => boolean; hasAnnotation: (id: string) => boolean;
  /** Le point de référence d'une ancre dessinée ici (le centre d'une carte, le coin haut gauche d'un cadre de groupe) ;
   *  `null` si elle n'est pas dessinée. */
  anchorAt?: (kind: "device" | "group", ref: string) => Point | null;
}
export interface PastePlan {
  /** La première requête : les annotations, puis les connecteurs qui ne visent aucune annotation collée. */
  first: Op[];
  /** La seconde (vide si rien) : les connecteurs qui visent une annotation collée, sous son identité d'origine,
   *  remplacée par `resolve` une fois la première réponse lue. */
  later: Op[];
  /** Les identités d'origine des annotations et des connecteurs de `first`, dans l'ordre de leurs créations. */
  annotations: string[]; connectors: string[];
  /** Combien d'annotations ont perdu leur ancre (devenues libres), et de bouts de connecteur libérés. */
  freed: number;
}
export type PasteResult = { ok: true; plan: PastePlan } | { ok: false; reason: "nothing" | "too_many" | "too_big" };

const shifted = (p: Point, d: Point): Point => ({ x: Math.round(p.x + d.x), y: Math.round(p.y + d.y) });

/** Les opérations d'un collage décalé de `d` ; `missing` : les images introuvables, recollées en note qui porte leur
 *  texte de remplacement, sinon `missingText`. */
export function pastePlan(p: Payload, target: Target, d: Point, missing: Set<string> = new Set(), missingText = "?"): PasteResult {
  if (!pastable(p)) return { ok: false, reason: "nothing" };
  if (pastable(p) > MAX_PASTE) return { ok: false, reason: "too_many" };
  const same = p.infrastructure === target.infrastructure;
  const pasted = new Set(p.annotations.map((a) => a.id));
  const exists = (kind: string, ref: string): boolean => (kind === "device" ? target.hasHost(ref)
    : kind === "group" ? same && target.hasGroup(ref) : kind === "annotation" ? same && target.hasAnnotation(ref) && !pasted.has(ref) : false);
  let freed = 0;
  const annotations = p.annotations.map((a): Op => {
    const keep = a.anchor.kind !== "free" && exists(a.anchor.kind, a.anchor.ref || "");
    const content = a.content.kind === "image" && missing.has(a.content.asset) ? { kind: "note" as const, text: (a.content.alt || missingText).slice(0, 2000) } : a.content;
    if (a.anchor.kind !== "free" && !keep) freed += 1;
    // attachée : la boîte collée tombe à `frame + d` comme les autres ; l'écart s'écrit depuis l'ancre d'ici (son point
    // de référence peut ne pas être au même endroit qu'à l'origine : placement propre à chaque infrastructure)
    const ref = keep && target.anchorAt ? target.anchorAt(a.anchor.kind as "device" | "group", a.anchor.ref || "") : null;
    const at = !keep ? shifted(a.frame, d) : ref ? shifted({ x: a.frame.x - ref.x, y: a.frame.y - ref.y }, d) : shifted({ x: a.x, y: a.y }, d);
    return { op: "annotation_create", content, anchor: keep ? a.anchor : { kind: "free", ref: null }, x: at.x, y: at.y, w: Math.round(a.w), h: Math.round(a.h), z: a.z, locked: false, leader: keep && a.leader, style: a.style };
  });
  const first: Op[] = annotations.slice(), later: Op[] = [], connectors: string[] = [];
  p.connectors.forEach((c) => {
    const place = (end: End, at: Point): { end: End; moves: boolean } => {
      if (end.kind === "free") return { end: { kind: "free", ...shifted(end, d) }, moves: true };
      if (end.kind === "annotation" && pasted.has(end.ref)) return { end, moves: true };
      if (exists(end.kind, end.ref)) return { end, moves: false };
      freed += 1;
      return { end: { kind: "free", ...shifted(at, d) }, moves: true };
    };
    let start = place(c.start, c.a), end = place(c.end, c.b);
    if (!start.moves && !end.moves) { // collé sur l'original : libéré et décalé
      freed += 2;
      start = { end: { kind: "free", ...shifted(c.a, d) }, moves: true };
      end = { end: { kind: "free", ...shifted(c.b, d) }, moves: true };
    }
    const op: Op = { op: "connector_create", start: start.end, end: end.end, heads: c.heads, route: c.route, bend: c.bend, label: c.label, z: c.z, locked: false, style: c.style };
    const waits = [start.end, end.end].some((e) => e.kind === "annotation" && pasted.has(e.ref));
    if (waits) later.push(op); else { first.push(op); connectors.push(c.id); }
  });
  if (bytesOf(first) > MAX_REQUEST_BYTES || bytesOf(later) > MAX_REQUEST_BYTES) return { ok: false, reason: "too_big" };
  return { ok: true, plan: { first, later, annotations: p.annotations.map((a) => a.id), connectors, freed } };
}

/** La taille en octets UTF-8 d'une liste d'opérations écrite en JSON (sans `TextEncoder` : le module reste pur et se
 *  charge tel quel sous Node). */
export function bytesOf(ops: Op[]): number {
  const text = JSON.stringify(ops);
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) { n += 4; i += 1; } // une paire de substitution
    else n += 3;
  }
  return n;
}

// Deux bouts égaux, quel que soit l'ordre de leurs clés (le serveur écrit sa forme canonique).
const sameEnd = (a: unknown, b: unknown): boolean => {
  const x = (a || {}) as Record<string, unknown>, y = (b || {}) as Record<string, unknown>;
  return ["kind", "ref", "side", "x", "y"].every((k) => x[k] === y[k]);
};
/** Ce que la première réponse dit de nos créations : chaque identité calculée (`createdIds`) doit y être, de la sorte
 *  envoyée, à la place envoyée (annotation : contenu de même sorte, mêmes `x` / `y` ; connecteur : mêmes bouts). Rend
 *  les identités vérifiées, et faux si une seule manque (la seconde requête ne part pas). */
export function verifyCreated(doc: { annotations?: { id: string; x: number; y: number; content: { kind: string } }[]; connectors?: { id: string; start: unknown; end: unknown }[] },
  first: Op[], ids: Map<string, string>, plan: { annotations: string[]; connectors: string[] }): { ok: boolean; found: string[] } {
  const notes = new Map((doc.annotations || []).map((a) => [a.id, a])), lines = new Map((doc.connectors || []).map((c) => [c.id, c]));
  const sentNotes = first.filter((op) => op.op === "annotation_create"), sentLines = first.filter((op) => op.op === "connector_create");
  const found: string[] = [];
  plan.annotations.forEach((source, i) => {
    const id = ids.get(source) as string, got = notes.get(id), sent = sentNotes[i];
    if (got && sent && sent.op === "annotation_create" && got.content.kind === sent.content.kind && got.x === sent.x && got.y === sent.y) found.push(id);
  });
  plan.connectors.forEach((source, i) => {
    const id = ids.get(source) as string, got = lines.get(id), sent = sentLines[i];
    if (got && sent && sent.op === "connector_create" && sameEnd(got.start, sent.start) && sameEnd(got.end, sent.end)) found.push(id);
  });
  return { ok: found.length === plan.annotations.length + plan.connectors.length, found };
}

/** Les images (empreintes, sans doublon) qu'une charge cite. */
export const assetsOf = (p: Payload): string[] => Array.from(new Set(p.annotations.flatMap((a) => (a.content.kind === "image" ? [a.content.asset] : []))));

/** Les identités que le serveur a données aux créations d'une requête : la n-ième annotation `a<révision>-<n>`, le
 *  n-ième connecteur `c<révision>-<n>` (backend `intent.py`, l'ordre des opérations) ; clé = identité d'origine. */
export function createdIds(annotations: string[], connectors: string[], revision: number): Map<string, string> {
  return new Map(annotations.map((id, i): [string, string] => [id, "a" + revision + "-" + (i + 1)])
    .concat(connectors.map((id, i): [string, string] => [id, "c" + revision + "-" + (i + 1)])));
}
/** Les connecteurs de la seconde requête, leurs bouts sur les annotations collées sous leur nouvelle identité. */
export function resolve(later: Op[], ids: Map<string, string>): Op[] {
  const fix = (end: End): End => (end.kind === "annotation" && ids.has(end.ref) ? { ...end, ref: ids.get(end.ref) as string } : end);
  return later.map((op) => (op.op === "connector_create" ? { ...op, start: fix(op.start), end: fix(op.end) } : op));
}

// ——— Le fantôme d'un Alt + glissé ———
/** Ce qu'un fantôme dessine : chaque annotation à sa boîte décalée, chaque connecteur de bout en bout (un bout attaché à
 *  ce qui reste en place ne bouge pas). */
export interface Ghost { annotations: { a: ClipAnnotation; frame: Box }[]; lines: { c: ClipConnector; a: Point; b: Point }[] }
export function ghostOf(p: Payload, target: Target, d: Point): Ghost {
  const pasted = new Set(p.annotations.map((a) => a.id)), same = p.infrastructure === target.infrastructure;
  const stays = (end: End): boolean => end.kind !== "free" && !(end.kind === "annotation" && pasted.has(end.ref))
    && (end.kind === "device" ? target.hasHost(end.ref) : same && (end.kind === "group" ? target.hasGroup(end.ref) : target.hasAnnotation(end.ref)));
  return {
    annotations: p.annotations.map((a) => ({ a, frame: { ...a.frame, x: a.frame.x + d.x, y: a.frame.y + d.y } })),
    lines: p.connectors.map((c) => {
      const s = stays(c.start), e = stays(c.end), both = s && e;
      return { c, a: s && !both ? c.a : shifted(c.a, d), b: e && !both ? c.b : shifted(c.b, d) };
    }),
  };
}

// ——— Ctrl+D : répéter l'écart ———
/** Une sélection en clé (pour savoir si elle est encore la copie d'un collage). */
export const keyOf = (annotations: string[], connectors: string[]): string => annotations.slice().sort().join("|") + "#" + connectors.slice().sort().join("|");
/** L'écart d'une duplication : celui du dernier clone (Alt + glissé, ou duplication précédente) tant que la sélection
 *  est cette copie, sinon un pas de grille. */
export const duplicateStep = (last: { key: string; d: Point } | null, key: string): Point => (last && last.key === key ? last.d : { x: STEP, y: STEP });

// ——— Les valeurs sensibles d'une charge (revue du lot 16, M3 ; revue de session, J3) ———
/** Les valeurs sensibles des blocs de code d'une charge : collée dans une autre infrastructure, une valeur gardée telle
 *  quelle là-bas serait lue par une autre audience ; la page demande avant d'écrire. */
export const secretsOf = (p: Payload): number => p.annotations.reduce((n, a) => n + (a.content.kind === "code" ? findSecrets(a.content.text).length : 0), 0);
/** La charge, chaque valeur sensible de ses blocs de code remplacée par `<removed>` (une charge neuve, l'autre intacte). */
export const withoutSecrets = (p: Payload): Payload => ({
  ...p,
  annotations: p.annotations.map((a) => (a.content.kind === "code" ? { ...a, content: { ...a.content, text: maskSecrets(a.content.text) } } : a)),
});

export const clipboard = { CLIP_KEY, CLIP_VERSION, CLIP_MIME, CLIP_WEB, MAX_PASTE, MAX_CARRIED, MAX_REQUEST_BYTES, STEP, payloadOf, assetsOf, bytesOf, verifyCreated, pastable, textOf, parse, boundsOf, offsetFor, pastePlan, createdIds, resolve, ghostOf, keyOf, duplicateStep, secretsOf, withoutSecrets };
