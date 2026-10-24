// The Verdicts widget (design/comps/shell/control.html; the register by rule, V3, DESIGN.md, Register): B1's checks of
// the collection, one row per severity and code, grouped under their rule's family; a row counts the things it names
// (each once), a section heading and a toggle count checks, as the Check tab and the panel do. Its header: the title, the total of checks (always the total), the three
// severity toggles with their counts (each shows or hides its group), the filter on the right (the sentence, the
// code, the targets' names). A row opens on its targets: each a Link that shows the element in the Diagram view.
// Toggles, filter and the rows opened are transient: neither stored nor in the address. A tile of Check's grid: its
// header moves it, its last button enlarges it (`tile`).
import { Boxes, Cable, CircleDashed, EthernetPort, Layers, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Model } from "@engine/canvas/types";
import type { Severity } from "@engine/contracts/snapshot";
import { Button, Field, Register, RegisterTargets, Widget, WidgetToggles } from "../ui";
import type { RegisterGroup, WidgetEnlarge } from "../ui";
import { useText } from "../i18n";
import { Note } from "../shell/Note";
import type { Translate } from "../i18n";
import { deviceTile } from "../panel/DevicePanel";
import type { Address, ViewState } from "../state/address";
import { ALL_SHOWN, sectionsByRule, SEVERITIES, severityTotals, targetHref, toggleOpen, toggleSeverity, toneOfSeverity, verdictGroups } from "../state/control";
import type { Shown, Target, VerdictGroup } from "../state/control";
import { familyWords, targetWords, verdictWords } from "./words";

function targetIcon(model: Model, target: Target): ReactNode {
  switch (target.kind) {
    case "node": {
      const node = model.nodeByHost.get(target.hostname);
      return node ? deviceTile(node) : <EthernetPort />;
    }
    case "interface": return <EthernetPort />;
    case "aggregate": return <Layers />;
    case "link": return <Cable />;
    case "cluster": return <Boxes />;
    case "neighbor": {
      const node = target.selection ? model.nodeByHost.get(target.selection.token) : undefined;
      return node ? deviceTile(node) : <CircleDashed />;
    }
    case "pair": return <Layers />;
    case "finding": {
      const node = model.nodeByHost.get(target.hostname);
      return node ? deviceTile(node) : <EthernetPort />;
    }
  }
}

type Where = Readonly<{ address: Address; view: ViewState }>;

function registerGroups(t: Translate, model: Model, where: Where, shown: Shown, query: string, groups: readonly VerdictGroup[]): RegisterGroup[] {
  const sentence = (group: VerdictGroup) => verdictWords(t, group);
  return sectionsByRule(groups, shown, query, sentence).map((section) => ({
    id: section.family,
    label: familyWords(t, section.family),
    count: section.count,
    rows: section.groups.map((group) => ({
      id: group.id,
      tone: group.tone,
      title: sentence(group),
      code: group.code,
      detail: (
        <RegisterTargets
          label={t("control:verdicts.targets")}
          targets={group.targets.map((target) => ({
            id: target.key,
            icon: targetIcon(model, target),
            label: targetWords(t, target),
            href: target.selection ? targetHref(where.address, where.view, target.selection) : null,
          }))}
        />
      ),
    })),
  }));
}

function Toggles({ shown, totals, onToggle }: { shown: Shown; totals: Readonly<Record<Severity, number>>; onToggle: (severity: Severity) => void }) {
  const t = useText();
  return (
    <WidgetToggles name="severities" label={t("control:verdicts.severities")}>
      {SEVERITIES.map((severity) => (
        <Button key={severity} pressed={shown[severity]} count={{ value: totals[severity], tone: totals[severity] ? toneOfSeverity(severity) : "neutral" }} onClick={() => onToggle(severity)}>
          {t(`control:verdicts.severity.${severity}`)}
        </Button>
      ))}
    </WidgetToggles>
  );
}

export function VerdictsWidget({ model, address, view, enlarge }: { model: Model; address: Address; view: ViewState; enlarge: WidgetEnlarge }) {
  const t = useText();
  const groups = useMemo(() => verdictGroups(model), [model]);
  const totals = useMemo(() => severityTotals(groups), [groups]);
  const [shown, setShown] = useState<Shown>(ALL_SHOWN);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const register = registerGroups(t, model, { address, view }, shown, query, groups);
  return (
    <Widget
      name="verdicts"
      heading={t("control:verdicts.title")}
      count={model.checks.length}
      handle
      enlarge={enlarge}
      toggles={<Toggles shown={shown} totals={totals} onToggle={(severity) => setShown((current) => toggleSeverity(current, severity))} />}
      action={
        <Field
          fluid
          label={t("control:verdicts.filter")}
          placeholder={t("control:verdicts.placeholder")}
          icon={<Search />}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      }
    >
      {groups.length === 0 ? (
        <Note>{t("control:verdicts.empty")}</Note>
      ) : register.length === 0 ? (
        <Note>{t("control:verdicts.none")}</Note>
      ) : (
        <Register
          label={t("control:verdicts.title")}
          columns={{ mark: t("control:verdicts.columns.mark"), verdict: t("control:verdicts.columns.verdict"), code: t("control:verdicts.columns.code"), open: t("control:verdicts.columns.open") }}
          groups={register}
          open={open}
          onToggle={(id) => setOpen((current) => toggleOpen(current, id))}
        />
      )}
    </Widget>
  );
}
