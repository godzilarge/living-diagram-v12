// Les composants d'interface de l'application, maison : bouton, bascule, badge, touche, champ. Du texte, jamais du
// HTML depuis une donnée ; les variantes sont des classes (tokens.css, app.css), jamais un style en ligne.
import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { DIFF_LABEL, SOURCE_LABEL, STATUS_LABEL } from "../../canvas/format";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "default"; icon?: boolean };
export function Button({ variant = "default", icon = false, className = "", children, ...rest }: ButtonProps) {
  const classes = ["btn", variant === "default" ? "" : "btn-" + variant, icon ? "btn-icon" : "", className].filter(Boolean).join(" ");
  return <button type="button" className={classes} {...rest}>{children}</button>;
}

type ToggleProps = ButtonHTMLAttributes<HTMLButtonElement> & { pressed: boolean };
export function Toggle({ pressed, children, ...rest }: ToggleProps) {
  return <button type="button" className="toggle" aria-pressed={pressed ? "true" : "false"} {...rest}>{children}</button>;
}

// Le ton d'une pastille selon ce qu'elle dit (la couleur des données : canvas.css, app.css `.pill`) ; même forme pour
// toutes, seule la couleur change (Orhan, 2026-10-07).
const TONES: Record<string, Record<string, string>> = {
  status: { confirmed: "ok", observed_only: "observed", documented_only: "documented" },
  source: { lldp: "observed", cdp: "observed", description: "documented" },
  severity: { error: "danger", warning: "warning", info: "info" },
  collection: { unreachable: "danger", failed: "danger", partial: "warning", not_collected: "info" },
  oper: { down: "danger", up: "ok" },
  state: { down: "danger", up: "ok" },
  diff: { added: "added", changed: "changed", removed: "removed" },
  ha: { lead: "ok", follow: "muted", plain: "structure" },
  kind: { external: "structure", stub: "muted" },
  pin: { orphan: "warning" },
};
export const toneOf = (kind: string, value: string): string => (TONES[kind] && TONES[kind][value]) || (kind === "structure" ? "structure" : kind === "state" ? "muted" : "neutral");

/** Une pastille : un fait court, en capitales ; `kind` et `value` donnent son ton (une sorte de stub : pointillée). */
export function Badge({ kind, value, label, title, icon }: { kind: string; value: string; label?: ReactNode; title?: string; icon?: ReactNode }) {
  const classes = "pill tone-" + toneOf(kind, value) + (kind === "kind" && value === "stub" ? " dashed" : "");
  return <span className={classes} title={title}>{icon}{label === undefined ? value : label}</span>;
}
export const StatusBadge = ({ status }: { status: string }) => <Badge kind="status" value={status} label={STATUS_LABEL[status] || status} />;
export const SourceBadge = ({ source }: { source: string }) => <Badge kind="source" value={source} label={SOURCE_LABEL[source] || source} />;
export const DiffBadge = ({ kind }: { kind: string }) => <Badge kind="diff" value={kind} label={DIFF_LABEL[kind] || kind} />;
export const SeverityBadge = ({ severity, count }: { severity: string; count?: number }) => (
  <Badge kind="severity" value={severity} label={count === undefined ? severity : <><b>{count}</b> {severity}</>} />
);

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="kbd">{children}</kbd>;

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string };
export function Field({ label, hint, ...rest }: FieldProps) {
  return <label className="field">{label}<input {...rest} />{hint ? <span className="hint">{hint}</span> : null}</label>;
}

export const plural = (count: number, word: string, words?: string): string => count + " " + (count > 1 ? words || word + "s" : word);

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
/** Un dialogue : il prend le focus à l'ouverture (`initial`, sinon le premier élément atteignable), le rend à la
 *  fermeture, se ferme sur Échap ; `modal`, il garde Tab chez lui. Le menu, la palette des types et l'accueil
 *  l'utilisent (revue Impeccable du 2026-10-07 : le focus restait sur la page derrière). */
export function Dialog({ label, onClose, modal = true, initial, className, children }: { label: string; onClose?: () => void; modal?: boolean; initial?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null, box = ref.current;
    if (box) ((initial ? box.querySelector<HTMLElement>(initial) : null) || box.querySelector<HTMLElement>(FOCUSABLE) || box).focus();
    // Rien à qui rendre le focus (l'accueil, ouvert au chargement) : il va au début de l'application, et Tab repart
    // de la barre plutôt que de là où était le dialogue.
    return () => {
      const back = before && before !== document.body && document.contains(before) ? before : document.querySelector<HTMLElement>(".app");
      if (back) back.focus({ preventScroll: true });
    };
  }, []); // à l'ouverture seulement
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && onClose) { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key !== "Tab" || !modal || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return <div ref={ref} role="dialog" aria-modal={modal ? "true" : undefined} aria-label={label} tabIndex={-1} className={className} onKeyDown={keys}>{children}</div>;
}
