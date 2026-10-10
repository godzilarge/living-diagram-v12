"""Le rejeu des noms du journal (sorti de `journal.py` le 2026-10-10, sur sa couture) : ligne après ligne, le nom de
chaque sujet (groupe, annotation, connecteur), la sorte de chaque annotation, l'étiquette et les deux bouts de chaque
connecteur ; un sujet sans nom se dit par sa sorte. Lu par le lecteur (`journal.py`, `Replayer`) et par la purge
(`journal_prune.py`, deltas de noms)."""

from dataclasses import dataclass, field
from typing import Any

LABEL_MAX = 60
_UNNAMED = {"note": "note vide", "shape": "forme sans titre", "table": "tableau vide", "image": "image sans titre"}


def _short(text: str) -> str:
    line = text.strip().split("\n", 1)[0].strip()
    return line if len(line) <= LABEL_MAX else line[: LABEL_MAX - 1] + "…"


def _annotation_label(content: Any) -> str:
    """Le nom d'une annotation : la première ligne d'une note, l'étiquette d'une forme, les premières cellules d'un
    tableau (son en-tête, le plus souvent), le texte alternatif d'une image ; vide s'il n'y a rien à dire."""
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
    return ""


@dataclass
class NameReplay:
    """Le rejeu d'un journal, ligne après ligne : le nom de chaque sujet, la sorte de chaque annotation, l'étiquette et
    les deux bouts de chaque connecteur (un connecteur sans étiquette se nomme par ses bouts)."""

    names: dict[str, str] = field(default_factory=dict)
    forms: dict[str, str] = field(default_factory=dict)
    ends: dict[str, list[str]] = field(default_factory=dict)

    def end_text(self, end: Any) -> str:
        if not isinstance(end, dict) or end.get("kind") == "free" or not isinstance(end.get("ref"), str):
            return "point libre"
        ref = end["ref"]
        if end.get("kind") not in ("group", "annotation"):
            return ref
        return self.names.get(ref) or self.unnamed(ref)

    def unnamed(self, subject: str) -> str:
        """Un sujet sans nom, dit par sa sorte (revue Impeccable du 2026-10-10 : « a848-1 » ne parlait à personne)."""
        if subject[:1] == "g":
            return "groupe sans nom"
        if subject[:1] == "c":
            return "connecteur sans nom"
        return _UNNAMED.get(self.forms.get(subject, ""), "annotation sans titre")

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
            ends = self.ends.setdefault(subject, ["point libre", "point libre"])
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
                elif (
                    key == "ends"
                    and isinstance(value, list)
                    and len(value) == 2
                    and all(isinstance(e, str) for e in value)
                ):
                    target[subject] = list(value)
                elif key != "ends" and isinstance(value, str):
                    target[subject] = value

    def state(self) -> dict[str, dict[str, Any]]:
        return {
            "names": dict(self.names),
            "forms": dict(self.forms),
            "ends": {k: list(v) for k, v in self.ends.items()},
        }

    def label(self, subject: str) -> str:
        name = self.names.get(subject, "")
        if name or subject[0] != "c" or subject not in self.ends:
            return name
        return _short(" → ".join(self.ends[subject]))
