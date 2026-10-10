"""Le journal de la couche d'intention, relu : qui a modifié quoi, quand, sur quelle infrastructure (lecture seule).

`intent.py` écrit une ligne par requête acceptée dans `<archive>/_intent/<infra>/journal.jsonl` (`at`, `author`,
`revision`, `ops` tels que reçus) ; ce module la relit pour la vue Journal de l'application. Règles :
- **rien ne s'écrit ici** ; le journal reste la source, le document d'intention n'est lu que pour le nom de
  l'infrastructure d'un dossier (un nom long ou spécial est haché dans le nom du dossier) ;
- une **catégorie** se déduit du nom de l'opération (`positions`, `colors`, `groups`, `annotations`, `connectors`) ; une
  opération inconnue (version future, ou passée) est `other` : les opérations ne sont **pas** revalidées contre le
  contrat du jour, un journal garde l'histoire telle qu'elle a été acceptée ;
- les **sujets** d'une entrée (groupe, annotation, connecteur cités par leur identité) portent le nom connu à cette
  révision, rejoué depuis le début du journal : « a supprimé le groupe Cœur » plutôt que « g12-1 » ;
- une ligne illisible est **sautée et comptée** (`unreadable`), jamais une erreur ; une dernière ligne sans fin de ligne
  est une écriture en cours, ni lue ni comptée ;
- ordre : la plus récente d'abord (date, puis infrastructure, puis révision, décroissants) ; pagination par **curseur**
  (la clé de la dernière entrée servie) : une ligne ajoutée entre deux pages ne décale rien ;
- facettes (auteurs, catégories, infrastructures) : **toujours les mêmes valeurs, dans le même ordre** (Orhan,
  2026-10-09 : « les sous-menus ne doivent pas bouger ») : toutes celles du journal, sans aucun filtre (auteurs et
  catégories dans l'infrastructure choisie), par nom ; chacune comptée **sans son propre filtre**, zéro compris ;
- coût linéaire dans la taille des journaux ; chaque fichier n'est relu que s'il a changé (taille, date).
"""

import base64
import binascii
import json
import logging
import threading
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from pydantic import Field

from ld_backend.archive import _segment
from ld_backend.intent import INTENT_DIR, INTENT_FILE, JOURNAL_FILE
from ld_backend.journal_groups import Item, JournalGroup, groups_of
from ld_backend.journal_index import ACTIONS, Action, actions_of, refs_of
from ld_backend.journal_replay import NameReplay
from ld_backend.journal_words import KIND_WORDS, MANY_WORDS, fold, op_words
from ld_backend.schemas import ApiModel

log = logging.getLogger(__name__)

Category = Literal["positions", "colors", "groups", "annotations", "connectors", "other"]
CATEGORIES: tuple[Category, ...] = ("positions", "colors", "groups", "annotations", "connectors", "other")
_BY_OP: dict[str, Category] = {
    "pin": "positions",
    "unpin": "positions",
    "color": "colors",
    "uncolor": "colors",
    "color_type": "colors",
    "uncolor_type": "colors",
}
_BY_PREFIX: dict[str, Category] = {"group_": "groups", "annotation_": "annotations", "connector_": "connectors"}
_CREATED = {"group_create": "g", "annotation_create": "a", "connector_create": "c"}
_SUBJECT_KIND = {"g": "group", "a": "annotation", "c": "connector"}
PRUNE_OP = "journal_prune"  # la trace d'une purge (`journal_prune.py`)
DEFAULT_LIMIT, MAX_LIMIT = 100, 500


def category_of(op: str) -> Category:
    if op in _BY_OP:
        return _BY_OP[op]
    return next((cat for prefix, cat in _BY_PREFIX.items() if op.startswith(prefix)), "other")


def categories_of(ops: Iterable[dict[str, Any]]) -> list[Category]:
    """Les catégories d'une entrée, dans l'ordre fixe de `CATEGORIES`, sans doublon."""
    found = {category_of(str(op.get("op", ""))) for op in ops}
    return [cat for cat in CATEGORIES if cat in found]


class JournalSubject(ApiModel):
    id: str = Field(description="Identité attribuée par le serveur (`g…`, `a…`, `c…`).")
    kind: Literal["group", "annotation", "connector"]
    label: str = Field(
        description="Le nom connu à cette révision (libellé, début d'une note, taille d'un tableau) ; vide si aucun."
    )
    form: str = Field(description="La sorte d'une annotation (`note`, `shape`, `table`, `image`) ; vide sinon.")


class JournalEntry(ApiModel):
    """Une requête acceptée par `POST /api/intent/patches` : une ligne du journal."""

    infrastructure: str
    revision: int = Field(description="La révision du document d'intention après cette requête.")
    at: str = Field(description="Date d'application, UTC (`Z`).")
    author: str = Field(description="Nom déclaré dans la page (pas un compte).")
    categories: list[Category]
    actions: list[Action] = Field(description="Créé, modifié, supprimé (`journal_index.py`), ordre fixe, sans doublon.")
    created: list[str] = Field(description="Les identités attribuées par cette requête, dans l'ordre des créations.")
    subjects: list[JournalSubject] = Field(
        description="Groupes, annotations, connecteurs cités, avec leur nom d'alors."
    )
    ops: list[dict[str, Any]] = Field(description="Les opérations telles que reçues, dans l'ordre (non revalidées).")
    group: JournalGroup | None = Field(
        default=None, description="Session de positions ou répétition d'un même geste (`journal_groups.py`)."
    )


class JournalFacet(ApiModel):
    value: str
    count: int


class JournalPage(ApiModel):
    entries: list[JournalEntry] = Field(description="La plus récente d'abord.")
    total: int = Field(description="Nombre d'entrées qui passent tous les filtres (toutes pages).")
    next: str | None = Field(description="Curseur de la page suivante (`before`), null à la dernière.")
    authors: list[JournalFacet] = Field(
        description="Les auteurs de l'infrastructure choisie, par nom ; comptés sans le filtre d'auteur, 0 compris."
    )
    categories: list[JournalFacet] = Field(
        description="Les catégories présentes dans l'infrastructure choisie, ordre fixe ; comptées sans leur filtre."
    )
    infrastructures: list[JournalFacet] = Field(
        description="Toutes les infrastructures qui ont un journal, par nom ; comptées sans leur filtre (0 compris)."
    )
    actions: list[JournalFacet] = Field(
        description="Les trois actions (`created`, `modified`, `deleted`), ordre fixe ; comptées sans leur filtre."
    )
    start_missing: bool = Field(
        default=False,
        description="`start` demandé mais aucune entrée de cette révision (purgée, ou filtrée) : la page commence à la "
        "plus proche plus ancienne.",
    )
    unreadable: int = Field(description="Lignes sautées (illisibles, ou d'un dossier dont le nom ne se lit pas).")


class JournalScopeError(ValueError):
    """`object` ou `start` sans `infrastructure` : une identité `g…`, une révision ne sont uniques que dans la leur."""


class JournalCursorError(ValueError):
    """Un curseur `before` qui n'est pas celui qu'une page a rendu."""


@dataclass(frozen=True)
class JournalQuery:
    infrastructure: str | None = None
    authors: tuple[str, ...] = ()
    categories: tuple[str, ...] = ()
    q: str = ""
    since: datetime | None = None
    until: datetime | None = None
    before: str | None = None
    limit: int = DEFAULT_LIMIT
    actions: tuple[str, ...] = ()
    object: str | None = None  # l'historique d'un objet : hostname ou identité (`g…`, `a…`, `c…`)
    start: int | None = None  # le lien vers une entrée : la page commence à cette révision (ignoré avec `before`)


@dataclass(frozen=True)
class _Line:
    entry: JournalEntry
    # (date, infrastructure, révision, rang dans le fichier) : comparée en dates, jamais en chaînes (`10:00:00.5Z` <
    # `10:00:00Z` en texte) ; le rang départage une trace de purge et l'entrée de même révision (revue de la purge, M3)
    key: tuple[datetime, str, int, int]
    haystack: str = field(repr=False)
    refs: frozenset[str] = field(default=frozenset(), repr=False)  # les objets cités (`journal_index.py`)


@dataclass(frozen=True)
class _Parsed:
    infrastructure: str
    signature: tuple[int, ...]
    lines: tuple[_Line, ...]
    unreadable: int


def texts_of(value: Any) -> Iterator[str]:
    """Toutes les chaînes d'une opération (hostnames, libellés, texte d'une note, cellules), récursivement."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from texts_of(item)
    elif isinstance(value, list):
        for item in value:
            yield from texts_of(item)


def moment_of(value: Any) -> datetime | None:
    """Une date avec fuseau, ramenée en UTC ; None si elle ne se lit pas ou n'a pas de fuseau."""
    try:
        moment = datetime.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None
    return moment.astimezone(UTC) if moment is not None and moment.tzinfo is not None else None


def valid_line(raw: Any) -> bool:
    return (
        isinstance(raw, dict)
        and moment_of(raw.get("at")) is not None
        and isinstance(raw.get("author"), str)
        and type(raw.get("revision")) is int
        and isinstance(raw.get("ops"), list)
        and all(isinstance(op, dict) and isinstance(op.get("op"), str) for op in raw["ops"])
    )


def is_trace(raw: Any) -> bool:
    """La ligne de trace d'une purge (`journal_prune.py`) : ni sujet, ni état, jamais purgée."""
    return valid_line(raw) and any(op["op"] == PRUNE_OP for op in raw["ops"])


def created_ids(raw: dict[str, Any]) -> list[str]:
    """Les identités qu'une requête a attribuées (`g<révision>-<n>`, `a…`, `c…`), dans l'ordre des créations."""
    counts: Counter[str] = Counter()
    out = []
    for op in raw["ops"]:
        prefix = _CREATED.get(op["op"])
        if prefix:
            counts[prefix] += 1
            out.append(f"{prefix}{raw['revision']}-{counts[prefix]}")
    return out


def _referenced(op: dict[str, Any]) -> Iterator[str]:
    """Les groupes et annotations qu'une opération cite par son ancrage ou ses bouts, pour les nommer dans la page."""
    for key in ("anchor", "start", "end"):
        target = op.get(key)
        if (
            isinstance(target, dict)
            and target.get("kind") in ("group", "annotation")
            and isinstance(target.get("ref"), str)
            and target["ref"][:1] in _SUBJECT_KIND
        ):
            yield target["ref"]


def _entry(infrastructure: str, raw: dict[str, Any], replay: NameReplay, rank: int = 0) -> _Line:
    """Une ligne lue ; `replay` rejoue le journal jusqu'ici et est mis à jour par cette ligne ; `rank` = son rang dans
    le fichier."""
    ops: list[dict[str, Any]] = raw["ops"]
    counts: Counter[str] = Counter()
    created: list[str] = []
    cited: list[str] = []
    for op in ops:
        name = op["op"]
        if name in _CREATED:
            prefix = _CREATED[name]
            counts[prefix] += 1
            subject = f"{prefix}{raw['revision']}-{counts[prefix]}"
            created.append(subject)
        elif isinstance(op.get("id"), str) and op["id"][:1] in _SUBJECT_KIND:
            subject = op["id"]
        else:
            continue
        replay.note(subject, op)
        if subject not in cited:
            cited.append(subject)
    for op in ops:  # les sujets que l'opération désigne sans les modifier : un ancrage, un bout de connecteur
        for ref in _referenced(op):
            if ref not in cited:
                cited.append(ref)
    subjects = [
        JournalSubject(id=s, kind=_SUBJECT_KIND[s[0]], label=replay.label(s), form=replay.forms.get(s, ""))  # type: ignore[arg-type]
        for s in cited
    ]
    entry = JournalEntry(
        infrastructure=infrastructure,
        revision=raw["revision"],
        at=raw["at"],
        author=raw["author"],
        categories=categories_of(ops),
        actions=actions_of(ops),
        created=created,
        subjects=subjects,
        ops=ops,
    )
    # l'infrastructure n'est pas dans le texte cherché : elle a sa facette, et « core » trouvait tout
    # `test-single-core` ; une trace de purge ne se trouve que par son auteur et son mot (pas par son archive)
    trace = is_trace(raw)
    # les mots de la page aussi (« supprimé », « rouge », « forme sans titre ») : la recherche trouve ce qui s'affiche
    named = [s.label or replay.unnamed(s.id) for s in subjects]
    kinds = [KIND_WORDS[s.form] for s in subjects if s.form in KIND_WORDS]
    shown = [word for op in ops for word in op_words(op)] + (list(MANY_WORDS) if len(ops) > 1 else [])
    words = [raw["author"], *shown] if trace else [raw["author"], *created, *named, *kinds, *shown, *texts_of(ops)]
    key = (moment_of(raw["at"]), infrastructure, raw["revision"], rank)
    refs = refs_of(ops, created)
    return _Line(entry=entry, key=key, haystack=fold("\n".join(words)), refs=refs)  # type: ignore[arg-type]


def _deltas(raws: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Les deltas de toutes les traces de purge, dans l'ordre où les purges les ont calculés : une purge pose sa trace
    en tête du fichier, la plus récente en premier ; la plus ancienne s'applique donc d'abord."""
    traces = [raw for raw in raws if is_trace(raw)]
    out: list[dict[str, Any]] = []
    for raw in reversed(traces):
        seed = raw.get("seed")
        out.extend(
            d
            for d in (seed if isinstance(seed, list) else [])
            if isinstance(d, dict) and type(d.get("at_revision")) is int
        )
    return sorted(out, key=lambda d: d["at_revision"])  # tri stable : à révision égale, l'ordre des purges


class Replayer:
    """Le rejeu d'un journal comme le lecteur le fait : avant chaque entrée (jamais avant une trace), les deltas des
    purges qui la visent ; puis l'entrée elle-même. Partagé avec la purge, qui rejoue côte à côte le journal d'origine
    et le journal purgé pour calculer ses deltas."""

    def __init__(self, infrastructure: str, deltas: list[dict[str, Any]]) -> None:
        self.infrastructure = infrastructure
        self.replay = NameReplay()
        self._pending = list(deltas)

    def prepare(self, raw: dict[str, Any]) -> None:
        if is_trace(raw):
            return
        while self._pending and self._pending[0]["at_revision"] <= raw["revision"]:
            self.replay.apply(self._pending.pop(0))

    def apply(self, delta: dict[str, Any]) -> None:
        self.replay.apply(delta)

    def line(self, raw: dict[str, Any], rank: int, prepared: bool = False) -> _Line:
        if not prepared:
            self.prepare(raw)
        return _entry(self.infrastructure, raw, self.replay, rank)


def _parse(path: Path, infrastructure: str, signature: tuple[int, ...]) -> _Parsed:
    text = path.read_text(encoding="utf-8", errors="replace")
    complete = text if text.endswith("\n") else text.rsplit("\n", 1)[0] if "\n" in text else ""
    raws: list[tuple[int, dict[str, Any]]] = []
    unreadable = 0
    # `split("\n")`, jamais `splitlines()` : U+2028, U+2029, U+0085 sont du texte dans une ligne JSON
    # (`ensure_ascii=False` ne les échappe pas), pas des fins de ligne (revue de la purge, H1)
    for rank, row in enumerate(complete.split("\n")):
        if not row.strip():
            continue
        try:
            raw = json.loads(row)
        except json.JSONDecodeError:
            unreadable += 1
            continue
        if not valid_line(raw):
            unreadable += 1
            continue
        raws.append((rank, raw))
    replayer = Replayer(infrastructure, _deltas([raw for _, raw in raws]))
    lines = _grouped([replayer.line(raw, rank) for rank, raw in raws])
    if unreadable:
        log.warning("journal d'intention : %d ligne(s) illisible(s) sautée(s) dans %r", unreadable, str(path))
    return _Parsed(infrastructure=infrastructure, signature=signature, lines=tuple(lines), unreadable=unreadable)


def _grouped(lines: list[_Line]) -> list[_Line]:
    """Les lignes d'un fichier, chacune avec son regroupement, calculé sur le fichier entier (`journal_groups.py`)."""
    items = [
        Item(
            at=line.key[0],
            author=line.entry.author,
            ops=line.entry.ops,
            positions=line.entry.categories == ["positions"] and bool(line.entry.ops),
            revision=line.key[2],
            trace=any(op.get("op") == PRUNE_OP for op in line.entry.ops),
        )
        for line in lines
    ]
    return [
        line if group is None else replace(line, entry=line.entry.model_copy(update={"group": group}))
        for line, group in zip(lines, groups_of(items), strict=True)
    ]


def _encode(key: tuple[datetime, str, int, int]) -> str:
    raw = json.dumps([key[0].isoformat(), key[1], key[2], key[3]], ensure_ascii=False)
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode(cursor: str) -> tuple[datetime, str, int, int]:
    """Le curseur d'une page ; un curseur à trois éléments (d'avant le rang) se lit au rang -1 : rien de la même
    révision n'est resservi, comme avant."""
    try:
        parts = json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")))
        at, infra, revision, rank = (*parts, -1) if isinstance(parts, list) and len(parts) == 3 else parts
    except (binascii.Error, UnicodeError, ValueError, TypeError) as exc:
        raise JournalCursorError("curseur illisible : reprendre depuis la première page") from exc
    moment = moment_of(at)
    if moment is None or not isinstance(infra, str) or type(revision) is not int or type(rank) is not int:
        raise JournalCursorError("curseur illisible : reprendre depuis la première page")
    return moment, infra, revision, rank


def _trace_op(line: _Line) -> dict[str, Any] | None:
    return next((op for op in line.entry.ops if op.get("op") == PRUNE_OP), None)


def _start(matching: list[_Line], revision: int) -> tuple[tuple[datetime, str, int, int] | None, bool]:
    """La clé où commence la page d'un lien vers la révision `revision` (la plus récente d'abord), et `True` si
    l'entrée de cette révision manque. L'entrée elle-même, jamais la trace de purge qui partage sa révision (revue,
    M1) ; sinon la trace de la purge qui l'a retirée (elle explique la disparition) ; sinon la plus proche plus
    ancienne ; sinon tout le journal (une page vide qui dirait « aucune modification » serait fausse : revue, M2). Une
    révision n'est unique que dans son infrastructure : `start` exige `infrastructure`."""
    exact = next((line for line in matching if line.key[2] == revision and _trace_op(line) is None), None)
    if exact:
        return exact.key, False
    for line in matching:
        op = _trace_op(line)
        first, last = (op or {}).get("first_revision"), (op or {}).get("last_revision")
        if isinstance(first, int) and isinstance(last, int) and first <= revision <= last:
            return line.key, True
    older = next((line for line in matching if line.key[2] < revision and _trace_op(line) is None), None)
    return (older.key if older else None), True


class JournalReader:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self._cache: dict[Path, _Parsed] = {}
        self._names: dict[Path, tuple[tuple[int, int], str | None]] = {}
        self._lock = threading.Lock()

    def _folders(self, wanted: str | None) -> list[tuple[Path, str | None]]:
        """Chaque dossier qui a un journal, avec le nom de son infrastructure : celle demandée pour son dossier ; un nom
        sûr est le nom du dossier lui-même (`_segment(v) == v`) ; un nom haché (`_…`) se lit dans `intent.json`, None
        s'il ne se lit pas (document isolé par `IntentCorruptError`, par exemple)."""
        base = self.root / INTENT_DIR
        if not base.is_dir():
            return []
        named = self.root / INTENT_DIR / _segment(wanted) if wanted else None
        out = []
        for folder in sorted(p for p in base.iterdir() if (p / JOURNAL_FILE).is_file()):
            safe = None if folder.name.startswith("_") else folder.name
            out.append((folder, wanted if folder == named else safe or self._name(folder)))
        return out

    def _name(self, folder: Path) -> str | None:
        path = folder / INTENT_FILE
        try:
            stat = path.stat()
        except OSError:
            return None
        signature = (stat.st_mtime_ns, stat.st_size)
        with self._lock:
            known = self._names.get(folder)
        if known and known[0] == signature:
            return known[1]
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            name = data.get("infrastructure") if isinstance(data, dict) else None
        except OSError, ValueError:
            name = None
        name = name if isinstance(name, str) and name else None
        with self._lock:
            self._names[folder] = (signature, name)
        return name

    def _lines(self, folder: Path, infrastructure: str) -> _Parsed:
        path = folder / JOURNAL_FILE
        stat = path.stat()
        # l'inode compte : une purge remplace le fichier, parfois à taille égale dans la même granularité de date (B7)
        signature = (stat.st_ino, stat.st_mtime_ns, stat.st_size)
        with self._lock:
            cached = self._cache.get(path)
        if cached and cached.signature == signature and cached.infrastructure == infrastructure:
            return cached
        parsed = _parse(path, infrastructure, signature)
        with self._lock:
            self._cache[path] = parsed
        return parsed

    def _all(self, wanted: str | None) -> tuple[list[_Line], int]:
        lines: list[_Line] = []
        unreadable = 0
        for folder, name in self._folders(wanted):
            if (
                name is None
            ):  # ses lignes ne s'attribuent à aucune infrastructure : illisibles dans « toutes » seulement
                if wanted is None:
                    nameless = self._lines(folder, "")
                    unreadable += len(nameless.lines) + nameless.unreadable
                continue
            parsed = self._lines(folder, name)
            lines.extend(parsed.lines)
            unreadable += parsed.unreadable if (wanted is None or name == wanted) else 0
        return lines, unreadable

    def page(self, query: JournalQuery) -> JournalPage:
        if query.infrastructure is None and (query.object is not None or query.start is not None):
            raise JournalScopeError("object et start demandent une infrastructure")  # revue, M3 : jamais mêlés
        cursor = _decode(query.before) if query.before else None
        lines, unreadable = self._all(query.infrastructure)
        since = query.since.astimezone(UTC) if query.since else None
        until = query.until.astimezone(UTC) if query.until else None
        words = fold(query.q).split()

        def keep(line: _Line, skip: str) -> bool:
            e = line.entry
            return (
                (skip == "infrastructure" or query.infrastructure is None or e.infrastructure == query.infrastructure)
                and (skip == "author" or not query.authors or e.author in query.authors)
                and (skip == "category" or not query.categories or any(c in query.categories for c in e.categories))
                and (skip == "action" or not query.actions or any(a in query.actions for a in e.actions))
                and (query.object is None or query.object in line.refs)
                and (since is None or line.key[0] >= since)
                and (until is None or line.key[0] < until)
                and all(word in line.haystack for word in words)
            )

        matching = sorted((line for line in lines if keep(line, "")), key=lambda line: line.key, reverse=True)
        start, missing = (None, False) if cursor is not None or query.start is None else _start(matching, query.start)
        after = [
            line for line in matching if (cursor is None or line.key < cursor) and (start is None or line.key <= start)
        ]
        limit = max(1, min(query.limit, MAX_LIMIT))
        served = after[:limit]
        authors = Counter(line.entry.author for line in lines if keep(line, "author"))
        cats = Counter(c for line in lines if keep(line, "category") for c in line.entry.categories)
        infras = Counter(line.entry.infrastructure for line in lines if keep(line, "infrastructure"))
        acts = Counter(a for line in lines if keep(line, "action") for a in line.entry.actions)
        # l'univers des facettes ne dépend d'aucun filtre (sauf l'infrastructure, pour auteurs et catégories) : une
        # valeur ne disparaît ni ne change de place quand on filtre, son compte passe à 0
        scoped = [
            line for line in lines if query.infrastructure is None or line.entry.infrastructure == query.infrastructure
        ]
        every_author = sorted({line.entry.author for line in scoped}, key=lambda a: (a.casefold(), a))
        every_cat = {c for line in scoped for c in line.entry.categories}
        every_infra = sorted({line.entry.infrastructure for line in lines})
        return JournalPage(
            entries=[line.entry for line in served],
            total=len(matching),
            next=_encode(served[-1].key) if len(after) > limit else None,
            authors=[JournalFacet(value=a, count=authors[a]) for a in every_author],
            categories=[JournalFacet(value=c, count=cats[c]) for c in CATEGORIES if c in every_cat],
            infrastructures=[JournalFacet(value=i, count=infras[i]) for i in every_infra],
            actions=[JournalFacet(value=a, count=acts[a]) for a in ACTIONS],
            unreadable=unreadable,
            start_missing=missing,
        )
