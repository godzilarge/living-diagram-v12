// Ce que les fiches partagent, dans la grammaire de l'inspecteur (ui/inspector.tsx) : un nom cliquable (ouvre
// l'équipement), l'icône de type, les câbles d'un équipement, les contrôles (comptés par sévérité, puis en liste
// courte), l'appartenance HA, le choix d'une teinte, la ligne « donnez votre nom ». Tout est lu dans le modèle.
import { Lock, User } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { KIND_LABEL, shortPort } from "../../../canvas/format";
import { HUES, HUE_LABEL, defaultHue } from "../../../canvas/hues";
import type { HueName } from "../../../canvas/hues";
import { glyph, LABEL as ICON_LABEL } from "../../../canvas/icons";
import { endLabel, haRoleGroup } from "../../../canvas/model";
import type { CheckEntry, Model, ModelLink } from "../../../canvas/types";
import { useStore, useWriteLock } from "../../state/store";
import { Badge, DiffBadge, plural } from "../../ui";
import { Hint, HueField, List, ListRow, MoreLink, Section, Select } from "../../ui/inspector";

/** Ce qu'il manque pour écrire : un nom, ou une intention lisible (si elle n'a pas pu être lue avec la run, l'écriture
 *  est coupée pour ne rien écraser). Une ligne grise : un fait sur la page, pas un défaut des données. */
export function WriteHint({ action }: { action: string }) {
  const lock = useWriteLock();
  if (lock) return <Hint icon={<Lock aria-hidden="true" />}>{lock}</Hint>;
  return <Hint icon={<User aria-hidden="true" />}>Lecture seule : donnez votre nom (en haut à droite) pour {action}.</Hint>;
}

export function HostLink({ hostname }: { hostname: string }) {
  const { commands } = useStore();
  return <button type="button" className="linklike mono" onClick={() => commands.reveal({ kind: "node", id: hostname })}>{hostname}</button>;
}

export const dateText = (iso: string): string => iso.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, " UTC");
/** « par otosun, le 2026-10-08 21:46 UTC » : la signature d'une intention. */
export const signed = (author: string, at: string): string => author + " · " + dateText(at);

/** L'icône d'un type, dans sa teinte (celle de l'équipement ou du type, docs/10 ; sinon le défaut du moteur). */
export function TypeIcon({ type, hue }: { type: string | null | undefined; hue?: string }) {
  const g = glyph(type);
  return (
    <span className={"type-icon hue-" + (hue || defaultHue(type))} title={type ? ICON_LABEL[type] || type : "type inconnu"}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><path className="icon-body" d={g.body} /><path className="icon-shade" d={g.shade} /><path className="icon-mark" d={g.mark} /></svg>
    </span>
  );
}

export const kindBadge = (kind: string) => (kind === "device" ? null : <Badge kind="kind" value={kind} label={KIND_LABEL[kind] || kind} />);

/** Une teinte nommée parmi les douze (docs/10) ; `null` = celle du dessus (`inherited`). */
export function HueSetting({ value, inherited, allowDefault = true, onPick }: { value: string | null; inherited: string | null; allowDefault?: boolean; onPick: (hue: HueName | null) => void }) {
  return <HueField label="teinte" hues={HUES} names={HUE_LABEL} value={value as HueName | null} inherited={inherited as HueName | null} allowDefault={allowDefault} onPick={onPick} />;
}

/** « Ajouter à un groupe » : la liste des groupes de l'infrastructure (docs/10 §5) ; choisir envoie `group_add`. */
export function GroupPicker({ model, hosts, exclude = [] }: { model: Model; hosts: string[]; exclude?: string[] }) {
  const { commands } = useStore();
  const groups = Array.from(model.groupById.values()).filter((group) => !exclude.includes(group.id)).sort((a, b) => a.label.localeCompare(b.label));
  if (!groups.length || !hosts.length) return null;
  return <Select label="ajouter à un groupe" value="" placeholder="choisir un groupe…" options={groups.map((group) => ({ value: group.id, label: group.label }))} onChange={(id) => { if (id) commands.groupAdd(id, hosts); }} />;
}

/** Un texte du catalogue où `ceci` désigne un champ : rendu en code, sans les backticks. */
export function CodeText({ text }: { text: string }) {
  const parts = text.split("`");
  return <>{parts.map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</>;
}

const SEVERITIES = ["error", "warning", "info"] as const;
const SEVERITY_WORDS: Record<string, [string, string]> = { error: ["erreur", "erreurs"], warning: ["avertissement", "avertissements"], info: ["info", "infos"] };

/** Les comptes par sévérité, comme dans la barre : un point de couleur et un nombre ; le mot pour les lecteurs d'écran. */
function SeverityCounts({ counts }: { counts: Map<string, number> }) {
  return (
    <span className="insp-sev">
      {SEVERITIES.filter((sev) => counts.has(sev)).map((sev) => {
        const n = counts.get(sev) || 0;
        return <span key={sev} className="insp-sev-count" title={plural(n, SEVERITY_WORDS[sev][0], SEVERITY_WORDS[sev][1])}><span className={"insp-dot " + sev} aria-hidden="true" />{n}<span className="sr-only"> {n > 1 ? SEVERITY_WORDS[sev][1] : SEVERITY_WORDS[sev][0]}</span></span>;
      })}
    </span>
  );
}

type CheckLine = { key: string; code: string; severity: string; times: number };
/** Les contrôles regroupés par code et sévérité (deux agrégats sous `min_links` font une ligne « × 2 »), les plus
 *  graves d'abord, dans l'ordre d'arrivée ensuite. */
function checkLines(checks: CheckEntry[]): CheckLine[] {
  const lines = new Map<string, CheckLine>();
  checks.forEach((check) => {
    const key = check.severity + ":" + check.code;
    const line = lines.get(key);
    lines.set(key, line ? { ...line, times: line.times + 1 } : { key, code: check.code, severity: check.severity, times: 1 });
  });
  const rank = (sev: string): number => { const at = SEVERITIES.indexOf(sev as typeof SEVERITIES[number]); return at < 0 ? SEVERITIES.length : at; };
  return Array.from(lines.values()).sort((a, b) => rank(a.severity) - rank(b.severity));
}

const SHORT = 4;
/** La section des contrôles d'un élément : les comptes par sévérité à droite du titre, puis une ligne par code (quatre,
 *  le reste à un clic) : le sens en clair d'abord, le code dessous, en identifiant. */
export function ChecksSection({ checks, model }: { checks: CheckEntry[]; model: Model }) {
  const [all, setAll] = useState(false);
  const counts = new Map<string, number>();
  checks.forEach((check) => counts.set(check.severity, (counts.get(check.severity) || 0) + 1));
  const lines = checkLines(checks);
  const shown = all ? lines : lines.slice(0, SHORT);
  const meaningOf = (code: string): ReactNode => { const meaning = (model.catalogue[code] || { meaning: "" }).meaning; return meaning ? <CodeText text={meaning} /> : null; };
  return (
    <Section title="Contrôles" count={checks.length} action={checks.length ? <SeverityCounts counts={counts} /> : undefined}>
      {checks.length ? (
        <ul className="insp-checks">
          {shown.map((line) => {
            const meaning = meaningOf(line.code);
            return (
              <li key={line.key} className="insp-check">
                <span className={"insp-dot " + line.severity} aria-label={SEVERITY_WORDS[line.severity] ? SEVERITY_WORDS[line.severity][0] : line.severity} />
                <p className="insp-check-what">{meaning || <code>{line.code}</code>}{line.times > 1 ? <span className="insp-times">× {line.times}</span> : null}</p>
                {meaning ? <code className="insp-check-code">{line.code}</code> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="insp-hint">aucun contrôle</p>}
      {lines.length > SHORT ? <MoreLink onClick={() => setAll(!all)}>{all ? "moins" : "et " + plural(lines.length - SHORT, "autre", "autres")}</MoreLink> : null}
    </Section>
  );
}

/** Les câbles d'un équipement : port local → l'autre bout, statut en point ; un câble retiré est dit tel. */
export function Cables({ hostname, links }: { hostname: string; links: ModelLink[] }) {
  const { commands } = useStore();
  const [all, setAll] = useState(false);
  const limit = 8;
  const shown = all ? links : links.slice(0, limit);
  if (!links.length) return <p className="insp-hint">aucun câble</p>;
  return (
    <>
      <List label="câbles">
        {shown.map((link) => {
          const local = link.a.hostname === hostname ? link.a : link.b, remote = local === link.a ? link.b : link.a;
          return (
            <li key={link.id}>
              <button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "link", id: link.id })} title={endLabel(local) + " ↔ " + endLabel(remote)}>
                <span className="insp-list-main cable"><span className="mono insp-port-local">{shortPort(local.interface)}</span><span className="insp-remote"><span className="mono">{remote.hostname}</span>{remote.interface ? <span className="mono faint">{shortPort(remote.interface)}</span> : null}</span></span>
                <span className="insp-list-end">{link.ghost ? <DiffBadge kind="removed" /> : null}<span className={"insp-dot " + link.status + (link.raw.oper === "down" ? " down" : "")} aria-label={link.status} /></span>
              </button>
            </li>
          );
        })}
      </List>
      {links.length > limit ? <MoreLink onClick={() => setAll(!all)}>{all ? "moins" : "et " + plural(links.length - limit, "autre câble", "autres câbles")}</MoreLink> : null}
    </>
  );
}

/** Les clusters HA d'un équipement : le nom (ouvre le cluster), son rôle, son état, le mode et la priorité. */
export function HaRows({ model, hostname }: { model: Model; hostname: string }) {
  const { commands } = useStore();
  const memberships = model.haMembershipsByHost.get(hostname) || [];
  if (!memberships.length) return null;
  return (
    <List label="clusters HA">
      {memberships.map((ha) => (
        <ListRow key={ha.cluster.id} trailing={<>{ha.cluster.raw.mode}{ha.member.priority !== null && ha.member.priority !== undefined ? " · prio " + ha.member.priority : ""}</>}>
          <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "cluster", id: ha.cluster.id })}>{ha.cluster.raw.cluster_name || ha.cluster.hosts.join(" + ")}</button>
          <Badge kind="ha" value={haRoleGroup(ha.cluster.raw.mode, ha.member.role)} label={ha.member.role} />
          {ha.member.state !== "up" ? <Badge kind="state" value={ha.member.state} label={ha.member.state} /> : null}
        </ListRow>
      ))}
    </List>
  );
}

/** Une ligne « avant → après » d'un champ changé (diff). */
const shown = (value: unknown): string => (value === null || value === undefined || value === "" ? "—" : String(value));
export const changeText = (before: unknown, after: unknown): string => shown(before) + " → " + shown(after);
