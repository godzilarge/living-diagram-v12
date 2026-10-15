// Le presse-papiers (lot 3 de docs/11), les commandes, sorties du store : copier, couper, coller (clavier, menu),
// dupliquer (Ctrl+D) et cloner (Alt + glissé). La règle est dans clipboard.ts (pure) ; ici, ce que la page en fait.
//
// Écrire : au clavier, l'événement natif `copy` / `cut` reçoit deux représentations (le format propre, et le texte :
// la charge en JSON, ou les noms des équipements un par ligne) ; depuis le menu, l'API asynchrone du presse-papiers
// (format web propre et texte, sinon le texte seul). La mémoire de l'onglet double toujours le système : elle sert quand
// le système refuse (permission, contexte non sécurisé), quand le texte collé est exactement celui de notre dernière
// copie (le format propre ne survit pas toujours), et au menu « coller » si la lecture est refusée. Lire : le format
// propre d'abord, puis un texte qui commence par `{"living-diagram"`, sinon le comportement d'avant (une image devient
// une annotation image, un texte une note).
//
// Coller (revue du lot 3, H1, M1, M2) : le collage appartient à la toile où il commence (son infrastructure, figée) ;
// après chaque attente, si la toile a changé, il s'arrête sans rien écrire de plus et le dit. Une requête pour les
// annotations et les connecteurs qui n'en visent aucune ; les identités se lisent dans la **réponse** de cette requête
// et y sont vérifiées ; une seconde requête pour les connecteurs qui visent une annotation collée ; une seule entrée
// d'annulation pour les deux (`undo.chain`). Si la seconde ne peut pas partir ou est refusée, la première est défaite
// (`undo.revert`, sans entrée) et la page dit « collage refusé » ; « n éléments collés » ne se dit qu'après tout.
// Une charge venue d'une autre infrastructure dont des blocs de code portent des valeurs sensibles (gardées telles
// quelles là-bas, pour une autre audience) ne s'écrit qu'après un choix, proposé par la ligne d'état : « retirer ces
// valeurs » ou « coller tel quel » (revue du lot 16, M3 ; revue de session, J3).
import { fetchAssetFile, uploadAsset } from "../api/client";
import type { Session } from "../api/client";
import type { CanvasHandle } from "./store";
import { t } from "../../i18n";
import type { Point } from "../../canvas/layout";
import type { Op } from "../../shell/apps";
import { CLIP_MIME, CLIP_WEB, MAX_CARRIED, MAX_PASTE, MAX_REQUEST_BYTES, assetsOf, boundsOf, createdIds, duplicateStep, keyOf, offsetFor, parse, pastable, pastePlan, resolve, secretsOf, textOf, verifyCreated, withoutSecrets } from "./clipboard";
import type { Payload } from "./clipboard";
import { groupsIn, payloadFromToile, targetOf } from "../canvas/clip-toile";
import { has, selectionOf } from "./selection";
import type { Item } from "./selection";
import type { Action, AppState } from "./types";

export interface ClipboardDeps {
  dispatch: (action: Action) => void;
  current: () => AppState;
  /** Le jeton vivant ; l'infrastructure d'un collage est celle de sa toile, figée au départ. */
  session: () => Session;
  handle: () => CanvasHandle | null;
  /** Le comportement d'avant pour ce qui ne vient pas de nous : image → annotation image, texte → note. */
  pasteForeign: (data: DataTransfer) => boolean;
  /** « Coller comme bloc de code » : un texte devient toujours un bloc (code-commands.ts, `force`). */
  pasteCode: (text: string, at: Point | null) => boolean;
}
export interface ClipboardCommands {
  /** Ctrl+C / Ctrl+X (événement natif) : rend faux s'il n'y avait rien à copier (le navigateur garde la main). */
  copyEvent: (data: DataTransfer, cut: boolean) => boolean;
  /** « copier » / « couper » du menu contextuel ; `what` : l'élément visé (la sélection s'il en fait partie, sinon lui seul). */
  copyFromMenu: (cut: boolean, what?: Item | null) => void;
  /** Ctrl+V (événement natif) : rend faux si rien n'a été pris (le navigateur garde la main). */
  pasteEvent: (data: DataTransfer) => boolean;
  /** « coller » du menu contextuel, au point du plan visé. */
  pasteFromMenu: (at: Point) => void;
  /** Ctrl+Maj+V (l'événement natif qui suit la touche) : le texte du presse-papiers, toujours en bloc de code. */
  pasteCodeEvent: (data: DataTransfer) => void;
  /** « coller comme bloc de code » du menu du fond (ou Ctrl+Maj+V sans événement natif) : lu par l'API du
   *  presse-papiers, au point du plan visé (`null` : le pointeur). */
  pasteCodeFromMenu: (at: Point | null) => void;
  /** Ctrl+D (ou « dupliquer » du menu, sur `what`) : rend faux s'il n'y avait rien à dupliquer ni à dire. */
  duplicate: (what?: Item | null) => boolean;
  /** Alt + glissé relâché : les éléments clonés, à l'écart `d` (unités du plan). */
  cloneDrop: (items: Item[], d: Point) => void;
  /** Le choix proposé pour un collage d'une autre infrastructure qui porte des valeurs sensibles : le collage attendu
   *  part, valeurs retirées ou telles quelles. */
  pasteSecrets: (choice: "remove" | "keep") => void;
}
/** Où et comment coller : l'écart donné ou le pointeur ; le choix déjà fait pour les valeurs sensibles, et leur nombre. */
interface Where { d?: Point; pointer?: Point | null; secrets?: "remove" | "keep"; removed?: number }

/** Pourquoi un collage s'est arrêté avant d'avoir tout écrit. */
class Stop extends Error {}

export function clipboardCommands(deps: ClipboardDeps): ClipboardCommands {
  const { dispatch, current, session, handle } = deps;
  const note = (text: string, busy = false): void => dispatch({ type: "note", text, busy, at: Date.now() });
  // La mémoire de l'onglet : la dernière copie (une par page : les commandes sont créées une fois par Store).
  let internal: { payload: Payload; text: string } | null = null;
  // Le dernier collage (même charge au même endroit : chaque collage décale encore), le dernier clone (Ctrl+D répète son
  // écart tant que la sélection est la copie), et les duplications en vol (deux Ctrl+D rapprochés : deux pas).
  let repeat: { key: string; pointer: string; n: number } | null = null;
  let lastStep: { key: string; d: Point } | null = null;
  const flying = new Map<string, number>();
  // Le collage qui attend le choix des valeurs sensibles (un seul : un nouveau collage le remplace).
  let waiting: { p: Payload; where: Where; infrastructure: string } | null = null;

  // ——— Ce qui se copie ———
  function selected(items?: Item[]): Payload | null { const h = handle(); return h ? payloadFromToile(h.toile, items) : null; }
  const groupsSelected = (): number => { const h = handle(); return h ? h.toile.state.multi.groups.length : 0; };
  function copiedText(p: Payload, groups: number): string {
    const parts: string[] = [];
    if (pastable(p)) parts.push(t("shell:clipboard.copied", { count: pastable(p) }));
    if (p.hosts.length) parts.push(t("shell:clipboard.namesCopied", { count: p.hosts.length }));
    if (groups) parts.push(t("shell:clipboard.groupsNotCopied", { count: groups }));
    return parts.join(" · ");
  }
  /** La copie de la sélection : rangée dans l'onglet, dite ; `null` s'il n'y a rien. */
  function take(): { payload: Payload; text: string; said: string; groups: number } | null {
    const p = selected(), groups = groupsSelected();
    if (!p || (!pastable(p) && !p.hosts.length)) { if (groups) note(t("shell:clipboard.groupsNotCopied", { count: groups })); return null; }
    const text = textOf(p);
    internal = { payload: p, text };
    repeat = null;
    return { payload: p, text, said: copiedText(p, groups), groups };
  }
  const editable = (): boolean => { const h = handle(); return current().view.mode === "diagram" && !!h && h.intents.canWrite(); };
  // Pourquoi rien ne s'écrit : la vue Contrôle se lit, l'intention illisible coupe l'écriture, ou personne n'a donné son nom.
  function whyReadOnly(): string {
    const h = handle();
    if (current().view.mode !== "diagram") return t("shell:clipboard.readOnly");
    return h && h.writer.locked ? t("shell:messages.intentLocked") : t("shell:clipboard.giveName");
  }
  // Couper = copier, puis supprimer exactement ce qui a été copié (annotations, connecteurs de la charge prise) ; un
  // équipement reste (D5, « masquer » proposé), un groupe aussi (il ne se copie pas : revue du lot 3, M4).
  function cut(taken: { payload: Payload; said: string; groups: number }): void {
    if (!editable()) { note(taken.said + " · " + whyReadOnly()); return; }
    const h = handle();
    if (!h) return;
    const p = taken.payload, hosts = p.hosts;
    const kept = [taken.groups ? t("shell:clipboard.groupsKept", { count: taken.groups }) : "", hosts.length ? t(hosts.length > 1 ? "shell:messages.devicesKept" : "shell:messages.deviceKept") : ""].filter(Boolean);
    const offer = hosts.length ? { kind: "hide" as const, hosts } : undefined;
    const ops: Op[] = p.annotations.map((a): Op => ({ op: "annotation_delete", id: a.id })).concat(p.connectors.map((c): Op => ({ op: "connector_delete", id: c.id })));
    if (!ops.length) { dispatch({ type: "note", text: [taken.said].concat(kept).join(" · "), offer, at: Date.now() }); return; }
    const done = t("shell:messages.itemsCut", { count: ops.length, author: h.writer.author });
    void h.intents.apply(ops, done).then((intent) => {
      if (!intent || handle() !== h) return;
      if (hosts.length) h.toile.selectHosts(hosts); else h.toile.select(null);
      dispatch({ type: "note", text: [done].concat(kept).join(" · "), offer, at: Date.now() });
    });
  }
  const afterCopy = (taken: { payload: Payload; said: string; groups: number }, cutting: boolean): void => { if (cutting) cut(taken); else note(taken.said); };

  // ——— Coller ———
  // Les images d'une autre infrastructure : lues là-bas, renvoyées ici (le magasin dédoublonne par empreinte) ; une
  // image introuvable ou refusée est rendue en note (son texte de remplacement). `alive` : la toile n'a pas changé.
  async function carryImages(p: Payload, here: Session, alive: () => boolean): Promise<Set<string>> {
    const missing = new Set<string>();
    const assets = p.infrastructure === here.infrastructure ? [] : assetsOf(p);
    if (!assets.length) return missing;
    note(t("shell:clipboard.carrying", { count: assets.length }), true);
    for (const asset of assets) {
      const file = await fetchAssetFile(here, p.infrastructure, asset);
      if (!alive()) throw new Stop();
      const sent = file ? await uploadAsset(here, file) : null;
      if (!alive()) throw new Stop();
      if (!sent || !sent.ok || sent.receipt.asset !== asset) missing.add(asset);
    }
    return missing;
  }
  // La place d'un collage : l'écart donné (Ctrl+D, Alt + glissé), sinon au pointeur, sinon à la place d'origine, chaque
  // collage répété au même endroit décalant encore.
  function placeOf(p: Payload, where: Where): Point {
    const box = boundsOf(p);
    if (where.d || !box) return where.d || { x: 0, y: 0 };
    const pointer = where.pointer || null, at = pointer ? Math.round(pointer.x) + "," + Math.round(pointer.y) : "";
    const key = p.infrastructure + "\u0000" + keyOf(p.annotations.map((a) => a.id), p.connectors.map((c) => c.id));
    repeat = repeat && repeat.key === key && repeat.pointer === at ? { ...repeat, n: repeat.n + 1 } : { key, pointer: at, n: 1 };
    return offsetFor(box, pointer, repeat.n, current().prefs.snap);
  }
  const refusedText = (reason: string): string => (reason === "too_many" ? t("shell:clipboard.tooMany", { max: MAX_PASTE })
    : reason === "too_big" ? t("shell:clipboard.tooBig", { max: Math.round(MAX_REQUEST_BYTES / 1024) }) : t("shell:clipboard.empty"));
  /** Colle une charge ; sélectionne la copie. Rend la clé de la copie, ou `null` si rien n'a été collé. */
  async function paste(p: Payload, where: Where): Promise<string | null> {
    const h = handle();
    if (!h) return null;
    if (!pastable(p)) { note(p.hosts.length ? t("shell:clipboard.devicesNotPasted", { count: p.hosts.length }) : t("shell:clipboard.empty")); return null; }
    if (!editable()) { note(whyReadOnly()); return null; }
    const infrastructure = h.toile.model.source.infrastructure;
    const here: Session = { token: session().token, infrastructure }; // figée : rien ne part ailleurs (H1)
    const alive = (): boolean => handle() === h && session().infrastructure === infrastructure;
    waiting = null;
    const secrets = p.infrastructure === infrastructure || where.secrets ? 0 : secretsOf(p);
    if (secrets) {
      waiting = { p, where, infrastructure };
      dispatch({ type: "note", text: t("shell:clipboard.secretsAsk", { count: secrets, from: p.infrastructure, infrastructure }), offer: { kind: "secrets" }, at: Date.now() });
      return null;
    }
    if (p.infrastructure !== infrastructure && assetsOf(p).length > MAX_CARRIED) { note(t("shell:clipboard.tooManyImages", { max: MAX_CARRIED })); return null; }
    const d = placeOf(p, where);
    let written = false;
    try {
      const missing = await carryImages(p, here, alive);
      const planned = pastePlan(p, targetOf(h.toile), d, missing, t("shell:clipboard.imageMissing"));
      if (!planned.ok) { note(refusedText(planned.reason)); return null; }
      const { first, later, annotations, connectors, freed } = planned.plan;
      const extras = [p.hosts.length ? t("shell:clipboard.devicesNotPasted", { count: p.hosts.length }) : "", missing.size ? t("shell:clipboard.imagesMissing", { count: missing.size }) : "",
        freed ? t("shell:clipboard.freed", { count: freed }) : "", where.removed ? t("shell:clipboard.secretsRemoved", { count: where.removed }) : ""].filter(Boolean);
      const done = [t("shell:clipboard.pasted", { count: pastable(p), author: h.writer.author })].concat(extras).join(" · ");
      const writer = h.writer;
      await h.intents.apply(first, later.length ? t("shell:clipboard.pasting") : done);
      const answer = writer.outcomeOf(first[0]);
      if (!answer || !answer.ok) { note(t("shell:clipboard.refused", { reason: answer && !answer.ok ? answer.message : t("shell:messages.apiDown") })); return null; }
      written = true;
      if (!alive()) throw new Stop();
      // les identités de la réponse de cette requête (jamais d'un document lu depuis), vérifiées dans cette réponse (M2)
      const ids = createdIds(annotations, connectors, answer.intent.revision);
      const check = verifyCreated(answer.intent as Parameters<typeof verifyCreated>[0], first, ids, { annotations, connectors });
      const made: Item[] = check.found.map((id): Item => ({ kind: id.startsWith("c") ? "connector" : "annotation", id }));
      if (later.length) {
        if (!check.ok) return await undoPaste(h, first, t("shell:clipboard.idsUnknown"));
        const second = resolve(later, ids);
        h.undo.chain(second, first); // une seule entrée d'annulation pour tout le collage
        await h.intents.apply(second, t("shell:clipboard.pasting"));
        const again = writer.outcomeOf(second[0]);
        if (!again || !again.ok) {
          if (!alive()) throw new Stop();
          return await undoPaste(h, first, again && !again.ok ? again.message : t("shell:messages.apiDown"));
        }
        second.forEach((_, i) => made.push({ kind: "connector", id: "c" + again.intent.revision + "-" + (i + 1) }));
      }
      if (!alive()) throw new Stop();
      h.toile.selectItems(made);
      note(done);
      return keyOf(made.filter((i) => i.kind === "annotation").map((i) => i.id), made.filter((i) => i.kind === "connector").map((i) => i.id));
    } catch (error) {
      if (!(error instanceof Stop)) throw error;
      note(t(written ? "shell:clipboard.abandonedAfter" : "shell:clipboard.abandoned", { infrastructure }));
      return null;
    }
  }
  // La seconde requête n'a pas pu partir, ou a été refusée : la première est défaite (sans entrée), un seul message.
  async function undoPaste(h: CanvasHandle, first: Op[], reason: string): Promise<null> {
    const back = await h.undo.revert(first);
    if (handle() === h) h.toile.select(null);
    note(back.ok ? t("shell:clipboard.refused", { reason }) : t("shell:clipboard.partial", { reason, undo: back.message }));
    return null;
  }
  const remember = (key: string | null, d: Point): void => { lastStep = key ? { key, d } : lastStep; };
  const pointerNow = (): Point | null => { const h = handle(); return h ? h.toile.pointer : null; };
  // Le menu agit sur la sélection si l'élément visé en fait partie, sinon sur lui seul (qui devient la sélection).
  const aim = (what: Item | null | undefined): void => {
    const h = handle();
    if (h && what && !has(h.toile.state.multi, what)) h.toile.select(selectionOf(what));
  };

  // Ce qu'un presse-papiers natif contient : notre charge (format propre, sinon texte), une charge illisible, ou rien de nous.
  function ours(mime: string, text: string, empty: boolean): Payload | "unknown" | null {
    const own = parse(mime);
    const parsed = own.kind === "foreign" ? parse(text) : own;
    if (parsed.kind === "payload") return parsed.payload;
    if (parsed.kind === "unknown") return "unknown";
    if (internal && ((text && text === internal.text) || empty)) return internal.payload; // le texte de notre copie, ou le système vide
    return null;
  }
  function pasteOurs(found: Payload | "unknown", pointer: Point | null): void {
    if (found === "unknown") { note(t("shell:clipboard.unreadable")); return; }
    void paste(found, { pointer });
  }
  // Ce que le menu « coller » a lu : notre charge, sinon une image ou un texte d'ailleurs (comportement d'avant).
  async function pasteRead(items: ClipboardItems, at: Point): Promise<void> {
    const pick = async (type: string): Promise<string> => { const item = items.find((i) => i.types.includes(type)); return item ? (await item.getType(type)).text() : ""; };
    const mime = await pick(CLIP_WEB), text = await pick("text/plain");
    const found = ours(mime, text, !items.length);
    if (found) { pasteOurs(found, at); return; }
    const image = items.find((i) => i.types.some((type) => ["image/png", "image/jpeg", "image/webp"].includes(type)));
    if (!editable()) { if (image || text.trim()) note(whyReadOnly()); return; }
    const transfer = new DataTransfer();
    if (image) {
      const type = image.types.find((ty) => ty.startsWith("image/")) as string;
      transfer.items.add(new File([await image.getType(type)], "image", { type }));
    } else if (text.trim()) transfer.setData("text/plain", text);
    else { note(t("shell:clipboard.empty")); return; }
    deps.pasteForeign(transfer);
  }

  // Coller comme bloc de code : le texte tel quel, toujours un bloc (même non reconnu : texte brut) ; dans une page qui
  // ne s'écrit pas, rien, et la page dit pourquoi ; un presse-papiers sans texte le dit aussi.
  function pasteAsCode(text: string, at: Point | null): void {
    if (!editable()) { note(whyReadOnly()); return; }
    if (!text.trim()) { note(t("shell:code.noText")); return; }
    deps.pasteCode(text, at);
  }

  return {
    copyEvent: (data, cutting) => {
      const taken = take();
      if (!taken) return false;
      if (pastable(taken.payload)) data.setData(CLIP_MIME, JSON.stringify(taken.payload));
      data.setData("text/plain", taken.text);
      afterCopy(taken, cutting);
      return true;
    },
    copyFromMenu: (cutting, what) => {
      aim(what);
      const taken = take();
      if (!taken) return;
      const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      const plain = new Blob([taken.text], { type: "text/plain" });
      const rich = typeof ClipboardItem === "undefined" ? null : (() => { try { return new ClipboardItem({ [CLIP_WEB]: new Blob([taken.text], { type: CLIP_WEB }), "text/plain": plain }); } catch (error) { return null; } })();
      const written = !clip ? Promise.reject(new Error("no clipboard"))
        : (rich ? clip.write([rich]) : Promise.reject(new Error("no item"))).catch(() => clip.writeText(taken.text));
      // couper supprime ce qui a été pris au clic (la charge), quelle que soit la sélection au retour de l'écriture
      void written.then(() => afterCopy(taken, cutting), () => afterCopy({ ...taken, said: taken.said + " · " + t("shell:clipboard.tabOnly") }, cutting));
    },
    pasteEvent: (data) => {
      const types = Array.from(data.types || []);
      const found = ours(data.getData(CLIP_MIME), data.getData("text/plain"), !types.length);
      if (found) { pasteOurs(found, pointerNow()); return true; }
      if (!editable()) { // une image ou un texte d'ailleurs, dans une page qui ne s'écrit pas : rien, et la page le dit
        const files = Array.from(data.files || []).length, text = (data.getData("text/plain") || "").trim();
        if (files || text) { note(whyReadOnly()); return true; }
        return false;
      }
      return deps.pasteForeign(data);
    },
    pasteFromMenu: (at) => {
      const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      const refused = (): void => { if (internal) void paste(internal.payload, { pointer: at }); else note(t("shell:clipboard.readRefused")); };
      if (!clip || typeof clip.read !== "function") { refused(); return; }
      // un refus de lecture n'est pas un échec de collage : deux messages (revue, B6)
      void clip.read().then((items) => pasteRead(items, at).catch(() => note(t("shell:clipboard.pasteFailed"))), refused);
    },
    pasteCodeEvent: (data) => pasteAsCode(data.getData("text/plain") || "", pointerNow()),
    pasteCodeFromMenu: (at) => {
      if (!editable()) { note(whyReadOnly()); return; }
      const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      // notre propre copie, si le navigateur refuse la lecture : son texte (des noms, des notes) devient le bloc
      const refused = (): void => { if (internal && internal.text) pasteAsCode(internal.text, at); else note(t("shell:clipboard.readRefused")); };
      if (!clip || typeof clip.readText !== "function") { refused(); return; }
      void clip.readText().then((text) => pasteAsCode(text, at), refused);
    },
    duplicate: (what) => {
      aim(what);
      const p = selected();
      if (!p) return false;
      if (!pastable(p)) {
        if (p.hosts.length || groupsSelected()) { note(p.hosts.length ? t("shell:clipboard.devicesNotPasted", { count: p.hosts.length }) : t("shell:clipboard.groupsNotCopied", { count: groupsSelected() })); return true; }
        return false;
      }
      const key = keyOf(p.annotations.map((a) => a.id), p.connectors.map((c) => c.id));
      const step = duplicateStep(lastStep, key), n = (flying.get(key) || 0) + 1; // un Ctrl+D encore en vol : un pas de plus (B1)
      flying.set(key, n);
      void paste(p, { d: { x: step.x * n, y: step.y * n } }).then((made) => remember(made, step)).finally(() => {
        const left = (flying.get(key) || 1) - 1;
        if (left > 0) flying.set(key, left); else flying.delete(key);
      });
      return true;
    },
    cloneDrop: (items, d) => {
      const p = selected(items);
      if (!p) return;
      if (!pastable(p)) {
        const groups = groupsIn(items);
        note(p.hosts.length ? t("shell:clipboard.devicesNotPasted", { count: p.hosts.length }) : groups ? t("shell:clipboard.groupsNotCopied", { count: groups }) : t("shell:clipboard.empty"));
        return;
      }
      void paste(p, { d }).then((made) => remember(made, d));
    },
    pasteSecrets: (choice) => {
      const w = waiting, h = handle();
      waiting = null;
      dispatch({ type: "note", text: null });
      if (!w) return;
      // la toile a changé entre la question et la réponse : rien ne part ailleurs (revue du lot 3, H1)
      if (!h || h.toile.model.source.infrastructure !== w.infrastructure) { note(t("shell:clipboard.abandoned", { infrastructure: w.infrastructure })); return; }
      const removed = choice === "remove" ? secretsOf(w.p) : 0;
      void paste(choice === "remove" ? withoutSecrets(w.p) : w.p, { ...w.where, secrets: choice, removed });
    },
  };
}
