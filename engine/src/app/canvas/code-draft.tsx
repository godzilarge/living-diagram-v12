// Le brouillon d'un bloc de code (lot 16 de docs/11) : un collage qui porte des valeurs sensibles, ou une insertion
// (barre d'outils, menu du fond), n'existe pas encore. Il se dessine dans le plan, à sa place, avec le même dessin qu'un
// bloc enregistré et l'écriture ouverte ; l'avertissement s'ouvre d'emblée pour un collage. Rien n'est enregistré avant
// le choix (retirer, garder, modifier) ; Échap abandonne et la page le dit. Une couche à part (`ViewportPortal`), lue
// dans l'état de vue des blocs (code/view.ts) : ouvrir ou fermer un brouillon ne reconstruit pas la toile. Un brouillon
// appartient à l'infrastructure où il est né : ailleurs, il n'est pas montré et s'abandonne en le disant (revue du
// 2026-10-15, B6) ; la toile démontée (autre run), l'écriture démontée l'abandonne aussi.
import { ViewportPortal } from "@xyflow/react";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { t } from "../../i18n";
import { DEFAULT_STYLE } from "../../canvas/annotations";
import type { Annotation } from "../../canvas/types";
import type { CodeContent } from "../../contracts/intent";
import { fitHeight, lineCount } from "../code/geometry";
import { DEFAULT_CODE_CONTENT } from "../code/languages";
import { codeView } from "../code/view";
import type { CodeDraft } from "../code/view";
import { CodeBody, codeLabel, useCode } from "./code";
import { CodeEditor } from "./code-edit";

const contentOf = (d: CodeDraft): CodeContent => ({ ...DEFAULT_CODE_CONTENT, text: d.text || " ", language: d.language });
const annotationOf = (d: CodeDraft, c: CodeContent): Annotation => ({ id: "draft-" + d.key, anchor: { kind: "free", ref: null }, x: d.x, y: d.y, w: d.w, h: d.h, z: "front", locked: false, leader: false,
  content: c, style: DEFAULT_STYLE.code, author: "", at: "" });

export function CodeDraftLayer() {
  const draft = useSyncExternalStore(codeView.subscribe, codeView.draft, codeView.draft);
  const { commands, infrastructure } = useCode();
  const elsewhere = !!draft && draft.infrastructure !== infrastructure;
  useEffect(() => {
    if (!draft || !elsewhere) return;
    codeView.setDraft(null);
    if (commands) commands.codeSay(t("shell:code.draftElsewhere", { infrastructure: draft.infrastructure }));
  }, [draft, elsewhere, commands]);
  return draft && !elsewhere ? <ViewportPortal><Draft key={draft.key} draft={draft} /></ViewportPortal> : null;
}

function Draft({ draft }: { draft: CodeDraft }) {
  const { commands, infrastructure } = useCode();
  const box = useRef<HTMLDivElement>(null);
  // un brouillon de collage s'écrit dans au moins dix-huit lignes (on relit avant d'enregistrer)
  const h = Math.max(draft.h, draft.pasted ? fitHeight(Math.min(lineCount(draft.text), 18), 13) : draft.h);
  const c = contentOf(draft), a = annotationOf({ ...draft, h }, c);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.setProperty("--dx", draft.x + "px");
    el.style.setProperty("--dy", draft.y + "px");
    el.style.setProperty("--dw", draft.w + "px");
    el.style.setProperty("--dh", h + "px");
  }, [draft.x, draft.y, draft.w, h]);
  return (
    <div ref={box} className="code-draft annotation kind-code hue-slate selected code-editing" data-draft={draft.key}>
      <svg width={draft.w} height={h} viewBox={`0 0 ${draft.w} ${h}`} overflow="visible" aria-hidden="true"><CodeBody a={a} c={c} w={draft.w} h={h} first={0} editing idSuffix="-draft" /></svg>
      <CodeEditor w={draft.w} h={h} size={CODE_SIZE} font={c.font} numbers initial={draft.text} first={0} warnAtOnce={draft.pasted} saveOnLeave={false}
        label={t("shell:code.editorLabel", { name: codeLabel(c) })} infrastructure={infrastructure}
        onDone={(text, outcome, removed) => {
          if (!commands) return;
          if (text === null) { commands.codeCancel(); return; }
          // refusé sans rien écrire (trop long) : le brouillon se rouvre avec son texte, rien n'est perdu (revue, M2)
          if (!commands.codeCreate(draft, text, outcome, removed)) codeView.setDraft({ ...draft, key: codeView.nextKey(), text, pasted: false });
        }} />
    </div>
  );
}
const CODE_SIZE = DEFAULT_STYLE.code.text_size;
