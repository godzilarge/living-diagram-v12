// Une ligne du journal : une entrée, une suite repliée (« ×8 », le même geste répété), ou une session de positions
// (« a placé 48 équipements ×312 », revue Impeccable du 2026-10-10). La tête est un seul bouton
// (déplier), en colonnes alignées d'une ligne à l'autre (heure, catégorie, auteur, modification, infrastructure,
// révision), tenue sur une ligne (la phrase complète en infobulle et dans le détail), lue d'un trait par un lecteur
// d'écran ; un
// objet cité y est cliquable à la souris, « o » l'ouvre au clavier, le détail le propose en bouton. Le détail dit les
// faits en mots (une opération), les verbes regroupés avec leurs équipements (une rafale), chaque geste d'une suite, ou
// les équipements et les requêtes d'une session ; les opérations reçues restent derrière « Brut ». Un objet cité qui
// n'est plus là se dit en fin de cellule (« n'existe plus »), une phrase qui retire a son verbe en rouge. Mémoïsée :
// déplier une ligne ne redessine pas les autres.
import { Braces, Check, ChevronRight, History, Link } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { CATEGORY_LABEL, entryLink, mergedOp, sessionHosts, timeLabel } from "../../state/journal";
import type { JournalEntry, JournalItem, Sentence } from "../../state/journal";
import { count, destroys, detailGroups, factsOf, headline, hiddenHit, majority, sentenceOf, sessionSentence, textOf, visibleMatch } from "../../state/journal-text";
import type { Fact, Piece } from "../../state/journal-text";
import { plural } from "../../ui";
import { goneWord, ICON, Marked, Phrase, Ref } from "./shared";
import type { Presence, Show } from "./shared";

export interface RowProps {
  item: JournalItem; open: boolean; active: boolean; target: boolean; showInfra: boolean; words: string[];
  presence: Presence; show: Show; onToggle: (key: string) => void; onFocusRow: (key: string) => void;
  /** L'historique d'un objet (hostname ou identité), dans son infrastructure. */
  history: (object: string, infrastructure: string) => void;
}

const lineOf = (item: JournalItem): { entry: JournalEntry; sentence: Sentence } => {
  if (item.kind === "entry") return { entry: item.entry, sentence: headline(item.entry) };
  const entry = item.entries[0];
  if (item.kind === "session") { const h = sessionHosts(item.entries); return { entry, sentence: sessionSentence(h.placed.length, h.unpinned.length) }; }
  return { entry, sentence: { ...sentenceOf(entry, mergedOp(item.entries), 0), category: majority(entry) } };
};
/** Un regroupement en partie caché par les filtres le dit (« 2 des 6 requêtes ») : il n'est jamais fusionné avec un
 *  autre, mais une partie peut manquer. */
const partOf = (item: { entries: JournalEntry[]; size: number }): string =>
  (item.entries.length < item.size ? ", " + item.entries.length + " des " + item.size + " requêtes (les autres hors filtre ou plus loin)" : "");
/** Ce que les objets cités par la phrase sont devenus, dit une fois en fin de cellule ; rien pour une phrase qui retire
 *  (« supprimé le groupe Bord » le dit déjà). */
function goneOf(sentence: Sentence, entry: JournalEntry, presence: Presence): string {
  if (destroys(sentence)) return "";
  const refs = sentence.pieces.filter((p): p is Exclude<Piece, string> => typeof p !== "string");
  const gone = refs.find((p) => !presence(entry.infrastructure, p.ref, p.id));
  return gone ? goneWord(gone.ref) : "";
}

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
    <details className="j-raw"><summary><Braces aria-hidden="true" /> Brut : {plural(ops.length, "opération reçue", "opérations reçues")}</summary>
      <pre>{JSON.stringify(entries.length > 1 ? entries.map((e) => ({ at: e.at, revision: e.revision, ops: e.ops })) : ops, (key, value) => (value === null ? undefined : value), 2)}</pre>
    </details>
  );
}

const STEPS_MAX = 200; // requêtes listées dans le détail d'une session (le reste : « Brut » et le CSV)
function Session({ entries, words, presence, show }: { entries: JournalEntry[]; words: string[]; presence: Presence; show: Show }) {
  const { placed, unpinned } = sessionHosts(entries), last = entries[entries.length - 1];
  const facts: Fact[] = [{ label: "de", value: timeLabel(last.at) + " à " + timeLabel(entries[0].at) + ", " + count(entries.length, "requête") }];
  if (placed.length) facts.push({ label: count(placed.length, "placé", "placés"), value: "", list: placed });
  if (unpinned.length) facts.push({ label: count(unpinned.length, "désépinglé", "désépinglés"), value: "", list: unpinned });
  return (
    <>
      <Facts facts={facts} entry={entries[0]} words={words} presence={presence} show={show} />
      <ol className="j-steps">{entries.slice(0, STEPS_MAX).map((e) => (
        <li key={e.revision + e.at}><time dateTime={e.at}>{timeLabel(e.at)}</time><span><Phrase sentence={headline(e)} entry={e} words={words} presence={presence} show={show} /></span></li>
      ))}{entries.length > STEPS_MAX ? <li className="j-more">… et {entries.length - STEPS_MAX} de plus, voir « Brut »</li> : null}</ol>
      <Raw entries={entries} />
    </>
  );
}

const HISTORY_MAX = 4; // objets proposés au pied du détail (une rafale de 500 épingles : l'historique est dans la fiche)
/** Les objets d'une entrée dont on peut ouvrir l'historique : ses sujets, puis ses équipements quand ils sont peu. */
function objectsOf(entry: JournalEntry): { id: string; text: string }[] {
  const subjects = entry.subjects.map((s) => ({ id: s.id, text: s.label || (s.kind === "group" ? "groupe sans nom" : s.kind === "connector" ? "connecteur" : "annotation sans titre") }));
  const hosts = Array.from(new Set(entry.ops.map((op) => (typeof op.hostname === "string" ? op.hostname : "")).filter(Boolean)));
  return subjects.concat(hosts.length <= HISTORY_MAX ? hosts.map((h) => ({ id: h, text: h })) : []).slice(0, HISTORY_MAX);
}

/** Copie dans le presse-papiers, sinon par une sélection (un navigateur qui refuse l'API) ; vrai si c'est fait. */
async function copied(text: string): Promise<boolean> {
  try { if (navigator.clipboard) { await navigator.clipboard.writeText(text); return true; } } catch { /* repli ci-dessous */ }
  const field = document.createElement("textarea");
  field.value = text; field.setAttribute("readonly", ""); field.className = "sr-only";
  document.body.appendChild(field); field.select();
  const done = document.execCommand("copy");
  field.remove();
  return done;
}

/** Le pied du détail : le lien vers l'entrée, l'historique de ses objets. */
const SAID_MS = 4000; // « lien copié » s'efface : une seconde copie se redit (revue, B9)
function EntryActions({ entry, history }: { entry: JournalEntry; history: (object: string, infrastructure: string) => void }) {
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (!said) return undefined;
    const timer = setTimeout(() => setSaid(""), SAID_MS);
    return () => clearTimeout(timer);
  }, [said]);
  const link = entryLink(location.origin + location.pathname, entry);
  const copy = async (): Promise<void> => { setSaid(""); setSaid((await copied(link)) ? "lien copié" : "copie refusée : " + link); };
  return (
    <div className="j-entry-actions">
      <button type="button" className="j-act" onClick={() => { void copy(); }} title={link} data-link={link}>
        {said === "lien copié" ? <Check aria-hidden="true" /> : <Link aria-hidden="true" />}Copier le lien
      </button>
      {objectsOf(entry).map((o) => (
        <button key={o.id} type="button" className="j-act" onClick={() => history(o.id, entry.infrastructure)} title={"tout ce qui a touché " + o.text}><History aria-hidden="true" />Historique de <b>{o.text}</b></button>
      ))}
      <span className="j-act-said" role="status" aria-live="polite">{said}</span>
    </div>
  );
}

function Detail({ item, words, presence, show }: { item: JournalItem; words: string[]; presence: Presence; show: Show }) {
  if (item.kind === "session") return <Session entries={item.entries} words={words} presence={presence} show={show} />;
  if (item.kind === "fold") {
    return (
      <>
        <ol className="j-steps">{item.entries.map((e) => (
          <li key={e.revision}><time dateTime={e.at}>{timeLabel(e.at)}</time><Facts facts={factsOf(e.ops[0], e)} entry={e} words={words} presence={presence} show={show} /></li>
        ))}</ol>
        <Raw entries={item.entries} />
      </>
    );
  }
  const entry = item.entry;
  if (entry.ops.length === 1) return <><Facts facts={factsOf(entry.ops[0], entry)} entry={entry} words={words} presence={presence} show={show} /><Raw entries={[entry]} /></>;
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

function RowView({ item, open, active, target, showInfra, words, presence, show, onToggle, onFocusRow, history }: RowProps) {
  const { entry, sentence } = lineOf(item);
  const fold = item.kind === "entry" ? null : item.entries;
  const id = "j-" + item.key.replace(/[^A-Za-z0-9_-]/g, (c) => "_" + c.charCodeAt(0));
  const last = fold ? fold[fold.length - 1] : entry;
  const why = words.length && !visibleMatch(sentence, entry.author, words);
  const hit = why ? hiddenHit(entry, words) : null;
  const gone = goneOf(sentence, entry, presence);
  const cited = sentence.pieces.some((p) => typeof p !== "string");
  const tone = sentence.category === "positions" ? " quiet" : destroys(sentence) ? " destroy" : "";
  return (
    <li className={"j-row" + (open ? " open" : "") + (target ? " target" : "") + tone}>
      <button type="button" className="j-row-head" data-item={item.key} tabIndex={active ? 0 : -1} aria-expanded={open ? "true" : "false"} aria-controls={open ? id : undefined}
        aria-keyshortcuts={cited ? "o" : undefined} onClick={() => onToggle(item.key)} onFocus={() => onFocusRow(item.key)}>
        <time className="j-time" dateTime={entry.at} title={entry.at}>{timeLabel(entry.at)}</time>
        <span className={"j-cat cat-" + sentence.category} title={CATEGORY_LABEL[sentence.category]}>{ICON[sentence.category]}<span className="sr-only">{CATEGORY_LABEL[sentence.category]} : </span></span>
        <span className="j-who" title={entry.author}><Marked text={entry.author} words={words} /></span>
        <span className="j-text">
          <span className="j-say" title={entry.author + " " + textOf(sentence)}><Phrase sentence={sentence} entry={entry} words={words} presence={presence} show={show} inline /></span>
          {gone ? <span className="j-gone">{gone}</span> : null}
          {item.kind === "fold" ? <span className="j-times" title={"de " + timeLabel(last.at) + " à " + timeLabel(entry.at) + partOf(item)}><span aria-hidden="true">×{item.entries.length}</span><span className="sr-only">, {item.entries.length} fois</span></span> : null}
          {item.kind === "session" ? <span className="j-since" title={"de " + timeLabel(last.at) + " à " + timeLabel(entry.at) + partOf(item)}>{count(item.entries.length, "requête")} depuis {timeLabel(last.at)}</span> : null}
          {why ? <span className="j-why">{hit ? <>trouvé : <Marked text={hit} words={words} /></> : "trouvé dans le détail"}</span> : null}
        </span>
        {showInfra ? <span className="j-infra" title={entry.infrastructure}><span className="sr-only">, infrastructure </span>{entry.infrastructure}</span> : null}
        <span className="j-rev" title="révision de l'intention après cette modification"><span className="sr-only">, révision </span>r{fold ? last.revision + "–" + entry.revision : entry.revision}</span>
        <ChevronRight className="j-chevron" aria-hidden="true" />
      </button>
      {open ? <div className="j-detail" id={id}><Detail item={item} words={words} presence={presence} show={show} /><EntryActions entry={entry} history={history} /></div> : null}
    </li>
  );
}

export const Row = memo(RowView);
