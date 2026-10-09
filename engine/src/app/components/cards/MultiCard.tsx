// La fiche d'une sélection multiple, dans la grammaire de l'inspecteur : combien, ce qu'on en fait (masquer, isoler ;
// aligner et répartir sont dans la barre d'outils de la toile), la teinte d'un coup (docs/10, une requête pour toute la
// sélection), un groupe (nouveau ou existant), puis la liste. La sélection vient de Maj + clic, du rectangle, ou de la
// recherche.
import { EyeOff, Focus, Group as GroupIcon, SquareDashedMousePointer } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { hueOfNode } from "../../../canvas/hues";
import type { HueName } from "../../../canvas/hues";
import type { Model } from "../../../canvas/types";
import { useStore } from "../../state/store";
import { plural } from "../../ui";
import { IconButton, Inspector, InspectorHead, List, MoreLink, Row, Section, TextButton, Title } from "../../ui/inspector";
import { GroupPicker, HueSetting, WriteHint } from "./shared";

// Ce que la sélection a en commun : la teinte choisie (si tous en ont la même) et la teinte en vigueur (si une seule).
function common(model: Model, hosts: string[]): { own: string | null; effective: HueName | null } {
  const own = new Set(hosts.map((host) => { const color = model.colorByHost.get(host); return color ? color.hue : null; }));
  const effective = new Set(hosts.map((host) => hueOfNode(model, model.nodeByHost.get(host) || { hostname: host, type: null })));
  return { own: own.size === 1 ? Array.from(own)[0] : null, effective: effective.size === 1 ? Array.from(effective)[0] : null };
}

const LIMIT = 12;

export function MultiCard({ model, hosts }: { model: Model; hosts: string[] }) {
  const { commands, handle } = useStore();
  const [all, setAll] = useState(false);
  const sorted = hosts.slice().sort();
  const devices = hosts.filter((host) => { const node = model.nodeByHost.get(host); return !!node && node.kind !== "stub"; });
  const canWrite = !!handle && handle.intents.canWrite();
  const colour = common(model, devices);
  const [name, setName] = useState("");
  const create = (event: FormEvent): void => { event.preventDefault(); if (devices.length) commands.groupCreate(name.trim() || "Groupe", devices); setName(""); };
  const shown = all ? sorted : sorted.slice(0, LIMIT);
  return (
    <Inspector kind="multi">
      <InspectorHead icon={<SquareDashedMousePointer />} kind="Sélection"
        actions={<>
          <IconButton label="masquer la sélection" onClick={() => commands.hideHosts(hosts)}><EyeOff /></IconButton>
          <IconButton label="isoler avec leurs voisins" onClick={() => commands.isolateHosts(hosts)}><Focus /></IconButton>
        </>}
        title={<Title>{plural(hosts.length, "équipement")}</Title>}>
        {canWrite ? null : <WriteHint action="colorer ou grouper la sélection" />}
      </InspectorHead>
      {devices.length && canWrite ? (
        <Section title="Apparence">
          <Row label="teinte"><HueSetting value={colour.own} inherited={colour.effective} onPick={(next) => commands.colorHosts(devices, next)} /></Row>
        </Section>
      ) : null}
      {devices.length && canWrite ? (
        <Section title="Groupe">
          {/* le bouton ne devient primaire qu'une fois le nom écrit : rien ne crie tant qu'on n'a rien décidé */}
          <Row label="nouveau">
            <form className="insp-inline" onSubmit={create}>
              <input className="ctl" value={name} maxLength={80} placeholder="nom du groupe" aria-label="nom du nouveau groupe" spellCheck={false} onChange={(event) => setName(event.target.value)} />
              <TextButton primary={!!name.trim()} type="submit" title={"un groupe de " + plural(devices.length, "équipement")}><GroupIcon /> Grouper</TextButton>
            </form>
          </Row>
          {model.groupById.size ? <Row label="ajouter à"><GroupPicker model={model} hosts={devices} /></Row> : null}
        </Section>
      ) : null}
      <Section title="Équipements" count={hosts.length}>
        <List label="équipements">
          {shown.map((host) => (
            <li key={host}><button type="button" className="insp-list-row link" title={(model.nodeByHost.get(host) || { type: null }).type || ""} onClick={() => commands.reveal({ kind: "node", id: host })}>
              <span className="insp-list-main"><span className="mono">{host}</span></span>
            </button></li>
          ))}
        </List>
        {sorted.length > LIMIT ? <MoreLink onClick={() => setAll(!all)}>{all ? "moins" : "et " + (sorted.length - LIMIT) + " autres"}</MoreLink> : null}
      </Section>
    </Inspector>
  );
}
