// La fiche d'une sélection multiple, dans la grammaire de l'inspecteur : combien, ce qu'on en fait (masquer, isoler ;
// aligner et répartir sont dans la barre d'outils de la toile), la teinte d'un coup (docs/10, une requête pour toute la
// sélection), un groupe (nouveau ou existant), puis la liste. La sélection vient de Maj / Ctrl + clic, du rectangle, de
// Ctrl+A ou de la recherche. Une sélection mixte (lot 2 de docs/11) compte par sorte (« 2 équipements, 1 annotation ») ;
// teinte et groupe s'appliquent à ses équipements ; la corbeille supprime ses annotations, connecteurs et groupes.
import { EyeOff, Focus, Group as GroupIcon, SquareDashedMousePointer, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { hueOfNode } from "../../../canvas/hues";
import type { HueName } from "../../../canvas/hues";
import type { Model } from "../../../canvas/types";
import { summary as annotationSummary } from "../../../canvas/annotations";
import { summary as connectorSummary } from "../../../canvas/connectors";
import { itemsText } from "../../state/describe";
import { deleteOps, size } from "../../state/selection";
import type { Multi } from "../../state/selection";
import { useEditable, useStore } from "../../state/store";
import { IconButton, Inspector, InspectorHead, List, MoreLink, Row, Section, TextButton, Title } from "../../ui/inspector";
import { GroupPicker, HueSetting, WriteHint } from "./shared";

// Ce que la sélection a en commun : la teinte choisie (si tous en ont la même) et la teinte en vigueur (si une seule).
function common(model: Model, hosts: string[]): { own: string | null; effective: HueName | null } {
  const own = new Set(hosts.map((host) => { const color = model.colorByHost.get(host); return color ? color.hue : null; }));
  const effective = new Set(hosts.map((host) => hueOfNode(model, model.nodeByHost.get(host) || { hostname: host, type: null })));
  return { own: own.size === 1 ? Array.from(own)[0] : null, effective: effective.size === 1 ? Array.from(effective)[0] : null };
}

const LIMIT = 12;

// Les annotations, connecteurs et groupes d'une sélection mixte : par leur résumé, un clic les ouvre seuls.
function Others({ model, picked }: { model: Model; picked: Multi }) {
  const { commands } = useStore();
  const { t } = useTranslation(["panel", "shell"]);
  const rows = ([] as { key: string; label: string; open: () => void }[]).concat(
    picked.annotations.flatMap((id) => { const a = model.annotationById.get(id); return a ? [{ key: "a:" + id, label: annotationSummary(a), open: () => commands.reveal({ kind: "annotation", id }) }] : []; }),
    picked.connectors.flatMap((id) => { const c = model.connectorById.get(id); return c ? [{ key: "c:" + id, label: connectorSummary(c), open: () => commands.reveal({ kind: "connector", id }) }] : []; }),
    picked.groups.flatMap((id) => { const g = model.groupById.get(id); return g ? [{ key: "g:" + id, label: g.label, open: () => commands.reveal({ kind: "group", id }) }] : []; }));
  if (!rows.length) return null;
  return (
    <Section title={t("multi.others")} count={rows.length}>
      <List label={t("multi.othersList")}>
        {rows.map((row) => <li key={row.key}><button type="button" className="insp-list-row link" onClick={row.open}><span className="insp-list-main">{row.label}</span></button></li>)}
      </List>
    </Section>
  );
}

export function MultiCard({ model, picked }: { model: Model; picked: Multi }) {
  const { commands, state } = useStore();
  const [all, setAll] = useState(false);
  const { t } = useTranslation(["panel", "common", "shell"]);
  const hosts = picked.hosts;
  const mixed = size(picked) > hosts.length;
  const sorted = hosts.slice().sort();
  const devices = hosts.filter((host) => { const node = model.nodeByHost.get(host); return !!node && node.kind !== "stub"; });
  const canWrite = useEditable();
  const control = state.view.mode === "control"; // en vue Contrôle, la sélection se lit : ni teinte ni groupe
  const colour = common(model, devices);
  const [name, setName] = useState("");
  const create = (event: FormEvent): void => { event.preventDefault(); if (devices.length) commands.groupCreate(name.trim() || t("multi.defaultName"), devices); setName(""); };
  const shown = all ? sorted : sorted.slice(0, LIMIT);
  return (
    <Inspector kind="multi">
      <InspectorHead icon={<SquareDashedMousePointer />} kind={t("multi.kind")}
        actions={<>
          {hosts.length ? <IconButton label={t("multi.hide")} onClick={() => commands.hideHosts(hosts)}><EyeOff /></IconButton> : null}
          {hosts.length ? <IconButton label={t("multi.isolate")} onClick={() => commands.isolateHosts(hosts)}><Focus /></IconButton> : null}
          {canWrite && deleteOps(picked).length ? <IconButton label={t("multi.delete")} onClick={() => { commands.deleteSelection(); }}><Trash2 /></IconButton> : null}
        </>}
        title={<Title>{mixed ? t("shell:items.all", { count: size(picked) }) : t("common:devices", { count: hosts.length })}</Title>}
        meta={mixed ? itemsText(picked) : undefined}>
        {canWrite || control ? null : <WriteHint action={t("multi.toEdit")} />}
      </InspectorHead>
      {devices.length && canWrite ? (
        <Section title={t("multi.appearance")}>
          <Row label={t("hue")}><HueSetting value={colour.own} inherited={colour.effective} onPick={(next) => commands.colorHosts(devices, next)} /></Row>
        </Section>
      ) : null}
      {devices.length && canWrite ? (
        <Section title={t("multi.group")}>
          {/* le bouton ne devient primaire qu'une fois le nom écrit : rien ne crie tant qu'on n'a rien décidé */}
          <Row label={t("multi.new")}>
            <form className="insp-inline" onSubmit={create}>
              <input className="ctl" value={name} maxLength={80} placeholder={t("multi.groupName")} aria-label={t("multi.newGroupName")} spellCheck={false} onChange={(event) => setName(event.target.value)} />
              <TextButton primary={!!name.trim()} type="submit" title={t("multi.groupOf", { count: devices.length })}><GroupIcon /> {t("multi.doGroup")}</TextButton>
            </form>
          </Row>
          {model.groupById.size ? <Row label={t("multi.addTo")}><GroupPicker model={model} hosts={devices} /></Row> : null}
        </Section>
      ) : null}
      {hosts.length ? <Section title={t("multi.devices")} count={hosts.length}>
        <List label={t("multi.devicesList")}>
          {shown.map((host) => (
            <li key={host}><button type="button" className="insp-list-row link" title={(model.nodeByHost.get(host) || { type: null }).type || ""} onClick={() => commands.reveal({ kind: "node", id: host })}>
              <span className="insp-list-main"><span className="mono">{host}</span></span>
            </button></li>
          ))}
        </List>
        {sorted.length > LIMIT ? <MoreLink onClick={() => setAll(!all)}>{all ? t("less") : t("moreOthers", { count: sorted.length - LIMIT })}</MoreLink> : null}
      </Section> : null}
      <Others model={model} picked={picked} />
    </Inspector>
  );
}
