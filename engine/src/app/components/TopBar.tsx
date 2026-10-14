// La barre : l'identité (infrastructure, run), la bascule des vues (Diagramme / Contrôle, 2026-10-09), les comptes qui
// agissent (en Contrôle seulement : statuts en bascules ; sévérités en parcours des équipements concernés, WalkBar ;
// le diff dans les deux vues), les règles posées (retirables), et à droite les changements, le panneau Affichage (les
// couches de la toile, Display), le nom, le menu. La recherche flotte sur la toile (Search).
import { GitCompareArrows, History, KeyRound, LogOut, Palette, ShieldCheck, TriangleAlert, User, Waypoints, X } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { EvidenceStatus } from "../../contracts/snapshot";
import { label as runLabel } from "../../shell/timeline";
import { STATUSES } from "../state/address";
import { useModel, useStore } from "../state/store";
import { Button, Dialog, Toggle } from "../ui";
import { Display } from "./Display";
import { LanguageSwitch } from "./Language";
import { sayText } from "../state/said";
import { punct } from "../../i18n";

function RuleChips() {
  const { state, commands } = useStore();
  const { t } = useTranslation();
  const chips = state.view.hide.map((rule) => ({ kind: t("rules.hidden"), rule, remove: () => commands.removeHide(rule) }));
  if (state.view.only) chips.push({ kind: t("rules.isolated"), rule: state.view.only, remove: () => commands.setOnly("") });
  if (!chips.length) return null;
  return <>{chips.map((chip) => (
    <span key={chip.kind + chip.rule} className="rule-chip" title={t("rules.title", { kind: chip.kind, rule: chip.rule })}>
      <span className="rule-kind">{chip.kind}</span><code>{chip.rule}</code>
      <button type="button" aria-label={t("rules.remove", { rule: chip.rule })} onClick={chip.remove}><X /></button>
    </span>
  ))}</>;
}

/** Diagramme, Contrôle ou Journal : un choix exclusif ; le Journal (qui a modifié quoi) remplace la toile ; en Diagramme, « Contrôle » dit combien d'erreurs sont ouvertes (sinon
 *  les avertissements), pour ne pas mentir par omission : la vue neutre cache les verdicts, pas leur existence. */
function ModeSwitch() {
  const { state, commands } = useStore();
  const model = useModel();
  const { t } = useTranslation();
  if (!model) return null;
  const mode = state.view.mode, control = mode === "control";
  const errors = model.severityCounts.get("error") || 0, warnings = model.severityCounts.get("warning") || 0;
  const open = mode !== "diagram" ? null : errors ? { n: errors, tone: "danger", word: t("modes.openErrors", { count: errors }) }
    : warnings ? { n: warnings, tone: "warning", word: t("modes.openWarnings", { count: warnings }) } : null;
  return (
    <div className="mode-switch" role="group" aria-label={t("modes.label")}>
      <button type="button" className="mode-item" aria-pressed={mode === "diagram" ? "true" : "false"} onClick={() => commands.setMode("diagram")}
        title={t("modes.diagramTitle")}>
        <Waypoints aria-hidden="true" /><span className="word">{t("modes.diagram")}</span>
      </button>
      <button type="button" className="mode-item" aria-pressed={control ? "true" : "false"} onClick={() => commands.setMode("control")}
        title={t("modes.controlTitle") + (open ? " · " + open.word : "")}>
        <ShieldCheck aria-hidden="true" /><span className="word">{t("modes.control")}</span>
        {open ? <span className={"pill tone-" + open.tone} aria-label={open.word}>{open.n}</span> : null}
      </button>
      <button type="button" className="mode-item" aria-pressed={mode === "journal" ? "true" : "false"} onClick={() => commands.setMode("journal")}
        title={t("modes.journalTitle")}>
        <History aria-hidden="true" /><span className="word">{t("modes.journal")}</span>
      </button>
    </div>
  );
}

// Ce qui n'a pas pu être lu avec la run : une pastille dans la barre, le détail au survol et pour le lecteur d'écran.
function Warnings() {
  const { state } = useStore();
  const { t } = useTranslation();
  const warnings = state.run.kind === "ready" ? state.run.warnings : [];
  if (!warnings.length) return null;
  const texts = warnings.map(sayText);
  const text = texts.length === 1 ? texts[0].split(/\s?:\s/)[0] : t("warnings.missed", { count: texts.length });
  return <span className="bar-warn" role="status" title={texts.join("\n")}><TriangleAlert aria-hidden="true" />{text}<span className="sr-only">{punct.colon() + texts.join(punct.semicolon())}</span></span>;
}

function Counts() {
  const { state, commands } = useStore();
  const model = useModel();
  const { t } = useTranslation(["shell", "common"]);
  if (!model) return null;
  const count = (map: Map<string, number>, key: string): number => map.get(key) || 0;
  const diff = model.diff ? model.diff.summary.links : null;
  const devices = model.nodes.length - (model.kindCounts.get("stub") || 0);
  const walking = state.walk ? state.walk.kind : null;
  const control = state.view.mode === "control";
  return (
    <div className="counts" aria-label={t("counts.label")}>
      <span className="count" title={t("counts.devicesTitle", { devices: t("common:devices", { count: devices }), links: t("common:links", { count: model.links.length }) })}><b>{devices}</b> <span className="word">{t("counts.devicesWord", { count: devices })}</span></span>
      {control ? <span className="count-sep" aria-hidden="true" /> : null}
      {control ? STATUSES.map((st) => {
        const words = { links: t("common:links", { count: count(model.statusCounts, st) }), status: t(`common:status.${st as EvidenceStatus}`) };
        return (
          <button key={st} type="button" className={"count status-" + st} aria-pressed={state.view.hiddenStatuses.includes(st) ? "false" : "true"}
            title={t("counts.statusTitle", words)} aria-label={t("counts.statusLabel", words)} onClick={() => commands.toggleStatus(st)}>
            <span className={"dot " + st} /><b>{count(model.statusCounts, st)}</b>
          </button>
        );
      }) : null}
      {control && count(model.severityCounts, "error") + count(model.severityCounts, "warning") ? <span className="count-sep" aria-hidden="true" /> : null}
      {control ? (["error", "warning"] as const).map((sev) => (count(model.severityCounts, sev)
        ? <button key={sev} type="button" className={"count sev-" + sev} aria-pressed={walking === sev ? "true" : "false"} onClick={() => commands.startWalk(sev)}
          title={sev === "error" ? t("counts.walkError", { count: count(model.severityCounts, sev) }) : t("counts.walkWarning", { count: count(model.severityCounts, sev) })}>
          <span className="dot" aria-hidden="true" /><b>{count(model.severityCounts, sev)}</b>
          <span className="sr-only"> {sev === "error" ? t("counts.walkErrorShort", { count: count(model.severityCounts, sev) }) : t("counts.walkWarningShort", { count: count(model.severityCounts, sev) })}</span>
        </button> : null)) : null}
      {diff ? <><span className="count-sep" aria-hidden="true" />
        <button type="button" className="count diff" aria-pressed={walking === "diff" ? "true" : "false"} onClick={() => commands.startWalk("diff")}
          title={t("counts.diffTitle", { count: model.diffCount })}>
          <b>+{diff.added} −{diff.removed} ~{diff.changed}</b><span className="sr-only">{punct.colon() + t("counts.diffShort")}</span>
        </button></> : null}
      <RuleChips />
    </div>
  );
}

function Menu() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const { t } = useTranslation();
  const [name, setName] = useState(state.author);
  const submit = (event: FormEvent): void => { event.preventDefault(); commands.setAuthor(name); dispatch({ type: "menu", open: false }); };
  return (
    <Dialog label={t("menu.label")} className="menu glass" modal={false} initial="input" onClose={() => dispatch({ type: "menu", open: false })}>
      <form onSubmit={submit} className="field">
        {t("menu.nameIntro")}
        <div className="form-row">
          <input value={name} maxLength={80} placeholder={t("menu.namePlaceholder")} spellCheck={false} onChange={(event) => setName(event.target.value)} aria-label={t("menu.nameLabel")} />
          <Button variant="primary" type="submit">{t("menu.keep")}</Button>
        </div>
        <span className="hint">{state.author ? t("menu.hintNamed") : t("menu.hintAnonymous")}</span>
      </form>
      <LanguageSwitch />
      <div className="form-row wrap">
        {model && state.view.mode === "diagram" ? <Button variant="ghost" onClick={() => dispatch({ type: "colors", open: true })} title={t("menu.typePaletteTitle")}><Palette /> {t("menu.typePalette")}</Button> : null}
        <Button variant="ghost" onClick={() => { dispatch({ type: "menu", open: false }); dispatch({ type: "connect", open: true }); }}><KeyRound /> {t("menu.switchInfrastructure")}</Button>
        <Button variant="ghost" onClick={commands.forgetToken}><LogOut /> {t("menu.forgetToken")}</Button>
      </div>
    </Dialog>
  );
}

export function TopBar() {
  const { state, dispatch, commands } = useStore();
  const model = useModel();
  const { t } = useTranslation();
  const run = state.runs ? state.runs.find((entry) => entry.run_id === state.address.runId) : null;
  return (
    <>
      <header className="bar glass">
        <div className="bar-left">
          <span className="mark"><span className="mark-dot" aria-hidden="true" />Living Diagram</span>
          {state.address.infrastructure ? <><span className="crumb">/</span><span className="infra">{state.address.infrastructure}</span></> : null}
          {state.view.mode === "journal" ? null : run ? <span className={"pill tone-neutral run-pill run-" + run.run_status} title={t("bar.runTitle", { id: run.run_id, status: run.run_status })}><span className="pill-dot" />{runLabel(run)}</span>
            : model ? <span className="pill tone-neutral run-pill"><span className="pill-dot" />{model.source.collector_run_id}</span> : null}
          <Warnings />
        </div>
        <div className="bar-center"><ModeSwitch />{state.view.mode === "journal" ? null : <Counts />}</div>
        <div className="bar-right">
          {model && model.diff && state.view.mode !== "journal" ? <Toggle pressed={state.view.showDiff} onClick={() => commands.setView({ showDiff: !state.view.showDiff })} title={t("bar.changesTitle", { total: model.diffCount })}><GitCompareArrows /><span className="word">{t("bar.changes")}</span></Toggle> : null}
          {state.view.mode === "journal" ? null : <Display />}
          <Toggle pressed={state.menuOpen} onClick={() => dispatch({ type: "menu", open: !state.menuOpen })} title={state.author ? t("bar.writerNamed") : t("bar.writerAnonymous")} aria-haspopup="dialog">
            <User /><span className="writer-name">{state.author || t("bar.writerPlaceholder")}</span>
          </Toggle>
        </div>
      </header>
      {state.menuOpen ? <Menu /> : null}
    </>
  );
}
