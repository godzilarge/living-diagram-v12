// The Log's primitives: the facets (an exclusive choice on the left rail, cumulative toggles with the check, a section
// that can be cleared, a zero in ink-4) and the feed (by day: a quiet row, a tallied one, a deletion, one unfolded, one
// hovered, a link's target; without days and inert, as on the home).
import { Group, Move, Palette, Spline, StickyNote } from "lucide-react";
import { useState } from "react";
import { Facets, Feed, FeedDay, FeedItem, FeedList, FeedNote, FeedTally, FeedVerb, Island } from "../../ui";
import type { FacetGroup } from "../../ui";
import { useText } from "../../i18n";
import { AUTHORS, INFRASTRUCTURES, LOG_COUNTS, LOG_OBJECTS } from "../sample";
import { Row, Section } from "../Specimen";

function FacetsSpecimen() {
  const t = useText();
  const [infrastructure, setInfrastructure] = useState(INFRASTRUCTURES[0]);
  const [categories, setCategories] = useState<string[]>(["annotations"]);
  const [authors, setAuthors] = useState<string[]>([]);
  const toggle = (list: string[], value: string): string[] => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const counts: Readonly<Record<string, number>> = { "*": LOG_COUNTS.all, [INFRASTRUCTURES[0]]: LOG_COUNTS.demo, [INFRASTRUCTURES[1]]: LOG_COUNTS.paris, [INFRASTRUCTURES[2]]: LOG_COUNTS.lyon };
  const icons = { positions: <Move />, colors: <Palette />, groups: <Group />, annotations: <StickyNote />, connectors: <Spline /> } as const;
  const groups: FacetGroup[] = [
    {
      id: "infrastructure",
      title: t("journal:ui.infrastructure"),
      kind: "exclusive",
      value: infrastructure,
      onChange: setInfrastructure,
      options: ["*", ...INFRASTRUCTURES].map((value) => {
        const label = value === "*" ? t("journal:ui.all") : value;
        return { value, label, count: counts[value], note: value === INFRASTRUCTURES[0] ? t("journal:ui.open") : undefined, said: label };
      }),
    },
    {
      id: "category",
      title: t("journal:ui.categories"),
      kind: "cumulative",
      value: categories,
      onToggle: (value) => setCategories((list) => toggle(list, value)),
      clear: categories.length ? { label: t("journal:ui.clear"), said: t("journal:ui.clear"), onClear: () => setCategories([]) } : null,
      options: (Object.keys(icons) as (keyof typeof icons)[]).map((c) => ({ value: c, label: t(`journal:category.${c}`), icon: icons[c], count: LOG_COUNTS[c], said: t(`journal:category.${c}`) })),
    },
    {
      id: "author",
      title: t("journal:ui.authors"),
      kind: "cumulative",
      value: authors,
      onToggle: (value) => setAuthors((list) => toggle(list, value)),
      options: AUTHORS.map((name, i) => ({ value: name, label: name, avatar: name, count: [302, 71, 39][i], said: name })),
    },
  ];
  return (
    <figure className="page-specimen page-facets">
      <Island name="facets-specimen" className="page-facets-island">
        <Facets label={t("journal:ui.filters")} groups={groups} />
      </Island>
      <figcaption>{t("primitives:log.facets")}</figcaption>
    </figure>
  );
}

function FeedSpecimen() {
  const t = useText();
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState("added");
  const by = (author: string) => <b>{author}</b>;
  return (
    <figure className="page-specimen page-feed">
      <Island name="feed-specimen" layout="panel">
        <Feed>
          <FeedDay day={t("primitives:log.today")}>
            <FeedItem author={AUTHORS[0]} tone="quiet" sentence={<>{by(AUTHORS[0])} {t("primitives:log.placed")}</>} when="17:30" sub={t("journal:ui.rev", { rev: 41 })} item="placed" active={active === "placed"} onActive={() => setActive("placed")} onToggle={() => undefined} />
            <FeedItem
              author={AUTHORS[1]}
              sentence={<>{by(AUTHORS[1])} {t("primitives:log.added", { name: LOG_OBJECTS.annotation })}</>}
              when="16:20"
              sub={t("journal:ui.rev", { rev: 40 })}
              item="added"
              expanded={open}
              active={active === "added"}
              onActive={() => setActive("added")}
              onToggle={() => setOpen((v) => !v)}
            >
              {open ? <p className="page-note">{t("primitives:log.detail")}</p> : null}
            </FeedItem>
            <FeedItem
              author={AUTHORS[0]}
              sentence={<>{by(AUTHORS[0])} {t("primitives:log.edited", { name: LOG_OBJECTS.table })}</>}
              after={<FeedTally times={t("journal:ui.tally", { total: 8 })}>{t("journal:ui.fromTo", { from: "14:58", to: "15:02", part: "" })}</FeedTally>}
              when="15:02"
              sub={t("journal:ui.revs", { first: 32, last: 39 })}
              item="edited"
              target
              active={active === "edited"}
              onActive={() => setActive("edited")}
              onToggle={() => undefined}
            />
            <FeedItem
              author={AUTHORS[2]}
              tone="destroy"
              sentence={
                <>
                  {by(AUTHORS[2])} <FeedVerb>{t("primitives:log.deleted")}</FeedVerb>
                  {t("primitives:log.deletedRest", { name: LOG_OBJECTS.group })}
                </>
              }
              when="11:48"
              sub={t("journal:ui.rev", { rev: 31 })}
              item="deleted"
              active={active === "deleted"}
              onActive={() => setActive("deleted")}
              onToggle={() => undefined}
            />
            <FeedItem
              author={AUTHORS[0]}
              tone="quiet"
              sentence={<>{by(AUTHORS[0])} {t("primitives:log.placed")}</>}
              after={<FeedNote>{t("journal:ui.since", { count: 312, time: "08:41" })}</FeedNote>}
              caption={INFRASTRUCTURES[0]}
              when="09:10"
              sub={t("journal:ui.rev", { rev: 30 })}
            />
          </FeedDay>
        </Feed>
      </Island>
      <figcaption>{t("primitives:log.feed")}</figcaption>
    </figure>
  );
}

function FlatSpecimen() {
  const t = useText();
  return (
    <figure className="page-specimen page-feed">
      <Island name="feed-flat-specimen" layout="panel">
        <Feed>
          <FeedList>
            {AUTHORS.map((author, i) => (
              <FeedItem key={author} author={author} sentence={<>{<b>{author}</b>} {t("primitives:log.placed")}</>} caption={INFRASTRUCTURES[i]} when={`1${i}:0${i}`} />
            ))}
          </FeedList>
        </Feed>
      </Island>
      <figcaption>{t("primitives:log.flat")}</figcaption>
    </figure>
  );
}

export function LogSection() {
  const t = useText();
  return (
    <Section id="log" heading={t("primitives:log.title")} note={t("primitives:log.note")}>
      <Row>
        <FacetsSpecimen />
        <FeedSpecimen />
        <FlatSpecimen />
      </Row>
    </Section>
  );
}
