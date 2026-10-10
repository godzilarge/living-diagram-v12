"""Le store de la couche d'intention (B4, `docs/08`) : un document `Intent` par infrastructure, écrit par opérations.

Sur disque en V1, à côté de l'archive (`<archive>/_intent/<infra>/`), derrière une interface que Mongo pourra
remplacer comme `BundleArchive`. Règles :
- lire ne crée rien : une infrastructure jamais écrite se lit comme le document vide (`revision` 0) ;
- écrire = lire, appliquer les opérations dans l'ordre, écrire le document entier **atomiquement** (temporaire,
  `fsync`, renommage), sous un **verrou de fichier** par infrastructure : deux requêtes simultanées s'appliquent l'une
  après l'autre, aucune n'est perdue ; dernier écrivain gagne **par épingle**, jamais par document ;
- chaque requête acceptée incrémente `revision` et laisse une ligne dans `journal.jsonl` (qui, quand, quoi) ; les
  couleurs, les groupes, les annotations et les connecteurs (docs/10) suivent les mêmes règles, dernier écrivain gagne
  par type, par équipement, par groupe, par annotation ou par connecteur ; un groupe créé reçoit `g<revision>-<n>`,
  une annotation `a<revision>-<n>`, un connecteur `c<revision>-<n>` ;
- un document illisible ou incohérent (JSON cassé, hors contrat, d'une autre infrastructure) est isolé
  (`IntentCorruptError`), jamais écrasé ;
- le dossier `_intent` ne peut pas entrer en collision avec une infrastructure : un nom sûr ne commence jamais par
  `_`, un nom haché porte un suffixe (`archive._segment`).
"""

import json
import logging
import os
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from ld_contracts.intent import (
    DEFAULT_ANNOTATION_STYLE,
    DEFAULT_CONNECTOR_STYLE,
    DEFAULT_GROUP_STYLE,
    INTENT_VERSION,
    MAX_ANNOTATIONS,
    MAX_CONNECTORS,
    MAX_GROUPS,
    MAX_PINS,
    Annotation,
    AnnotationStyle,
    Connector,
    ConnectorStyle,
    DeviceColor,
    Group,
    GroupStyle,
    Intent,
    Pin,
    TypeColor,
    default_size,
    empty_intent,
    upgraded,
)
from ld_contracts.intent.serialize import canonical_json
from pydantic import ValidationError

from ld_backend.archive import _segment
from ld_backend.files import folder_lock, locked, write_atomically
from ld_backend.schemas import (
    AnnotationCreateOp,
    AnnotationStylePatch,
    AnnotationUpdateOp,
    ConnectorCreateOp,
    ConnectorStylePatch,
    ConnectorUpdateOp,
    GroupAddOp,
    GroupDeleteOp,
    GroupRemoveOp,
    GroupStylePatch,
    GroupUpdateOp,
    IntentOps,
    utc_z,
)

log = logging.getLogger(__name__)

INTENT_DIR = "_intent"
INTENT_FILE = "intent.json"
JOURNAL_FILE = "journal.jsonl"


class IntentCorruptError(Exception):
    """Le document d'intention d'une infrastructure est illisible ou incohérent ; il est isolé, jamais écrasé."""


class IntentLimitError(ValueError):
    """La requête ferait dépasser au document une borne du contrat (10 000 épingles, 1 000 groupes) : refusée, rien
    n'est écrit."""


class IntentGroupError(ValueError):
    """Une opération de groupe ou d'annotation impossible : `id` inconnu (supprimé entre-temps), un groupe qui
    resterait sans membre, une annotation qui changerait de sorte, une image absente du magasin ; refusée, rien n'est
    écrit. `code` nomme la raison, sans valeur (`unknown_group`, `group_without_member`, `unknown_annotation`,
    `annotation_kind_change`, `unknown_asset`, `unknown_connector`)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


AssetCheck = Callable[[str, str], bool]


class AssetInUseError(Exception):
    """Une annotation cite encore l'image : elle ne se retire pas."""


class IntentStore:
    def __init__(self, root: Path, asset_exists: AssetCheck | None = None) -> None:
        self.root = Path(root)
        # Une image ne se cite que si son fichier est dans le magasin de l'infrastructure (`unknown_asset`) ; sans
        # magasin branché (tests du store seul), toute empreinte est admise.
        self._asset_exists = asset_exists

    def _folder(self, infrastructure: str) -> Path:
        return self.root / INTENT_DIR / _segment(infrastructure)

    def load(self, infrastructure: str) -> Intent:
        """Le document de l'infrastructure, ou le document vide si rien n'a jamais été écrit."""
        path = self._folder(infrastructure) / INTENT_FILE
        if not path.exists():
            return empty_intent(infrastructure)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            # Un document écrit avant la mineure 1.1.0 (épingles seules) se relit avec ses listes de couleurs vides ;
            # il est réécrit en 1.1.0 à la prochaine opération (docs/10, décision 7).
            intent = Intent.model_validate(upgraded(data) if isinstance(data, dict) else data)
        except (json.JSONDecodeError, ValidationError) as exc:
            log.warning(
                "document d'intention hors contrat ou illisible, isolé : %r (%s)", str(path), type(exc).__name__
            )
            raise IntentCorruptError(str(path)) from exc
        if intent.infrastructure != infrastructure:
            log.warning("document d'intention d'une autre infrastructure à cet emplacement, isolé : %r", str(path))
            raise IntentCorruptError(str(path))
        return intent

    def apply(self, infrastructure: str, request: IntentOps, now: datetime) -> Intent:
        """Applique les opérations dans l'ordre et écrit le document résultant ; retourne ce document.

        Le journal est ouvert **avant** d'écrire le document : un journal inaccessible refuse la requête sans rien
        changer (revue B4, M1). Reste une fenêtre entre le renommage du document et l'écriture de la ligne (disque
        plein, coupure) : le document serait appliqué sans sa ligne ; la révision manquante dans le journal le dirait.
        """
        folder = self._folder(infrastructure)
        with locked(folder, folder_lock(folder)):
            current = self.load(infrastructure)
            updated = _applied(current, request, now, self._asset_exists)
            line = {
                "at": utc_z(now),
                "author": request.author,
                "revision": updated.revision,
                "ops": [op.model_dump(mode="json") for op in request.ops],
            }
            with (folder / JOURNAL_FILE).open("a", encoding="utf-8") as journal:
                write_atomically(folder / INTENT_FILE, canonical_json(updated))
                journal.write(json.dumps(line, ensure_ascii=False, sort_keys=True) + "\n")
                journal.flush()
                os.fsync(journal.fileno())
        return updated

    def release_asset(self, infrastructure: str, asset: str, remove: Callable[[], None]) -> None:
        """Retire une image que plus aucune annotation ne cite, sous le verrou de `apply` : une annotation qui la cite
        ne peut pas s'écrire entre la vérification et le retrait (audit de l'API, 2026-10-09)."""
        folder = self._folder(infrastructure)
        with locked(folder, folder_lock(folder)):
            intent = self.load(infrastructure)
            if any(a.content.kind == "image" and a.content.asset == asset for a in intent.annotations):
                raise AssetInUseError(asset)
            remove()


def _applied(current: Intent, request: IntentOps, now: datetime, asset_exists: AssetCheck | None = None) -> Intent:
    """Les opérations, dans l'ordre, sur les cinq listes ; dernier écrivain gagne par clé (hostname, type, id)."""
    pins = {pin.hostname: pin for pin in current.pins}
    type_colors = {color.type: color for color in current.type_colors}
    device_colors = {color.hostname: color for color in current.device_colors}
    groups = {group.id: group for group in current.groups}
    annotations: dict[str, Annotation | None] = {a.id: a for a in current.annotations}
    connectors: dict[str, Connector | None] = {c.id: c for c in current.connectors}
    created = 0
    drawn = 0
    linked = 0
    for op in request.ops:
        if op.op.startswith("connector_"):
            if op.op == "connector_create":
                linked += 1
                connector_id = f"c{current.revision + 1}-{linked}"
                connectors[connector_id] = _connector_created(op, connector_id, request.author, now)
            elif op.op == "connector_delete":
                _known_connector(connectors, op.id)
                connectors[op.id] = None
            else:
                connectors[op.id] = _connector_applied(_known_connector(connectors, op.id), op, request.author, now)
        elif op.op.startswith("annotation_"):
            if op.op == "annotation_create":
                drawn += 1
                _check_asset(op, current.infrastructure, asset_exists)
                annotation_id = f"a{current.revision + 1}-{drawn}"
                annotations[annotation_id] = _annotation_created(op, annotation_id, request.author, now)
            elif op.op == "annotation_delete":
                _known_annotation(annotations, op.id)
                annotations[op.id] = None
            else:
                _check_asset(op, current.infrastructure, asset_exists)
                annotations[op.id] = _annotation_applied(_known_annotation(annotations, op.id), op, request.author, now)
        elif op.op == "pin":
            pins[op.hostname] = Pin(hostname=op.hostname, x=op.x, y=op.y, author=request.author, at=now)
        elif op.op == "unpin":
            pins.pop(op.hostname, None)
        elif op.op == "color":
            device_colors[op.hostname] = DeviceColor(hostname=op.hostname, hue=op.hue, author=request.author, at=now)
        elif op.op == "uncolor":
            device_colors.pop(op.hostname, None)
        elif op.op == "color_type":
            type_colors[op.type] = TypeColor(type=op.type, hue=op.hue, author=request.author, at=now)
        elif op.op == "uncolor_type":
            type_colors.pop(op.type, None)
        elif op.op == "group_create":
            created += 1
            group_id = f"g{current.revision + 1}-{created}"
            style = GroupStyle.model_validate({**DEFAULT_GROUP_STYLE, **_style_patch(op.style)})
            groups[group_id] = Group(
                id=group_id,
                label=op.label,
                description=op.description,
                members=tuple(sorted(set(op.members))),
                style=style,
                author=request.author,
                at=now,
            )
        else:
            groups[op.id] = _group_applied(_known(groups, op.id), op, request.author, now)
    if len(pins) > MAX_PINS:
        raise IntentLimitError(f"plus de {MAX_PINS} épingles pour une infrastructure")
    if len(device_colors) > MAX_PINS:
        raise IntentLimitError(f"plus de {MAX_PINS} couleurs d'équipement pour une infrastructure")
    if len(groups) > MAX_GROUPS:
        raise IntentLimitError(f"plus de {MAX_GROUPS} groupes pour une infrastructure")
    kept = {aid: a for aid, a in annotations.items() if a is not None}
    if len(kept) > MAX_ANNOTATIONS:
        raise IntentLimitError(f"plus de {MAX_ANNOTATIONS} annotations pour une infrastructure")
    lines = {cid: c for cid, c in connectors.items() if c is not None}
    if len(lines) > MAX_CONNECTORS:
        raise IntentLimitError(f"plus de {MAX_CONNECTORS} connecteurs pour une infrastructure")
    return Intent(
        intent_version=INTENT_VERSION,
        infrastructure=current.infrastructure,
        revision=current.revision + 1,
        updated_at=now,
        pins=tuple(pins[name] for name in sorted(pins)),
        type_colors=tuple(type_colors[name] for name in sorted(type_colors)),
        device_colors=tuple(device_colors[name] for name in sorted(device_colors)),
        groups=tuple(
            g for _, g in sorted(((gid, g) for gid, g in groups.items() if g is not None), key=lambda item: item[0])
        ),
        annotations=tuple(kept[aid] for aid in sorted(kept)),
        connectors=tuple(lines[cid] for cid in sorted(lines)),
    )


def _style_patch(patch: GroupStylePatch | None) -> dict[str, object]:
    return {} if patch is None else {k: v for k, v in patch.model_dump(mode="json").items() if v is not None}


def _known(groups: dict[str, Group | None], group_id: str) -> Group:
    group = groups.get(group_id)
    if group is None:
        raise IntentGroupError("unknown_group", "groupe inconnu : supprimé entre-temps, rechargez le document")
    return group


def _group_applied(
    group: Group, op: GroupUpdateOp | GroupAddOp | GroupRemoveOp | GroupDeleteOp, author: str, now: datetime
) -> Group | None:
    """Un groupe après `group_update`, `group_add`, `group_remove` (None après `group_delete`)."""
    if op.op == "group_delete":
        return None
    changes: dict[str, object] = {}
    if op.op == "group_update":
        if op.label is not None:
            changes["label"] = op.label
        if op.description is not None:
            changes["description"] = op.description
        if op.members is not None:
            changes["members"] = tuple(sorted(set(op.members)))
        if op.style is not None:
            changes["style"] = GroupStyle.model_validate(
                {**group.style.model_dump(mode="json"), **_style_patch(op.style)}
            )
    elif op.op == "group_add":
        changes["members"] = tuple(sorted(set(group.members) | set(op.members)))
    else:
        remaining = tuple(sorted(set(group.members) - set(op.members)))
        if not remaining:
            raise IntentGroupError("group_without_member", "un groupe garde au moins un membre : supprimez-le plutôt")
        changes["members"] = remaining
    return group.model_copy(update={**changes, "author": author, "at": now})


def _annotation_style(patch: AnnotationStylePatch | None) -> dict[str, object]:
    return {} if patch is None else {k: v for k, v in patch.model_dump(mode="json").items() if v is not None}


def _check_asset(op: AnnotationCreateOp | AnnotationUpdateOp, infrastructure: str, exists: AssetCheck | None) -> None:
    content = op.content
    if content is None or content.kind != "image" or exists is None:
        return
    if not exists(infrastructure, content.asset):
        raise IntentGroupError(
            "unknown_asset", "image inconnue du magasin de cette infrastructure : envoyez-la d'abord"
        )


def _known_annotation(annotations: dict[str, Annotation | None], annotation_id: str) -> Annotation:
    annotation = annotations.get(annotation_id)
    if annotation is None:
        raise IntentGroupError(
            "unknown_annotation", "annotation inconnue : supprimée entre-temps, rechargez le document"
        )
    return annotation


def _annotation_created(op: AnnotationCreateOp, annotation_id: str, author: str, now: datetime) -> Annotation:
    """Une annotation neuve : les défauts de sa sorte pour le style et la taille, ce que la requête dit pour le reste.
    Une incohérence (ligne de rappel sans ancre) est un refus du contrat (`ValidationError`), que l'API traduit."""
    width, height = default_size(op.content)
    style = AnnotationStyle.model_validate({**DEFAULT_ANNOTATION_STYLE[op.content.kind], **_annotation_style(op.style)})
    return Annotation(
        id=annotation_id,
        anchor=op.anchor,
        x=op.x,
        y=op.y,
        w=op.w if op.w is not None else width,
        h=op.h if op.h is not None else height,
        z=op.z,
        locked=op.locked,
        leader=op.leader,
        content=op.content,
        style=style,
        author=author,
        at=now,
    )


def _annotation_applied(annotation: Annotation, op: AnnotationUpdateOp, author: str, now: datetime) -> Annotation:
    """Une annotation après `annotation_update` : patchs partiels, contenu remplacé en entier et de la même sorte."""
    changes: dict[str, object] = {}
    if op.content is not None:
        if op.content.kind != annotation.content.kind:
            raise IntentGroupError("annotation_kind_change", "une annotation garde sa sorte : créez-en une autre")
        changes["content"] = op.content
    for name in ("anchor", "x", "y", "w", "h", "z", "locked", "leader"):
        value = getattr(op, name)
        if value is not None:
            changes[name] = value
    if op.style is not None:
        changes["style"] = AnnotationStyle.model_validate(
            {**annotation.style.model_dump(mode="json"), **_annotation_style(op.style)}
        )
    return Annotation.model_validate(
        {**annotation.model_dump(mode="json"), **_dumped(changes), "author": author, "at": now}
    )


def _connector_style(patch: ConnectorStylePatch | None) -> dict[str, object]:
    return {} if patch is None else {k: v for k, v in patch.model_dump(mode="json").items() if v is not None}


def _known_connector(connectors: dict[str, Connector | None], connector_id: str) -> Connector:
    connector = connectors.get(connector_id)
    if connector is None:
        raise IntentGroupError("unknown_connector", "connecteur inconnu : supprimé entre-temps, rechargez le document")
    return connector


def _connector_created(op: ConnectorCreateOp, connector_id: str, author: str, now: datetime) -> Connector:
    """Un connecteur neuf : les défauts pour le style, ce que la requête dit pour le reste ; deux bouts sur le même
    élément sont un refus du contrat (`ValidationError`), que l'API traduit."""
    style = ConnectorStyle.model_validate({**DEFAULT_CONNECTOR_STYLE, **_connector_style(op.style)})
    return Connector(
        id=connector_id,
        start=op.start,
        end=op.end,
        heads=op.heads,
        route=op.route,
        bend=op.bend,
        label=op.label,
        z=op.z,
        locked=op.locked,
        style=style,
        author=author,
        at=now,
    )


def _connector_applied(connector: Connector, op: ConnectorUpdateOp, author: str, now: datetime) -> Connector:
    """Un connecteur après `connector_update` : patchs partiels, un bout remplacé en entier."""
    changes: dict[str, object] = {}
    for name in ("start", "end", "heads", "route", "bend", "label", "z", "locked"):
        value = getattr(op, name)
        if value is not None:
            changes[name] = value
    if op.style is not None:
        changes["style"] = ConnectorStyle.model_validate(
            {**connector.style.model_dump(mode="json"), **_connector_style(op.style)}
        )
    return Connector.model_validate(
        {**connector.model_dump(mode="json"), **_dumped(changes), "author": author, "at": now}
    )


def _dumped(changes: dict[str, object]) -> dict[str, object]:
    """Les valeurs d'un patch en JSON : un modèle du contrat se revalide avec le reste (ligne de rappel sans ancre,
    par exemple), un entier ou un booléen passe tel quel."""
    out: dict[str, object] = {}
    for name, value in changes.items():
        out[name] = value.model_dump(mode="json") if hasattr(value, "model_dump") else value
    return out
