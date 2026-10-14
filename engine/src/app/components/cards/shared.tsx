// Ce que les fiches partagent, dans la grammaire de l'inspecteur (ui/inspector.tsx) : un nom cliquable (ouvre
// l'équipement), l'icône de type, les câbles d'un équipement, les contrôles (comptés par sévérité, puis en liste
// courte), l'appartenance HA, le choix d'une teinte, la ligne « donnez votre nom ». Tout est lu dans le modèle.
import { History, Lock, User } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { COLLECTION_LABEL, haModeText, KIND_LABEL, SEVERITY_LABEL, STATUS_LABEL, shortPort } from "../../../canvas/format";
import { HUES, HUE_LABEL, defaultHue } from "../../../canvas/hues";
import type { HueName } from "../../../canvas/hues";
import { glyph, LABEL as ICON_LABEL } from "../../../canvas/icons";
import { endLabel, haRoleGroup } from "../../../canvas/model";
import type { CheckEntry, Model, ModelLink } from "../../../canvas/types";
import { i18n, t } from "../../../i18n";
import { checkMeaning } from "../../state/checks";
import { useControl, useStore, useWriteLock } from "../../state/store";
import { Badge, DiffBadge } from "../../ui";
import { Hint, HueField, IconButton, List, ListRow, MoreLink, Section, Select } from "../../ui/inspector";

/** Ce qu'il manque pour écrire : un nom, ou une intention lisible (si elle n'a pas pu être lue avec la run, l'écriture
 *  est coupée pour ne rien écraser). Une ligne grise : un fait sur la page, pas un défaut des données. */
export function WriteHint({ action }: { action: string }) {
  const lock = useWriteLock();
  const { t } = useTranslation("panel");
  if (lock) return <Hint icon={<Lock aria-hidden="true" />}>{lock}</Hint>;
  return <Hint icon={<User aria-hidden="true" />}>{t("write.readOnly", { action })}</Hint>;
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
  const { t } = useTranslation("panel");
  return (
    <span className={"type-icon hue-" + (hue || defaultHue(type))} title={type ? ICON_LABEL[type] || type : t("unknownType")}>
      <svg viewBox="0 0 32 32" aria-hidden="true"><path className="icon-body" d={g.body} /><path className="icon-shade" d={g.shade} /><path className="icon-mark" d={g.mark} /></svg>
    </span>
  );
}

export const kindBadge = (kind: string) => (kind === "device" ? null : <Badge kind="kind" value={kind} label={KIND_LABEL[kind] || kind} />);

/** Une teinte nommée parmi les douze (docs/10) ; `null` = celle du dessus (`inherited`). */
export function HueSetting({ value, inherited, allowDefault = true, onPick }: { value: string | null; inherited: string | null; allowDefault?: boolean; onPick: (hue: HueName | null) => void }) {
  const { t } = useTranslation("panel");
  return <HueField label={t("hue")} hues={HUES} names={HUE_LABEL} value={value as HueName | null} inherited={inherited as HueName | null} allowDefault={allowDefault} onPick={onPick} />;
}

/** « Ajouter à un groupe » : la liste des groupes de l'infrastructure (docs/10 §5) ; choisir envoie `group_add`. */
export function GroupPicker({ model, hosts, exclude = [] }: { model: Model; hosts: string[]; exclude?: string[] }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const groups = Array.from(model.groupById.values()).filter((group) => !exclude.includes(group.id)).sort((a, b) => a.label.localeCompare(b.label));
  if (!groups.length || !hosts.length) return null;
  return <Select label={t("addToGroup")} value="" placeholder={t("pickGroup")} options={groups.map((group) => ({ value: group.id, label: group.label }))} onChange={(id) => { if (id) commands.groupAdd(id, hosts); }} />;
}

/** Un texte du catalogue où `ceci` désigne un champ : rendu en code, sans les backticks. */
export function CodeText({ text }: { text: string }) {
  const parts = text.split("`");
  return <>{parts.map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part))}</>;
}

const SEVERITIES = ["error", "warning", "info"] as const;
/** Une sévérité comptée, en mots (« 2 erreurs ») ; une sévérité inconnue reste son code. */
const severityWords = (sev: string, n: number): string => (sev === "error" || sev === "warning" || sev === "info" ? t(`panel:checks.${sev}`, { count: n }) : sev);

/** Les comptes par sévérité, comme dans la barre : un point de couleur et un nombre ; pour un lecteur d'écran, le nombre
 *  et le mot une seule fois (« 1 erreur », jamais « 1 1 erreur » : revue d'usage, B2). */
function SeverityCounts({ counts }: { counts: Map<string, number> }) {
  return (
    <span className="insp-sev">
      {SEVERITIES.filter((sev) => counts.has(sev)).map((sev) => {
        const n = counts.get(sev) || 0;
        return <span key={sev} className="insp-sev-count" title={severityWords(sev, n)}><span className={"insp-dot " + sev} aria-hidden="true" /><span aria-hidden="true">{n}</span><span className="sr-only">{severityWords(sev, n)}</span></span>;
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
  const { t: tr } = useTranslation("panel");
  const counts = new Map<string, number>();
  checks.forEach((check) => counts.set(check.severity, (counts.get(check.severity) || 0) + 1));
  const lines = checkLines(checks);
  const shown = all ? lines : lines.slice(0, SHORT);
  const meaningOf = (code: string): ReactNode => { const meaning = checkMeaning(code, model); return meaning ? <CodeText text={meaning} /> : null; };
  return (
    <Section title={tr("checks.title")} count={checks.length} action={checks.length ? <SeverityCounts counts={counts} /> : undefined}>
      {checks.length ? (
        <ul className="insp-checks">
          {shown.map((line) => {
            const meaning = meaningOf(line.code);
            return (
              <li key={line.key} className="insp-check">
                <span className={"insp-dot " + line.severity} aria-label={SEVERITY_LABEL[line.severity] || line.severity} />
                <p className="insp-check-what">{meaning || <code>{line.code}</code>}{line.times > 1 ? <span className="insp-times">× {line.times}</span> : null}</p>
                {meaning ? <code className="insp-check-code">{line.code}</code> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="insp-hint">{tr("checks.none")}</p>}
      {lines.length > SHORT ? <MoreLink onClick={() => setAll(!all)}>{all ? tr("less") : tr("moreOthers", { count: lines.length - SHORT })}</MoreLink> : null}
    </Section>
  );
}

/** Le point au bout d'une ligne de câble : son statut en vue Contrôle ; en vue Diagramme, rien, sauf « down » (ce qu'un
 *  port dit, pas un verdict). */
export function LinkDot({ link }: { link: Pick<ModelLink, "status" | "raw"> }) {
  const control = useControl();
  if (control) return <span className={"insp-dot " + link.status + (link.raw.oper === "down" ? " down" : "")} aria-label={link.status} />;
  return link.raw.oper === "down" ? <Badge kind="oper" value="down" label="down" /> : null;
}

/** Les câbles d'un équipement : port local → l'autre bout, statut en point (vue Contrôle) ; un câble retiré est dit tel. */
export function Cables({ hostname, links }: { hostname: string; links: ModelLink[] }) {
  const { commands } = useStore();
  const [all, setAll] = useState(false);
  const { t: tr } = useTranslation("panel");
  const limit = 8;
  const shown = all ? links : links.slice(0, limit);
  if (!links.length) return <p className="insp-hint">{tr("noCables")}</p>;
  return (
    <>
      <List label={tr("cables")}>
        {shown.map((link) => {
          const local = link.a.hostname === hostname ? link.a : link.b, remote = local === link.a ? link.b : link.a;
          return (
            <li key={link.id}>
              <button type="button" className="insp-list-row link" onClick={() => commands.reveal({ kind: "link", id: link.id })} title={endLabel(local) + " ↔ " + endLabel(remote)}>
                <span className="insp-list-main cable"><span className="mono insp-port-local">{shortPort(local.interface)}</span><span className="insp-remote"><span className="mono">{remote.hostname}</span>{remote.interface ? <span className="mono faint">{shortPort(remote.interface)}</span> : null}</span></span>
                <span className="insp-list-end">{link.ghost ? <DiffBadge kind="removed" /> : null}<LinkDot link={link} /></span>
              </button>
            </li>
          );
        })}
      </List>
      {links.length > limit ? <MoreLink onClick={() => setAll(!all)}>{all ? tr("less") : tr("moreCables", { count: links.length - limit })}</MoreLink> : null}
    </>
  );
}

/** Les clusters HA d'un équipement : le nom (ouvre le cluster), son rôle, son état, le mode et la priorité. */
export function HaRows({ model, hostname }: { model: Model; hostname: string }) {
  const { commands } = useStore();
  const memberships = model.haMembershipsByHost.get(hostname) || [];
  const { t: tr } = useTranslation("panel");
  if (!memberships.length) return null;
  return (
    <List label={tr("haClusters")}>
      {memberships.map((ha) => (
        <ListRow key={ha.cluster.id} trailing={<>{haModeText(ha.cluster.raw.mode)}{ha.member.priority !== null && ha.member.priority !== undefined ? " · " + tr("priority", { value: ha.member.priority }) : ""}</>}>
          <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "cluster", id: ha.cluster.id })}>{ha.cluster.raw.cluster_name || ha.cluster.hosts.join(" + ")}</button>
          <Badge kind="ha" value={haRoleGroup(ha.cluster.raw.mode, ha.member.role)} label={ha.member.role} />
          {ha.member.state !== "up" ? <Badge kind="state" value={ha.member.state} label={ha.member.state} /> : null}
        </ListRow>
      ))}
    </List>
  );
}

/** Une valeur du diff en mots : une énumération connue dans la langue de la page, une liste jointe, « — » pour une
 *  valeur vide (liste vide comprise : revue d'usage, M3, « root → » sans rien après). */
const VALUE_WORDS: Record<string, Record<string, string>> = { collection: COLLECTION_LABEL, status: STATUS_LABEL, type: ICON_LABEL };
function shown(path: string, value: unknown): string {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) return "—";
  if (Array.isArray(value)) return value.map((v) => shown(path, v)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  const words = VALUE_WORDS[path];
  return (words && words[String(value)]) || String(value);
}
/** Le nom d'un champ du diff : son libellé (`panel:diffField`) s'il est connu, sinon son chemin, lisible. */
export const changeLabel = (path: string): string =>
  (i18n.exists("panel:diffField." + path) ? t(("panel:diffField." + path) as never) as unknown as string : path.replace(/_/g, " "));
/** Une ligne « avant → après » d'un champ changé (diff). */
export const changeText = (path: string, before: unknown, after: unknown): string => shown(path, before) + " → " + shown(path, after);
/** Les lignes d'une section « Changements » : six champs au plus. */
export const changeRows = (fields: { path: string; before?: unknown; after?: unknown }[]): [string, string][] =>
  fields.slice(0, 6).map((f) => [changeLabel(f.path), changeText(f.path, f.before, f.after)]);

/** L'historique d'un objet au Journal (2026-10-10) : tout ce qui l'a touché ou cité, qui, quand ; Retour ramène ici. */
export function HistoryButton({ object }: { object: string }) {
  const { commands } = useStore();
  const { t: tr } = useTranslation("panel");
  return <IconButton label={tr("history")} onClick={() => commands.openHistory(object)}><History /></IconButton>;
}
