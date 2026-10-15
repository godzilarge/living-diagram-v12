// Les commandes du bloc de code (lot 16 de docs/11), sorties du store comme celles du presse-papiers : insérer (un
// brouillon s'ouvre, rien n'existe avant le premier enregistrement), coller un texte de code (trois lignes au moins et un
// langage reconnu : un bloc avec son langage, sinon une note comme avant), enregistrer un texte (après l'avertissement
// des valeurs sensibles, que la toile montre), copier, retirer les valeurs sensibles d'un bloc, régler langage, police,
// coloration, numéros et hauteur d'un ou de plusieurs blocs. Tout s'écrit par l'hôte d'intention : sous le nom, au
// journal, dans la pile d'annulation (Ctrl+Z défait un collage comme une modification). Sans minuterie (la page fournit
// le retour de l'icône « copié »). Revue du 2026-10-15 : un texte collé qui porte une valeur sensible passe toujours par
// l'avertissement, même court ou sans langage sûr (M3) ; un texte trop long garde son brouillon (M2) ; un brouillon
// appartient à l'infrastructure où il est né (B6).
import { t } from "../../i18n";
import type { Point } from "../../canvas/layout";
import type { Annotation } from "../../canvas/types";
import type { CodeContent } from "../../contracts/intent";
import type { Op } from "../../shell/apps";
import { DEFAULT_SIZE, DEFAULT_STYLE } from "../../canvas/annotations";
import { CODE, fitHeight, lineCount, pasteWidth } from "../code/geometry";
import { DEFAULT_CODE_CONTENT, LANGUAGE_LABEL, detectLanguage, normalizeCode, pasteChoice } from "../code/languages";
import type { LanguageId } from "../code/languages";
import { findSecrets, maskSecrets } from "../code/secrets";
import { codeView } from "../code/view";
import type { CodeDraft } from "../code/view";
import type { CanvasHandle } from "./store";
import type { Action, AppState } from "./types";
import { snapped } from "./clipboard";

export const CODE_MAX = 20_000;
/** Un texte collé plus long que ceci est refusé avant d'être lu (la normalisation et la détection coûtent ~0,7 s sur
 *  4 Mo) : quatre fois la borne, la marge d'un texte à tabulations (une tabulation devient au plus quatre espaces). */
export const PASTE_RAW_MAX = CODE_MAX * 4;
/** Un bloc inséré : douze lignes à la taille du code. */
const INSERT_LINES = 12;
/** Ce que la page dit après un enregistrement : rien de plus, les valeurs retirées, ou gardées telles quelles. */
export type CodeOutcome = "plain" | "removed" | "kept";
export interface CodeCommands {
  /** Insérer (barre d'outils, menu du fond) : un brouillon vide au point du plan, l'écriture ouverte. */
  codeInsert: (at: Point | null) => void;
  /** Un texte collé : un bloc s'il ressemble à du code ou porte une valeur sensible (rend vrai), sinon rien (la page en
   *  fait une note). `force` : « coller comme bloc de code » (Ctrl+Maj+V, menu du fond), toujours un bloc, langage
   *  détecté même non sûr, sinon texte brut ; `at` : le point du plan visé (le menu), sinon le pointeur. */
  codePaste: (raw: string, options?: { force?: boolean; at?: Point | null }) => boolean;
  /** Le brouillon enregistré avec ce texte (déjà vu : valeurs retirées ou gardées) ; abandonné si le texte est vide.
   *  Rend faux si rien ne part et que le brouillon reste ouvert (texte trop long). */
  codeCreate: (draft: CodeDraft, text: string, outcome: CodeOutcome, removed: number) => boolean;
  codeCancel: () => void;
  /** Le texte d'un bloc existant, enregistré (déjà vu). */
  codeSave: (id: string, text: string, outcome: CodeOutcome, removed: number) => void;
  /** Copier le texte tel qu'enregistré (une valeur retirée reste retirée). */
  codeCopy: (id: string) => void;
  /** Retirer d'un coup les valeurs sensibles d'un bloc (la fiche le propose tant qu'il en reste). */
  codeRemoveSecrets: (id: string) => void;
  /** Un réglage du contenu (langage, police, coloration, numéros, titre) pour un ou plusieurs blocs, en une écriture. */
  codeSet: (ids: string[], patch: Partial<Pick<CodeContent, "language" | "font" | "highlight" | "line_numbers" | "title">>) => void;
  /** Ajuster la hauteur au contenu (60 lignes au plus). */
  codeFit: (ids: string[]) => void;
  /** Dire quelque chose sur la ligne d'état (un bloc verrouillé, un texte trop long). */
  codeSay: (text: string) => void;
}

export interface CodeDeps { dispatch: (action: Action) => void; current: () => AppState; handle: () => CanvasHandle | null }

const contentOf = (h: CanvasHandle, id: string): { a: Annotation; c: CodeContent } | null => {
  const a = h.toile.model.annotationById.get(id);
  return a && a.content.kind === "code" ? { a, c: a.content } : null;
};

export function codeCommands({ dispatch, current, handle }: CodeDeps): CodeCommands {
  // sur la grille si l'aimant est mis, comme toute insertion (revue de session, J1)
  const snap = (v: number): number => snapped(v, current().prefs.snap);
  const say = (text: string): void => dispatch({ type: "note", text, at: Date.now() });
  const outcomeText = (outcome: CodeOutcome, removed: number): string => (outcome === "removed" ? t("shell:code.removed", { count: removed }) : outcome === "kept" ? t("shell:code.kept") : "");
  const ready = (text: string): boolean => {
    if (text.length > CODE_MAX) { say(t("shell:code.tooLong", { max: CODE_MAX })); return false; }
    return true;
  };
  const write = (ops: Op[], done: string): void => { const h = handle(); if (h) void h.intents.apply(ops, done); };
  const commands: CodeCommands = {
    codeInsert: (at) => {
      const h = handle();
      if (!h || !h.intents.canWrite()) return;
      const w = DEFAULT_SIZE.code.w, hh = fitHeight(INSERT_LINES, DEFAULT_STYLE.code.text_size);
      const c = at || ((p) => ({ x: p.x - w / 2, y: p.y - hh / 2 }))(h.toile.viewCenter());
      codeView.setDraft({ key: codeView.nextKey(), infrastructure: h.toile.model.source.infrastructure, text: "", language: "plain", sure: false, x: snap(c.x), y: snap(c.y), w, h: hh, pasted: false });
    },
    codePaste: (raw, options = {}) => {
      const h = handle();
      if (!h || !h.intents.canWrite()) return false;
      // la longueur brute d'abord : un texte démesuré n'est ni normalisé ni lu (revue, B3)
      if (raw.length > PASTE_RAW_MAX) { say(t("shell:code.tooLong", { max: CODE_MAX })); return true; }
      const text = normalizeCode(raw);
      // un texte qui porte une valeur sensible passe par l'avertissement, quels que soient sa longueur et son langage :
      // une note n'en a pas (revue, M3) ; « coller comme bloc de code » en fait toujours un bloc (pasteChoice)
      const secret = findSecrets(text).length > 0, choice = pasteChoice(text, { secret, force: !!options.force });
      if (choice.as === "nothing") { if (options.force) say(t("shell:code.noText")); return !!options.force; }
      if (choice.as === "note") return false;
      if (!ready(text)) return true;
      const w = pasteWidth(text), hh = fitHeight(lineCount(text), 13, CODE.PASTE_MAX);
      // au point visé (menu), sinon au pointeur s'il est sur la toile ; sinon au centre de la vue, décalé à gauche pour
      // que l'avertissement tienne à droite
      const center = h.toile.viewCenter(), p = options.at || h.toile.pointer;
      const at = p ? { x: p.x, y: p.y } : { x: center.x - w / 2 - 240, y: center.y - hh / 2 };
      const draft: CodeDraft = { key: codeView.nextKey(), infrastructure: h.toile.model.source.infrastructure, text, language: choice.language, sure: choice.sure, x: snap(at.x), y: snap(at.y), w, h: hh, pasted: true };
      // sans valeur sensible, le bloc s'enregistre aussitôt ; sinon le brouillon s'ouvre avec l'avertissement (la toile)
      if (secret) codeView.setDraft(draft); else commands.codeCreate(draft, text, "plain", 0);
      return true;
    },
    codeCreate: (draft, raw, outcome, removed) => {
      const h = handle();
      const text = normalizeCode(raw);
      // un brouillon né dans une autre infrastructure ne s'écrit jamais ici : ses coordonnées n'y veulent rien dire (B6)
      if (h && h.toile.model.source.infrastructure !== draft.infrastructure) { codeView.setDraft(null); say(t("shell:code.draftElsewhere", { infrastructure: draft.infrastructure })); return true; }
      if (!h || !text.trim()) { codeView.setDraft(null); say(t("shell:code.abandoned")); return true; }
      if (!ready(text)) return false; // le brouillon reste ouvert, avec ce qui a été écrit (M2)
      codeView.setDraft(null);
      // un brouillon inséré vide est « texte brut » : la détection propose le langage de ce qu'on y a écrit
      const guess = draft.language === "plain" ? detectLanguage(text) : null;
      const language: LanguageId = guess && guess.sure ? guess.id : draft.language;
      const content: CodeContent = { ...DEFAULT_CODE_CONTENT, text, language };
      const lines = lineCount(text), hh = draft.pasted ? draft.h : Math.max(draft.h, fitHeight(lines, 13, CODE.PASTE_MAX));
      // un collage en texte brut n'a rien de « reconnu » ni de « proposé » : il dit seulement ce qu'il est
      const created = t(draft.pasted && language !== "plain" ? (draft.sure ? "shell:code.createdSure" : "shell:code.createdGuess") : "shell:code.created", { count: lines, language: LANGUAGE_LABEL[language] });
      const extra = outcomeText(outcome, removed);
      void h.intents.onAnnotation([{ op: "annotation_create", content, x: draft.x, y: draft.y, w: draft.w, h: hh }], extra ? created + " · " + extra : created).then((intent) => {
        if (!intent) return;
        const id = "a" + intent.revision + "-1";
        if (h.toile.model.annotationById.has(id)) h.toile.reveal({ kind: "annotation", id });
      });
      return true;
    },
    codeCancel: () => { if (codeView.draft()) { codeView.setDraft(null); say(t("shell:code.abandoned")); } },
    codeSave: (id, raw, outcome, removed) => {
      const h = handle(), found = h ? contentOf(h, id) : null;
      if (!h || !found) return;
      const text = normalizeCode(raw);
      if (!text.trim() || !ready(text)) return;
      if (text === found.c.text) { if (outcome !== "plain") say(outcomeText(outcome, removed)); return; }
      const done = t("shell:messages.annotationChanged");
      const extra = outcomeText(outcome, removed);
      write([{ op: "annotation_update", id, content: { ...found.c, text } }], extra ? done + " · " + extra : done);
    },
    codeCopy: (id) => {
      const h = handle(), found = h ? contentOf(h, id) : null;
      if (!found) return;
      const text = found.c.text, title = found.c.title;
      const copied = (ok: boolean): void => {
        codeView.setCopied(ok ? id : null);
        say(ok ? t(title ? "shell:code.copiedOf" : "shell:code.copied", { count: lineCount(text), title }) : t("shell:code.copyRefused"));
      };
      const fallback = (): boolean => {
        if (typeof document === "undefined") return false;
        const area = document.createElement("textarea");
        area.value = text; area.setAttribute("aria-hidden", "true"); area.className = "sr-only";
        document.body.appendChild(area); area.select();
        let ok = false;
        try { ok = document.execCommand("copy"); } catch (error) { ok = false; }
        area.remove();
        return ok;
      };
      const api = typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function" ? navigator.clipboard : null;
      if (!api) { copied(fallback()); return; }
      api.writeText(text).then(() => copied(true), () => copied(fallback()));
    },
    codeRemoveSecrets: (id) => {
      const h = handle(), found = h ? contentOf(h, id) : null;
      if (!found) return;
      const secrets = findSecrets(found.c.text);
      if (!secrets.length) return;
      // l'historique (le journal) garde la valeur d'avant : la page le dit (revue, M5) ; Ctrl+Z ne la rétablit pas (J2)
      write([{ op: "annotation_update", id, content: { ...found.c, text: maskSecrets(found.c.text, secrets) } }], t("shell:code.removedKeptInLog", { count: secrets.length }));
    },
    codeSet: (ids, patch) => {
      const h = handle();
      if (!h) return;
      const ops: Op[] = ids.flatMap((id) => { const found = contentOf(h, id); return found ? [{ op: "annotation_update" as const, id, content: { ...found.c, ...patch } }] : []; });
      if (ops.length) write(ops, t("shell:messages.annotationChanged"));
    },
    codeFit: (ids) => {
      const h = handle();
      if (!h) return;
      const ops: Op[] = ids.flatMap((id) => {
        const found = contentOf(h, id);
        if (!found) return [];
        const hh = fitHeight(lineCount(found.c.text), found.a.style.text_size);
        return hh === found.a.h ? [] : [{ op: "annotation_update" as const, id, h: hh }];
      });
      ids.forEach((id) => codeView.setFirst(id, 0));
      if (ops.length) write(ops, t("shell:messages.annotationChanged"));
    },
    codeSay: say,
  };
  return commands;
}
