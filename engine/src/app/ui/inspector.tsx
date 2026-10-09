// L'inspecteur : la grammaire unique des fiches du panneau (critique Impeccable du 2026-10-08, 21/40 : huit hauteurs
// de contrôle, des curseurs natifs, trois générations de composants côte à côte). Une seule hauteur (30), un seul fond
// de champ, des rangées « libellé | valeur », des sections repliables, un en-tête figé avec les actions en icônes et
// un menu « … » pour le reste. L'accent ne marque que le focus ; un choix actif se lit par un fond relevé, pas par la
// couleur. Styles : inspector.css (classes seulement, jamais de style en ligne : CSP `style-src 'self'`).
import { Check, ChevronDown, ChevronsLeftRight, Minus, MoreHorizontal, Plus } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";

const cx = (...names: (string | false | null | undefined)[]): string => names.filter(Boolean).join(" ");

/** Ferme un volet sur un clic au-dehors ou sur Échap ; rend le focus au déclencheur. */
function useDismiss(open: boolean, close: () => void, box: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!open) return undefined;
    const down = (event: globalThis.PointerEvent): void => { if (box.current && !box.current.contains(event.target as Node)) close(); };
    const key = (event: globalThis.KeyboardEvent): void => { if (event.key === "Escape") { event.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
  }, [open, close, box]);
}

// ---------- l'en-tête et les sections ----------

/** L'en-tête d'une fiche : la sorte (icône et mot), les actions en icônes, le titre, la ligne de méta, les pastilles
 *  d'état. Figé en haut du panneau ; la croix de fermeture est posée par le panneau, à droite de la rangée. */
export function InspectorHead({ icon, kind, actions, title, meta, badges, children }: {
  icon: ReactNode; kind: string; actions?: ReactNode; title: ReactNode; meta?: ReactNode; badges?: ReactNode; children?: ReactNode;
}) {
  return (
    <header className="insp-head">
      <div className="insp-bar"><span className="insp-kind">{icon}{kind}</span><span className="insp-actions">{actions}</span></div>
      <div className="insp-title-row">{title}</div>
      {meta ? <p className="insp-meta">{meta}</p> : null}
      {badges ? <div className="insp-badges">{badges}</div> : null}
      {children}
    </header>
  );
}

/** Un titre de fiche ; `mono` pour un identifiant (hostname, port), jamais pour un nom choisi par quelqu'un. */
export const Title = ({ children, mono = false }: { children: ReactNode; mono?: boolean }) => <h2 className={cx("insp-title", mono && "mono")}>{children}</h2>;

/** Un titre éditable en place : il n'envoie qu'en quittant le champ ou sur Entrée ; Échap rend la valeur d'avant. */
export function TitleInput({ value, label, max, onCommit }: { value: string; label: string; max: number; onCommit: (value: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const commit = (): void => { const next = local.trim(); if (next && next !== value) onCommit(next); else setLocal(value); };
  return (
    <input className="insp-title insp-title-input" value={local} maxLength={max} aria-label={label} spellCheck={false}
      onChange={(event) => setLocal(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); (event.target as HTMLInputElement).blur(); } if (event.key === "Escape") { event.stopPropagation(); setLocal(value); } }} />
  );
}

// L'état replié d'une section survit au changement de fiche le temps de la page, par sorte de fiche et par titre : on
// replie « Texte » sur une note, il reste replié d'une note à l'autre, pas sur un connecteur. Rien dans l'adresse ni
// dans le navigateur.
const opened = new Map<string, boolean>();
const Scope = createContext("");

/** La racine d'une fiche : `kind` (note, groupe, équipement…) borne la mémoire de ses sections repliées. */
export function Inspector({ kind, children }: { kind: string; children: ReactNode }) {
  return <Scope.Provider value={kind}><div className="insp">{children}</div></Scope.Provider>;
}

/** Une section : un titre en casse normale, un compte, une action à droite ; repliable si `collapsible`. */
export function Section({ title, count, action, collapsible = false, defaultOpen = true, children }: {
  title: string; count?: ReactNode; action?: ReactNode; collapsible?: boolean; defaultOpen?: boolean; children: ReactNode;
}) {
  const key = useContext(Scope) + ":" + title;
  const [open, setOpen] = useState(() => (collapsible ? opened.get(key) ?? defaultOpen : true));
  const body = useId();
  const toggle = (): void => { opened.set(key, !open); setOpen(!open); };
  const label = <><span className="insp-section-title">{title}</span>{count !== undefined && count !== null ? <span className="insp-count">{count}</span> : null}</>;
  return (
    <section className={cx("insp-section", collapsible && !open && "closed")}>
      <div className="insp-section-head">
        {collapsible
          ? <button type="button" className="insp-section-toggle" aria-expanded={open ? "true" : "false"} aria-controls={body} onClick={toggle}>{label}<ChevronDown className="insp-chevron" aria-hidden="true" /></button>
          : <h3 className="insp-section-static">{label}</h3>}
        {action ? <span className="insp-section-action">{action}</span> : null}
      </div>
      {open ? <div className="insp-section-body" id={body}>{children}</div> : null}
    </section>
  );
}

/** Une rangée « libellé | valeur » ; `stack` pose la valeur sous le libellé (zone de texte, liste). */
export function Row({ label, children, stack = false, htmlFor }: { label: string; children: ReactNode; stack?: boolean; htmlFor?: string }) {
  return (
    <div className={cx("insp-row", stack && "stack")}>
      {htmlFor ? <label className="insp-label" htmlFor={htmlFor}>{label}</label> : <span className="insp-label">{label}</span>}
      <div className="insp-value">{children}</div>
    </div>
  );
}
/** Deux valeurs sur une rangée (X | Y, police | taille). */
export const Pair = ({ children }: { children: ReactNode }) => <div className="insp-pair">{children}</div>;

/** Une ligne de lecture : un fait, en gris discret (le rappel du nom, une borne de format). Jamais une phrase d'aide. */
export const Hint = ({ icon, children }: { icon?: ReactNode; children: ReactNode }) => <p className="insp-hint">{icon}{children}</p>;

// ---------- les boutons ----------

/** Une action en icône (30 × 30) ; son nom en infobulle et pour les lecteurs d'écran. */
export function IconButton({ label, onClick, pressed, disabled, children }: { label: string; onClick: () => void; pressed?: boolean; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className="ibtn" aria-label={label} title={label} aria-pressed={pressed === undefined ? undefined : pressed ? "true" : "false"} disabled={disabled} onClick={onClick}>{children}</button>;
}

/** Un bouton texte : secondaire par défaut ; `primary` une seule fois par fiche, quand il crée. */
export function TextButton({ onClick, primary = false, block = false, disabled, title, type = "button", children }: {
  onClick?: () => void; primary?: boolean; block?: boolean; disabled?: boolean; title?: string; type?: "button" | "submit"; children: ReactNode;
}) {
  return <button type={type} className={cx("pbtn", primary && "primary", block && "block")} disabled={disabled} title={title} onClick={onClick}>{children}</button>;
}

/** Un lien d'action dans le texte (« et 8 autres câbles », « plus ») : aligné au bord, sans cadre. */
export const MoreLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => <button type="button" className="insp-more" onClick={onClick}>{children}</button>;

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean; separated?: boolean };

/** Le menu « … » : les actions moins fréquentes ; la destructrice en dernier, en rouge, sous un filet. */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const close = (): void => setOpen(false);
  useDismiss(open, close, box);
  useEffect(() => { if (open && list.current) { const first = list.current.querySelector<HTMLElement>("button:not([disabled])"); if (first) first.focus(); } }, [open]);
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const all = Array.from(list.current ? list.current.querySelectorAll<HTMLElement>("button:not([disabled])") : []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = all[(at + (event.key === "ArrowDown" ? 1 : all.length - 1)) % all.length];
    if (next) next.focus();
  };
  if (!items.length) return null;
  // une seule action, destructive : elle se montre telle quelle (un menu qui ne contient que « supprimer » cache pour rien)
  if (items.length === 1 && items[0].danger) return <IconButton label={items[0].label} disabled={items[0].disabled} onClick={items[0].onSelect}>{items[0].icon}</IconButton>;
  return (
    <div className="insp-menu" ref={box}>
      <IconButton label={label} pressed={open} onClick={() => setOpen(!open)}><MoreHorizontal /></IconButton>
      {open ? (
        <div className="popover menu" role="menu" aria-label={label} ref={list} onKeyDown={keys}>
          {items.map((item, i) => (
            <div key={item.label} className={cx(item.separated && i > 0 && "menu-sep")}>
              <button type="button" role="menuitem" className={cx("menu-item", item.danger && "danger")} disabled={item.disabled}
                onClick={() => { close(); item.onSelect(); }}>{item.icon}<span>{item.label}</span></button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- les champs ----------

/** Un champ de texte (une ligne) qui n'envoie qu'en quittant ou sur Entrée. */
export function TextInput({ value, label, max, placeholder, mono = false, list, id, onCommit, allowEmpty = true }: {
  value: string; label: string; max: number; placeholder?: string; mono?: boolean; list?: string; id?: string; allowEmpty?: boolean; onCommit: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const commit = (): void => { if (local !== value && (allowEmpty || local.trim())) onCommit(local); else if (!allowEmpty && !local.trim()) setLocal(value); };
  return (
    <input id={id} className={cx("ctl", mono && "mono")} value={local} maxLength={max} placeholder={placeholder} aria-label={label} list={list} spellCheck={false}
      onChange={(event) => setLocal(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } if (event.key === "Escape") { event.stopPropagation(); setLocal(value); } }} />
  );
}

/** Une zone de texte : sa hauteur suit le contenu (trois à dix lignes) ; envoie en quittant ou sur Ctrl+Entrée. */
export function TextArea({ value, label, max, placeholder, rows = 3, allowEmpty = true, onCommit }: {
  value: string; label: string; max: number; placeholder?: string; rows?: number; allowEmpty?: boolean; onCommit: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => { setLocal(value); }, [value]);
  const commit = (): void => { if (local !== value && (allowEmpty || local.trim())) onCommit(local); };
  const lines = Math.min(10, Math.max(rows, local.split("\n").length));
  return (
    <textarea className="ctl area" value={local} maxLength={max} rows={lines} placeholder={placeholder} aria-label={label} spellCheck={false}
      onChange={(event) => setLocal(event.target.value)} onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); commit(); } }} />
  );
}

const ARROW_DELAY = 350; // une rafale de flèches = un envoi

/** Un champ numérique : on tape, ou on glisse sur son préfixe (« scrub »), ou ↑↓ (±1, Maj ±10). La valeur est bornée
 *  et entière ; elle n'est envoyée qu'à la relâche, en quittant, sur Entrée ou à la fin d'une rafale de flèches. Le
 *  préfixe est une lettre pour une coordonnée (X, Y, L, H), sinon la poignée de glissement : la rangée dit la grandeur. */
export function NumberField({ label, prefix = <ChevronsLeftRight />, value, min, max, step = 1, unit, disabled = false, onCommit }: {
  label: string; prefix?: ReactNode; value: number; min: number; max: number; step?: number; unit?: string; disabled?: boolean; onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const current = useRef(value);
  const drag = useRef<{ x: number; from: number } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => { setText(String(value)); current.current = value; }, [value]);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const clamp = (n: number): number => Math.min(max, Math.max(min, Math.round(n / step) * step));
  const show = (n: number): void => { current.current = n; setText(String(n)); };
  const commit = (n: number): void => { const v = clamp(n); show(v); if (v !== value) onCommit(v); };
  const parsed = (): number => { const n = Number(text.replace(",", ".")); return Number.isFinite(n) && text.trim() !== "" ? n : value; };
  const down = (event: PointerEvent<HTMLSpanElement>): void => {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, from: current.current };
  };
  const move = (event: PointerEvent<HTMLSpanElement>): void => {
    if (!drag.current) return;
    const units = Math.round((event.clientX - drag.current.x) / 3) * (event.shiftKey ? 10 : 1);
    show(clamp(drag.current.from + units * step));
  };
  const up = (): void => { if (drag.current) { drag.current = null; commit(current.current); } };
  const keys = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") { event.preventDefault(); commit(parsed()); return; }
    if (event.key === "Escape") { event.stopPropagation(); show(value); return; }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    show(clamp(parsed() + (event.key === "ArrowUp" ? 1 : -1) * step * (event.shiftKey ? 10 : 1)));
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; commit(current.current); }, ARROW_DELAY);
  };
  return (
    <span className={cx("ctl ctl-num", disabled && "disabled")}>
      <span className="ctl-prefix" aria-hidden="true" title={disabled ? undefined : "glisser pour changer"} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>{prefix}</span>
      <input inputMode="numeric" aria-label={label} value={text} disabled={disabled} spellCheck={false}
        onChange={(event) => setText(event.target.value)} onBlur={() => commit(parsed())} onKeyDown={keys} />
      {unit ? <span className="ctl-unit" aria-hidden="true">{unit}</span> : null}
    </span>
  );
}

export type Option<T extends string> = { value: T; label: string; icon?: ReactNode };

/** Un choix exclusif dans une piste ; en icônes quand elles existent (le mot passe en infobulle). ← → au clavier. */
export function Segmented<T extends string>({ label, options, value, onPick, iconOnly = false, disabled = false }: {
  label: string; options: Option<T>[]; value: T; onPick: (value: T) => void; iconOnly?: boolean; disabled?: boolean;
}) {
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const at = options.findIndex((option) => option.value === value);
    const next = options[(at + (event.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
    onPick(next.value);
    const box = event.currentTarget;
    window.requestAnimationFrame(() => { const on = box.querySelector<HTMLElement>("[aria-checked='true']"); if (on) on.focus(); });
  };
  return (
    <div className={cx("seg", iconOnly && "icons", disabled && "disabled")} role="radiogroup" aria-label={label} onKeyDown={keys}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" className="seg-item" aria-checked={on ? "true" : "false"} tabIndex={on ? 0 : -1} disabled={disabled}
            aria-label={iconOnly ? option.label : undefined} title={iconOnly ? option.label : undefined} onClick={() => onPick(option.value)}>
            {option.icon}{iconOnly && option.icon ? null : <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Une liste déroulante au gabarit des champs (chevron dessiné, pas celui du système). */
export function Select({ label, value, options, placeholder, mono = false, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; placeholder?: string; mono?: boolean; onChange: (value: string) => void;
}) {
  return (
    <span className="ctl-select">
      <select className={cx("ctl", mono && "mono")} value={value} aria-label={label} onChange={(event) => onChange(event.target.value)}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown aria-hidden="true" />
    </span>
  );
}

/** Un interrupteur (oui / non), au gabarit de ceux du panneau Affichage. */
export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" className="ctl-switch" aria-checked={checked ? "true" : "false"} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}>
      <span className="switch"><span className="knob" /></span>
    </button>
  );
}

/** Une teinte nommée : le champ montre la pastille et le nom ; un clic ouvre la grille des douze et « défaut ».
 *  `inherited` : la teinte en vigueur quand rien n'est choisi (celle du type, ou du moteur). */
export function HueField<H extends string>({ label, hues, names, value, inherited, onPick, allowDefault = true }: {
  label: string; hues: readonly H[]; names: Record<string, string>; value: H | null; inherited: H | null; onPick: (hue: H | null) => void; allowDefault?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const close = (): void => setOpen(false);
  useDismiss(open, close, box);
  useEffect(() => { if (open && grid.current) { const on = grid.current.querySelector<HTMLElement>("[aria-checked='true']") || grid.current.querySelector<HTMLElement>("button"); if (on) on.focus(); } }, [open]);
  const shown = value || inherited;
  const pick = (hue: H | null): void => { close(); if (hue !== value) onPick(hue); };
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[event.key];
    if (!step) return;
    event.preventDefault();
    const all = Array.from(grid.current ? grid.current.querySelectorAll<HTMLElement>("button") : []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = all[Math.min(all.length - 1, Math.max(0, at + step))];
    if (next) next.focus();
  };
  return (
    <div className="ctl-hue" ref={box}>
      <button type="button" className="ctl hue-trigger" aria-haspopup="true" aria-expanded={open ? "true" : "false"} aria-label={label + " : " + (shown ? names[shown] : "aucune")} onClick={() => setOpen(!open)}>
        <span className={cx("hue-dot", shown && "hue-" + shown)} aria-hidden="true" />
        <span className="hue-name">{shown ? names[shown] : "—"}</span>
        {value === null && allowDefault ? <span className="hue-origin">défaut</span> : null}
        <ChevronDown className="hue-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="popover hue-pop" ref={grid} role="radiogroup" aria-label={label} onKeyDown={keys}>
          <div className="hue-grid">
            {hues.map((hue) => (
              <button key={hue} type="button" role="radio" className={cx("hue-swatch", "hue-" + hue, value === null && hue === inherited && "inherited")} aria-checked={value === hue ? "true" : "false"}
                aria-label={names[hue]} title={names[hue]} onClick={() => pick(hue)}>{value === hue ? <Check aria-hidden="true" /> : null}</button>
            ))}
          </div>
          {allowDefault ? (
            <button type="button" role="radio" className="menu-item hue-default" aria-checked={value === null ? "true" : "false"} onClick={() => pick(null)}>
              <span className={cx("hue-dot", inherited && "hue-" + inherited)} aria-hidden="true" />
              <span>Défaut{inherited ? " : " + names[inherited] : ""}</span>
              {value === null ? <Check className="menu-check" aria-hidden="true" /> : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Une position parmi neuf (étiquette dans son cadre) : le champ montre une mini-grille et le nom ; un clic ouvre la
 *  grille 3 × 3 dans un volet (← → ↑ ↓ s'y déplacent). Même modèle que la teinte : la rangée garde sa hauteur. */
export function PositionField<T extends string>({ label, options, names, value, onPick }: { label: string; options: readonly T[]; names: Record<string, string>; value: T; onPick: (value: T) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const close = (): void => setOpen(false);
  useDismiss(open, close, box);
  useEffect(() => { if (open && grid.current) { const on = grid.current.querySelector<HTMLElement>("[aria-checked='true']"); if (on) on.focus(); } }, [open]);
  const at = options.indexOf(value);
  const keys = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 3, ArrowUp: -3 }[event.key];
    if (!step) return;
    event.preventDefault();
    const all = Array.from(grid.current ? grid.current.querySelectorAll<HTMLElement>("button") : []);
    const from = all.indexOf(document.activeElement as HTMLElement);
    const next = all[Math.min(all.length - 1, Math.max(0, from + step))];
    if (next) next.focus();
  };
  return (
    <div className="ctl-pos" ref={box}>
      <button type="button" className="ctl pos-trigger" aria-haspopup="true" aria-expanded={open ? "true" : "false"} aria-label={label + " : " + (names[value] || value)} onClick={() => setOpen(!open)}>
        <span className="pos-mini" aria-hidden="true">{options.map((option, i) => <span key={option} className={cx("pos-mini-dot", i === at && "on")} />)}</span>
        <span className="hue-name">{names[value] || value}</span>
        <ChevronDown className="hue-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="popover pos-pop" ref={grid} role="radiogroup" aria-label={label} onKeyDown={keys}>
          {options.map((option) => (
            <button key={option} type="button" role="radio" className="pos9-cell" aria-checked={option === value ? "true" : "false"} aria-label={names[option] || option} title={names[option] || option}
              onClick={() => { close(); if (option !== value) onPick(option); }}><span className="pos9-dot" /></button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Des faits en rangées « libellé | valeur » ; une ligne sans valeur ne s'écrit pas (`null` n'affirme rien). */
export type Fact = [string, ReactNode] | null | undefined | false;
export function Facts({ rows }: { rows: Fact[] }) {
  const kept = rows.filter((row): row is [string, ReactNode] => !!row && row[1] !== null && row[1] !== undefined && row[1] !== "");
  if (!kept.length) return null;
  return <dl className="insp-facts">{kept.map(([label, value]) => <div key={label} className="insp-row fact"><dt className="insp-label">{label}</dt><dd className="insp-fact">{value}</dd></div>)}</dl>;
}

/** La confirmation d'une suppression, dans l'en-tête : une phrase, « annuler », l'action en rouge. */
export function Confirm({ text, action, onConfirm, onCancel }: { text: string; action: string; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (ref.current) ref.current.focus(); }, []);
  return (
    <div className="insp-confirm" role="alertdialog" aria-label={text} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
      <p>{text}</p>
      <button type="button" className="pbtn" onClick={onCancel}>annuler</button>
      <button type="button" ref={ref} className="pbtn danger" onClick={onConfirm}>{action}</button>
    </div>
  );
}

/** Un compte qu'on augmente ou diminue d'un (lignes et colonnes d'un tableau). */
export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <span className="ctl stepper" role="group" aria-label={label}>
      <IconButton label={"retirer : " + label} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus /></IconButton>
      <span className="stepper-value">{value}</span>
      <IconButton label={"ajouter : " + label} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus /></IconButton>
    </span>
  );
}

/** Une liste de lignes de 32 (membres d'un groupe, câbles) : le texte à gauche, une action discrète à droite. */
export const List = ({ children, label }: { children: ReactNode; label?: string }) => <ul className="insp-list" aria-label={label}>{children}</ul>;
export function ListRow({ children, trailing, faint = false }: { children: ReactNode; trailing?: ReactNode; faint?: boolean }) {
  return <li className={cx("insp-list-row", faint && "faint")}><span className="insp-list-main">{children}</span>{trailing ? <span className="insp-list-end">{trailing}</span> : null}</li>;
}
