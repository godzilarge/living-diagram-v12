// La barre d'un parcours (lot 3 de la revue Impeccable, 2026-10-07) : sous la barre d'outils, ce qu'on parcourt
// (« 4 équipements en erreur »), où l'on en est, l'équipement montré ; ↑↓ ou les flèches de la barre avancent, Échap
// ou la croix finissent et rendent la sélection et la vue d'avant. Les équipements du compte restent éclairés.
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useStore } from "../state/store";
import { walkLabel } from "../state/walk";
import { Button, Kbd } from "../ui";

export function WalkBar() {
  const { state, commands } = useStore();
  const { t } = useTranslation();
  const walk = state.walk;
  if (!walk) return null;
  const host = walk.hosts[walk.index], n = walk.hosts.length;
  const what = walkLabel(walk.kind, n);
  return (
    <div className={"walk glass walk-" + walk.kind} role="group" aria-label={t("walk.label", { what })}>
      <span className="walk-dot" aria-hidden="true" />
      <span className="walk-what">{what}</span>
      <span className="walk-sep" aria-hidden="true" />
      <Button variant="ghost" icon aria-label={t("walk.previous")} title={t("walk.previousTitle")} onClick={() => commands.stepWalk(-1)}><ChevronUp /></Button>
      <span className="walk-pos"><b>{walk.index + 1}</b>/{n}</span>
      <Button variant="ghost" icon aria-label={t("walk.next")} title={t("walk.nextTitle")} onClick={() => commands.stepWalk(1)}><ChevronDown /></Button>
      <code className="walk-host">{host}</code>
      <span className="walk-keys" aria-hidden="true"><Kbd>↑</Kbd><Kbd>↓</Kbd><Kbd>{t("keys.escape")}</Kbd></span>
      <Button variant="ghost" icon aria-label={t("walk.end")} title={t("walk.endTitle")} onClick={commands.endWalk}><X /></Button>
      <span className="sr-only" aria-live="polite">{t("walk.position", { at: walk.index + 1, total: n, host })}</span>
    </div>
  );
}
