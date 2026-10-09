// Une ligne du journal : une entrée, ou une suite repliée (« ×8 », le même geste répété). La tête est un seul bouton
// (déplier), en colonnes alignées d'une ligne à l'autre (heure, catégorie, auteur, modification, infrastructure,
// révision), tenue sur une ligne (la phrase complète en infobulle et dans le détail), lue d'un trait par un lecteur
// d'écran ; un
// objet cité y est cliquable à la souris, « o » l'ouvre au clavier, le détail le propose en bouton. Le détail dit les
// faits en mots (une opération), les verbes regroupés avec leurs équipements (une rafale), ou chaque geste d'une
// suite ; les opérations reçues restent derrière « brut ». Mémoïsée : déplier une ligne ne redessine pas les autres.
import { Braces, ChevronRight } from "lucide-react";
import { memo } from "react";
import { CATEGORY_LABEL, mergedOp, timeLabel } from "../../state/journal";
import type { JournalEntry, JournalItem, Sentence } from "../../state/journal";
import { detailGroups, factsOf, headline, hiddenHit, majority, sentenceOf, textOf, visibleMatch } from "../../state/journal-text";
import type { Fact } from "../../state/journal-text";
import { plural } from "../../ui";
import { ICON, Marked, Phrase, Ref } from "./shared";
import type { Presence, Show } from "./shared";

export interface RowProps {
  item: JournalItem; open: boolean; active: boolean; showInfra: boolean; words: string[];
  presence: Presence; show: Show; onToggle: (key: string) => void; onFocusRow: (key: string) => void;
}

const lineOf = (item: JournalItem): { entry: JournalEntry; sentence: Sentence } => {
  if (item.kind === "entry") return { entry: item.entry, sentence: headline(item.entry) };
  const entry = item.entries[0];
  return { entry, sentence: { ...sentenceOf(entry, mergedOp(item.entries), 0), category: majority(entry) } };
};

function Facts({ facts, entry, words, presence, show }: { facts: Fact[]; entry: JournalEntry; words: string[]; presence: Presence; show: Show }) {
  if (!facts.length) return null;
  return (
    <dl className="j-facts">{facts.map((fact, i) => (
      <div key={i}><dt>{fact.label}</dt><dd>{fact.list ? <Hosts hosts={fact.list} entry={entry} words={words} presence={presence} show={show} /> : <Marked text={fact.value} words={words} />}</dd></div>
    ))}</dl>
  );
}

const HOSTS_MAX = 60;
function Hosts({ hosts, entry, words, presence, show }: { hosts: string[]; entry: JournalEntry; words: string[]; presence: Presence; show: Show }) {
  return (
    <ul className="j-hosts">
      {hosts.slice(0, HOSTS_MAX).map((host) => <li key={host}><Ref piece={{ ref: "node", id: host, text: host }} entry={entry} words={words} presence={presence} show={show} inline={false} /></li>)}
      {hosts.length > HOSTS_MAX ? <li className="j-more">et {hosts.length - HOSTS_MAX} de plus</li> : null}
    </ul>
  );
}

function Raw({ entries }: { entries: JournalEntry[] }) {
  const ops = entries.flatMap((e) => e.ops);
  return (
    <details className="j-raw"><summary><Braces aria-hidden="true" /> brut : {plural(ops.length, "opération reçue", "opérations reçues")}</summary>
      <pre>{JSON.stringify(entries.length > 1 ? entries.map((e) => ({ at: e.at, revision: e.revision, ops: e.ops })) : ops, (key, value) => (value === null ? undefined : value), 2)}</pre>
    </details>
  );
}

function Detail({ item, words, presence, show }: { item: JournalItem; words: string[]; presence: Presence; show: Show }) {
  if (item.kind === "fold") {
    return (
      <>
        <ol className="j-steps">{item.entries.map((e) => (
          <li key={e.revision}><time dateTime={e.at}>{timeLabel(e.at)}</time><Facts facts={factsOf(e.ops[0])} entry={e} words={words} presence={presence} show={show} /></li>
        ))}</ol>
        <Raw entries={item.entries} />
      </>
    );
  }
  const entry = item.entry;
  if (entry.ops.length === 1) return <><Facts facts={factsOf(entry.ops[0])} entry={entry} words={words} presence={presence} show={show} /><Raw entries={[entry]} /></>;
  const groups = detailGroups(entry);
  return (
    <>
      <ol className="j-ops">{groups.map((g, i) => (
        <li key={i}>
          <span className={"j-dot cat-" + g.sentence.category} aria-hidden="true" />
          <div><Phrase sentence={g.sentence} entry={entry} words={words} presence={presence} show={show} />{g.hosts.length ? <> :<Hosts hosts={g.hosts} entry={entry} words={words} presence={presence} show={show} /></> : null}</div>
        </li>
      ))}{entry.ops.length > 50 && groups.length >= 50 ? <li className="j-more">… et d'autres opérations, voir « brut »</li> : null}</ol>
      <Raw entries={[entry]} />
    </>
  );
}

function RowView({ item, open, active, showInfra, words, presence, show, onToggle, onFocusRow }: RowProps) {
  const { entry, sentence } = lineOf(item);
  const fold = item.kind === "fold" ? item.entries : null;
  const id = "j-" + item.key.replace(/[^A-Za-z0-9_-]/g, (c) => "_" + c.charCodeAt(0));
  const last = fold ? fold[fold.length - 1] : entry;
  const why = words.length && !visibleMatch(sentence, entry.author, words);
  const hit = why ? hiddenHit(entry, words) : null;
  return (
    <li className={"j-row" + (open ? " open" : "") + (sentence.category === "positions" ? " quiet" : "")}>
      <button type="button" className="j-row-head" data-item={item.key} tabIndex={active ? 0 : -1} aria-expanded={open ? "true" : "false"} aria-controls={open ? id : undefined}
        onClick={() => onToggle(item.key)} onFocus={() => onFocusRow(item.key)}>
        <time className="j-time" dateTime={entry.at} title={entry.at}>{timeLabel(entry.at)}</time>
        <span className={"j-cat cat-" + sentence.category} title={CATEGORY_LABEL[sentence.category]}>{ICON[sentence.category]}<span className="sr-only">{CATEGORY_LABEL[sentence.category]} : </span></span>
        <span className="j-who" title={entry.author}><Marked text={entry.author} words={words} /></span>
        <span className="j-text">
          <span className="j-say" title={entry.author + " " + textOf(sentence)}><Phrase sentence={sentence} entry={entry} words={words} presence={presence} show={show} inline /></span>
          {fold ? <span className="j-times" title={"de " + timeLabel(last.at) + " à " + timeLabel(entry.at)}><span className="sr-only">, </span>×{fold.length}</span> : null}
          {why ? <span className="j-why">{hit ? <>trouvé : <Marked text={hit} words={words} /></> : "trouvé dans le détail"}</span> : null}
        </span>
        {showInfra ? <span className="j-infra" title={entry.infrastructure}><span className="sr-only">, infrastructure </span>{entry.infrastructure}</span> : null}
        <span className="j-rev" title="révision de l'intention après cette modification"><span className="sr-only">, révision </span>r{fold ? last.revision + "–" + entry.revision : entry.revision}</span>
        <ChevronRight className="j-chevron" aria-hidden="true" />
      </button>
      {open ? <div className="j-detail" id={id}><Detail item={item} words={words} presence={presence} show={show} /></div> : null}
    </li>
  );
}

export const Row = memo(RowView);
