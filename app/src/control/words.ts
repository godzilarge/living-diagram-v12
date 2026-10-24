// The Check view's words on the values of `state/control.ts`: a verdict's sentence (one per code, absolute, with its
// count), the rule's family (a section of the register), a target's name, the coverage's facts and words, a combination of sources and a cable's
// status, the facts of the delivery. Every sentence comes from the catalogue `control`, values interpolated, never
// assembled here; identifiers (hostnames, ports, codes, versions) stay as the data says them.
import { shortPort } from "@engine/canvas/format";
import type { CheckCode } from "@engine/contracts/snapshot";
import type { Translate } from "../i18n";
import type { Fact } from "../ui";
import type { CollectionWord, Delivery, Family, Target, Topic, TopicWord, VerdictGroup } from "../state/control";
import { KNOWN_CODES } from "../state/control";
import { dateAndClock } from "../state/time";

/** "2 aggregates without enough active members": the catalogue's sentence for a code the page knows; for another one
 *  (a newer server) "2 other checks", the code then said by its chip. */
export function verdictWords(t: Translate, group: Pick<VerdictGroup, "code" | "count">): string {
  if (KNOWN_CODES.has(group.code)) return t(`control:codes.${group.code as CheckCode}`, { count: group.count });
  return t("control:codes.other", { count: group.count });
}

/** A rule family as the register's section names it ("Aggregates, MLAG and HA"). */
export const familyWords = (t: Translate, family: Family): string => t(`control:sections.${family}`);

const portWords = (t: Translate, host: string, port: string): string => t("control:targets.port", { host, port });

/** A target as the register names it: a device, "host · Eth1/1", "host · port-channel101", "host · Eth1/1 to other ·
 *  Gi0/1", a cluster's members, a neighbour as announced, "host · Po10 and other · Po10", a finding's element. */
export function targetWords(t: Translate, target: Target): string {
  switch (target.kind) {
    case "node": return target.hostname;
    case "interface": return portWords(t, target.hostname, shortPort(target.name));
    case "aggregate": return portWords(t, target.hostname, target.name);
    case "link": {
      const a = portWords(t, target.hostname, shortPort(target.name));
      const b = target.remote ? portWords(t, target.remote.hostname, shortPort(target.remote.name)) : "";
      return t("control:targets.cable", { a, b });
    }
    case "cluster": return target.members.join(t("control:targets.join"));
    case "neighbor": return target.hostname;
    case "pair": {
      const a = portWords(t, target.hostname, target.name);
      const b = target.remote ? portWords(t, target.remote.hostname, target.remote.name) : "";
      return t("control:targets.pair", { a, b });
    }
    case "finding": return target.name ? portWords(t, target.hostname, target.name) : target.hostname;
  }
}

export const collectionWords = (t: Translate, status: CollectionWord): string => t(`control:coverage.status.${status}`);
export const topicWords = (t: Translate, topic: Topic): string => t(`control:coverage.topics.${topic}`);
/** "LLDP: not asked": what a topic's mark says to assistive technologies. */
export const topicSaid = (t: Translate, topic: Topic, word: TopicWord): string =>
  t("control:coverage.said", { topic: topicWords(t, topic), state: t(`control:coverage.topic.${word}`) });

/** A count said, or the "none" word at zero. */
const counted = (t: Translate, key: Parameters<Translate>[0], none: Parameters<Translate>[0], count: number): string => (count ? t(key, { count }) : t(none));

/** The delivery's facts, each left out when the data does not say it (never a blank). */
export function deliveryFacts(t: Translate, delivery: Delivery): readonly Fact[] {
  const received = delivery.storedAt ? dateAndClock(delivery.storedAt, t("ui:locale")) : null;
  const facts: (Fact | null)[] = [
    delivery.exporter ? { label: t("control:delivery.exporter"), value: delivery.exporter } : null,
    delivery.contract ? { label: t("control:delivery.contract"), value: t("control:delivery.contractValue", { version: delivery.contract }) } : null,
    received?.date ? { label: t("control:delivery.received"), value: t("diagram:context.runWords", received) } : null,
    {
      label: t("control:delivery.devices"),
      value: t("control:delivery.devicesValue", { scope: t("control:delivery.scope", { count: delivery.scope }), answered: t("control:delivery.answered", { count: delivery.answered }) }),
    },
    delivery.findings === null ? null : { label: t("control:delivery.findings"), value: counted(t, "control:delivery.findingsValue", "control:delivery.findingsNone", delivery.findings) },
    {
      label: t("control:delivery.normalizations"),
      value: t("control:delivery.normalizationsValue", {
        residual: counted(t, "control:delivery.residual", "control:delivery.residualNone", delivery.residual),
        applied: counted(t, "control:delivery.applied", "control:delivery.appliedNone", delivery.applied),
      }),
    },
    { label: t("control:delivery.unread"), value: counted(t, "control:delivery.unreadValue", "control:delivery.unreadNone", delivery.unread) },
    { label: t("control:delivery.unresolved"), value: counted(t, "control:delivery.unresolvedValue", "control:delivery.unresolvedNone", delivery.unresolved) },
  ];
  return facts.filter((fact): fact is Fact => fact !== null);
}
