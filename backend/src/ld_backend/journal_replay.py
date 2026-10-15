"""Le rejeu des noms du journal (sorti de `journal.py` le 2026-10-10, sur sa couture) : ligne après ligne, le nom de
chaque sujet (groupe, annotation, connecteur), la sorte de chaque annotation, l'étiquette et les deux bouts de chaque
connecteur ; un sujet sans nom se dit par sa sorte. Lu par le lecteur (`journal.py`, `Replayer`) et par la purge
(`journal_prune.py`, deltas de noms)."""

from dataclasses import dataclass, field
from typing import Any

LABEL_MAX = 60
# Un objet sans nom se dit par sa sorte : le serveur le marque (`{"unnamed": sorte}`), la page le dit dans sa langue,
# jamais en comparant un texte (revue de l'interface bilingue, B3 : un groupe nommé « point libre » par un utilisateur
# devenait « free point »). Les mots français ne servent plus qu'à `label`, le nom lisible gardé pour la recherche.
UNNAMED_TEXT = {
    "free": "point libre",
    "group": "groupe sans nom",
    "connector": "connecteur sans nom",
    "note": "note vide",
    "shape": "forme sans titre",
    "table": "tableau vide",
    "image": "image sans titre",
    "code": "bloc de code sans titre",
    "annotation": "annotation sans titre",
}
_LEGACY = {text: kind for kind, text in UNNAMED_TEXT.items()}  # bouts écrits en mots par une purge d'avant le marqueur
End = str | dict[str, str]
FREE: dict[str, str] = {"unnamed": "free"}


def end_words(end: End) -> str:
    """Le texte d'un bout : son nom, ou les mots français de sa sorte."""
    return UNNAMED_TEXT.get(end.get("unnamed", ""), "") if isinstance(end, dict) else end


def _end_of(value: Any) -> End | None:
    """Un bout lu dans un delta : marqué, ou en mots (purge d'avant le marqueur : seule source de ces huit textes)."""
    if isinstance(value, dict) and value.get("unnamed") in UNNAMED_TEXT:
        return {"unnamed": value["unnamed"]}
    if isinstance(value, str):
        return {"unnamed": _LEGACY[value]} if value in _LEGACY else value
    return None


def _short(text: str) -> str:
    line = text.strip().split("\n", 1)[0].strip()
    return line if len(line) <= LABEL_MAX else line[: LABEL_MAX - 1] + "…"


def _annotation_label(content: Any) -> str:
    """Le nom d'une annotation : la première ligne d'une note, l'étiquette d'une forme, les premières cellules d'un
    tableau (son en-tête, le plus souvent), le texte alternatif d'une image, le titre d'un bloc de code (jamais son
    texte : il peut porter une valeur sensible) ; vide s'il n'y a rien à dire."""
    if not isinstance(content, dict):
        return ""
    kind = content.get("kind")
    if kind == "note":
        return _short(str(content.get("text", "")))
    if kind == "shape":
        return _short(str(content.get("label", "") or ""))
    if kind == "table":
        rows = content.get("rows") if isinstance(content.get("rows"), list) else []
        first = rows[0] if rows and isinstance(rows[0], list) else []
        cells = [str(c).strip() for c in first if isinstance(c, str) and c.strip()][:2]
        if cells:
            return _short(" · ".join(cells))
        cols = max((len(r) for r in rows if isinstance(r, list)), default=0)
        return f"{len(rows)} × {cols}"
    if kind == "image":
        return _short(str(content.get("alt", "") or ""))
    if kind == "code":
        return _short(str(content.get("title", "") or ""))
    return ""


@dataclass
class NameReplay:
    """Le rejeu d'un journal, ligne après ligne : le nom de chaque sujet, la sorte de chaque annotation, l'étiquette et
    les deux bouts de chaque connecteur (un connecteur sans étiquette se nomme par ses bouts)."""

    names: dict[str, str] = field(default_factory=dict)
    forms: dict[str, str] = field(default_factory=dict)
    ends: dict[str, list[End]] = field(default_factory=dict)

    def end_text(self, end: Any) -> End:
        if not isinstance(end, dict) or end.get("kind") == "free" or not isinstance(end.get("ref"), str):
            return dict(FREE)
        ref = end["ref"]
        if end.get("kind") not in ("group", "annotation"):
            return ref
        return self.names.get(ref) or {"unnamed": self.unnamed_kind(ref)}

    def unnamed_kind(self, subject: str) -> str:
        """La sorte d'un sujet sans nom (revue Impeccable du 2026-10-10 : « a848-1 » ne parlait à personne)."""
        if subject[:1] == "g":
            return "group"
        if subject[:1] == "c":
            return "connector"
        form = self.forms.get(subject, "")
        return form if form in ("note", "shape", "table", "image", "code") else "annotation"

    def unnamed(self, subject: str) -> str:
        """Un sujet sans nom, en mots français (le nom lisible gardé pour la recherche)."""
        return UNNAMED_TEXT[self.unnamed_kind(subject)]

    def note(self, subject: str, op: dict[str, Any]) -> None:
        """Ce que l'opération dit de son sujet (le journal écrit aussi les clés nulles : `None` ne dit rien)."""
        kind = subject[0]
        if kind == "g" and isinstance(op.get("label"), str):
            self.names[subject] = _short(op["label"])
        elif kind == "a" and isinstance(op.get("content"), dict):
            self.names[subject] = _annotation_label(op["content"])
            if isinstance(op["content"].get("kind"), str):
                self.forms[subject] = op["content"]["kind"]
        elif kind == "c":
            legacy = "a" + subject[1:]
            if subject not in self.names and subject not in self.ends and legacy in self.names:
                self.names[subject] = self.names[legacy]  # un connecteur relu d'un 1.3.x : une ligne ou flèche `a…`
            if isinstance(op.get("label"), str):
                self.names[subject] = _short(op["label"])
            ends = self.ends.setdefault(subject, [dict(FREE), dict(FREE)])
            for side, key in ((0, "start"), (1, "end")):
                if op.get(key) is not None:
                    ends[side] = self.end_text(op[key])

    def apply(self, delta: dict[str, Any]) -> None:
        """Un delta de purge (`journal_prune.py`) : ce que le rejeu complet savait à cet endroit et que le journal purgé
        ne sait plus ; une valeur nulle retire."""
        for key, target in (("names", self.names), ("forms", self.forms), ("ends", self.ends)):
            values = delta.get(key)
            if not isinstance(values, dict):
                continue
            for subject, value in values.items():
                if value is None:
                    target.pop(subject, None)
                elif key == "ends" and isinstance(value, list) and len(value) == 2:
                    ends = [_end_of(e) for e in value]
                    if all(e is not None for e in ends):
                        target[subject] = ends
                elif key != "ends" and isinstance(value, str):
                    target[subject] = value

    def state(self) -> dict[str, dict[str, Any]]:
        return {
            "names": dict(self.names),
            "forms": dict(self.forms),
            "ends": {k: [dict(e) if isinstance(e, dict) else e for e in v] for k, v in self.ends.items()},
        }

    def label(self, subject: str) -> str:
        name = self.names.get(subject, "")
        if name or subject[0] != "c" or subject not in self.ends:
            return name
        return _short(" → ".join(end_words(e) for e in self.ends[subject]))

    def parts(self, subject: str) -> list[dict[str, str]]:
        """Le nom d'un connecteur sans étiquette, bout par bout : `{"text": nom}` ou `{"unnamed": sorte}`."""
        if self.names.get(subject, "") or subject[0] != "c" or subject not in self.ends:
            return []
        return [{"unnamed": e["unnamed"]} if isinstance(e, dict) else {"text": e} for e in self.ends[subject]]
