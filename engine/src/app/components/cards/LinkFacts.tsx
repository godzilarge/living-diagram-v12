// La fiche d'un câble en vue Diagramme (2026-10-09) : ses deux bouts, ce que le lien a de commun (vitesse, faisceau,
// agrégats), ses changements, puis les deux ports tels que les équipements les décrivent. Ni statut, ni source, ni
// évidence, ni contrôle : ce que B1 en a conclu se lit en vue Contrôle. « down » reste : c'est un port qui le dit.
import { Cable, Crosshair } from "lucide-react";
import { useTranslation } from "react-i18next";
import { speedText } from "../../../canvas/format";
import type { Model, ModelLink } from "../../../canvas/types";
import { useStore } from "../../state/store";
import { Badge, DiffBadge } from "../../ui";
import { Facts, IconButton, Inspector, InspectorHead, Section } from "../../ui/inspector";
import { Ends, Port } from "./LinkCard";
import { changeRows } from "./shared";

export function LinkFacts({ model, link }: { model: Model; link: ModelLink }) {
  const { commands } = useStore();
  const { t } = useTranslation("panel");
  const raw = link.raw;
  const change = link.ghost ? { kind: "removed" as const } : model.changeOf("link", link.id);
  return (
    <Inspector kind="link-facts">
      <InspectorHead icon={<Cable />} kind={t("link.kind")}
        actions={<IconButton label={t("link.center")} onClick={() => commands.reveal({ kind: "link", id: link.id })}><Crosshair /></IconButton>}
        title={<Ends a={{ hostname: raw.a.hostname, port: raw.a.interface || "" }} b={{ hostname: raw.b.hostname, port: raw.b.interface || "" }} />}
        badges={raw.oper === "down" || change ? <>
          {raw.oper === "down" ? <Badge kind="oper" value="down" label="down" /> : null}
          {change ? <DiffBadge kind={change.kind} /> : null}
        </> : undefined} />
      {raw.speed_mbps || link.beam || raw.aggregate_a || raw.aggregate_b ? (
        <Section title={t("link.section")}>
          <Facts rows={[
            [t("link.speed"), raw.speed_mbps ? speedText(raw.speed_mbps) : null],
            [t("link.beam"), link.beam ? <button key="b" type="button" className="linklike mono" onClick={() => commands.reveal({ kind: "beam", id: (link.beam as NonNullable<typeof link.beam>).id })}>{link.beam.a.aggregate} ⇄ {link.beam.b.aggregate}</button> : null],
            [t("link.aggregates"), [raw.aggregate_a, raw.aggregate_b].filter(Boolean).join(" · ") || null],
          ]} />
        </Section>
      ) : null}
      {change && change.kind === "changed" ? <Section title={t("node.changes")} count={change.fields.length}><Facts rows={changeRows(change.fields)} /></Section> : null}
      <Section title={t("link.ports")}><div className="insp-ports"><Port model={model} end={raw.a} removed={link.ghost} /><Port model={model} end={raw.b} removed={link.ghost} /></div></Section>
    </Inspector>
  );
}
