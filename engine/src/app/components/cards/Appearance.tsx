// La section « Apparence » d'un équipement (vue Diagramme, 2026-10-09 : tout ce qui s'édite reste dans cette vue) : sa
// teinte (docs/10), ses groupes ; en lecture seule sans nom. Toujours la dernière section de la fiche, repliée : les
// faits d'abord, l'édition à un clic.
import { X } from "lucide-react";
import { defaultHue, hueLabel, hueOfNode } from "../../../canvas/hues";
import type { Model, ModelNode } from "../../../canvas/types";
import { useStore } from "../../state/store";
import { Hint, IconButton, List, ListRow, Row, Section } from "../../ui/inspector";
import { GroupPicker, HueSetting, WriteHint, signed } from "./shared";

export function Appearance({ model, node, canWrite }: { model: Model; node: ModelNode; canWrite: boolean }) {
  const { commands } = useStore();
  const hue = hueOfNode(model, node), own = model.colorByHost.get(node.hostname), typeColor = node.type ? model.colorByType.get(node.type) : undefined;
  const groups = model.groupsByHost.get(node.hostname) || [];
  const origin = own ? "choisie par " + signed(own.author, own.at) : typeColor ? "teinte du type, choisie par " + typeColor.author : "teinte par défaut du type";
  return (
    <Section title="Apparence" count={groups.length ? groups.length + (groups.length > 1 ? " groupes" : " groupe") : undefined} collapsible defaultOpen={false}>
      {canWrite ? null : <WriteHint action="changer sa teinte ou ses groupes" />}
      <Row label="teinte">{canWrite
        ? <HueSetting value={own ? own.hue : null} inherited={typeColor ? typeColor.hue : defaultHue(node.type)} onPick={(next) => commands.color(node.hostname, next)} />
        : <span className="insp-fact">{hueLabel(hue)}</span>}</Row>
      <Hint>{origin}</Hint>
      {groups.length ? (
        <List label="groupes">
          {groups.map((group) => (
            <ListRow key={group.id} trailing={canWrite && group.members.length > 1 ? <IconButton label={"retirer de " + group.label} onClick={() => commands.groupRemove(group.id, [node.hostname])}><X /></IconButton> : null}>
              <span className={"hue-dot hue-" + group.style.hue} aria-hidden="true" />
              <button type="button" className="linklike" onClick={() => commands.reveal({ kind: "group", id: group.id })}>{group.label}</button>
            </ListRow>
          ))}
        </List>
      ) : null}
      {canWrite ? <Row label="groupes"><GroupPicker model={model} hosts={[node.hostname]} exclude={groups.map((group) => group.id)} /></Row> : null}
    </Section>
  );
}
