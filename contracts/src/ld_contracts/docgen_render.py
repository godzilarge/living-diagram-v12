"""Rendu Markdown d'un JSON Schema Pydantic : tables de champs, documents, énumérations. Commun aux deux parties."""

from typing import Any


def ref_name(ref: str) -> str:
    return ref.rsplit("/", 1)[-1]


def render_type(prop: dict[str, Any], defs: dict[str, Any]) -> str:
    if "$ref" in prop:
        name = ref_name(prop["$ref"])
        if not defs.get(name):
            return "valeur JSON"  # `JsonValue` : définition vide dans le schéma, toute valeur JSON
        return f"[{name}](#{name.lower()})"
    for union in ("anyOf", "oneOf"):
        if union in prop:
            return " \\| ".join(render_type(p, defs) for p in prop[union])
    if "enum" in prop:
        return " \\| ".join(f"`{v}`" for v in prop["enum"])
    if "const" in prop:
        return f"`{prop['const']}`"
    return _render_plain(prop, defs)


def _render_plain(prop: dict[str, Any], defs: dict[str, Any]) -> str:
    kind = prop.get("type")
    if kind == "array":
        bounds = _array_bounds(prop)
        return f"liste de {render_type(prop.get('items', {}), defs)}{bounds}"
    if kind == "object":
        extra = prop.get("additionalProperties")
        inner = render_type(extra, defs) if isinstance(extra, dict) else "libre"
        return f"objet clé → {inner}"
    if kind == "string":
        return _render_string(prop)
    if kind == "integer":
        bounds = [
            f"≥ {prop['minimum']}" if "minimum" in prop else "",
            f"≤ {prop['maximum']}" if "maximum" in prop else "",
        ]
        suffix = " ".join(b for b in bounds if b)
        return f"entier{' ' + suffix if suffix else ''}"
    if kind == "boolean":
        return "booléen"
    if kind == "null":
        return "null"
    return kind or "?"


def _array_bounds(prop: dict[str, Any]) -> str:
    low, high = prop.get("minItems"), prop.get("maxItems")
    if low is not None and low == high:
        return f" (exactement {low})"
    if low:
        return f" (au moins {low})"
    return ""


def _render_string(prop: dict[str, Any]) -> str:
    if prop.get("format") == "date-time":
        return "date-time ISO 8601 avec fuseau"
    if "pattern" in prop:
        return f"texte, motif `{prop['pattern']}`"
    if prop.get("minLength"):
        return "texte non vide"
    return "texte"


def required_label(name: str, prop: dict[str, Any], required: set[str]) -> str:
    if name in required:
        return "oui"
    return "non (null si absente)" if prop.get("default", ...) is None else "non (défaut)"


def fields_table(model: dict[str, Any], defs: dict[str, Any]) -> list[str]:
    required = set(model.get("required", []))
    lines = ["| Champ | Type | Requis | Signification |", "|---|---|---|---|"]
    for name, prop in model["properties"].items():
        desc = (prop.get("description") or "").replace("\n", " ")
        lines.append(f"| `{name}` | {render_type(prop, defs)} | {required_label(name, prop, required)} | {desc} |")
    return lines


def model_names_in_order(schema: dict[str, Any]) -> list[str]:
    """Modèles référencés, dans l'ordre d'apparition depuis la racine (parcours en profondeur)."""
    defs = schema["$defs"]
    seen: list[str] = []

    def visit(prop: dict[str, Any]) -> None:
        if "$ref" in prop:
            name = ref_name(prop["$ref"])
            if name not in seen and "properties" in defs[name]:
                seen.append(name)
                for child in defs[name]["properties"].values():
                    visit(child)
        for key in ("items", "additionalProperties"):
            if isinstance(prop.get(key), dict):
                visit(prop[key])
        for union in ("anyOf", "oneOf"):
            for alt in prop.get(union, []):
                visit(alt)

    for prop in schema["properties"].values():
        visit(prop)
    return seen


def reference_names(schema: dict[str, Any]) -> frozenset[str]:
    """Noms des documents et énumérations qu'un rendu de `schema` définit."""
    enums = {name for name, model in schema["$defs"].items() if "enum" in model}
    return frozenset(model_names_in_order(schema)) | frozenset(enums)


def _shared_line(names: list[str]) -> list[str]:
    links = ", ".join(f"[{name}](#{name.lower()})" for name in names)
    return [f"Types partagés avec le RunBundle, définis en partie A : {links}.", ""]


def render_reference(schema: dict[str, Any], level: int, shared: frozenset[str] = frozenset()) -> list[str]:
    """Sections « Le document », « Documents » et « Énumérations » d'un contrat, titres au niveau `level`.

    Les noms dans `shared` sont déjà définis par une autre partie : une ligne de renvoi, pas une seconde table.
    """
    h, sub = "#" * level, "#" * (level + 1)
    defs = schema["$defs"]
    out = [
        f"{h} Le document {schema['title']}",
        "",
        (schema.get("description") or "").strip(),
        "",
        *fields_table(schema, defs),
        "",
        f"{h} Documents",
        "",
    ]
    shared_models = [name for name in model_names_in_order(schema) if name in shared]
    for name in model_names_in_order(schema):
        if name in shared:
            continue
        model = defs[name]
        out += [f"{sub} {name}", "", (model.get("description") or "").strip(), "", *fields_table(model, defs), ""]
    out += _shared_line(shared_models) if shared_models else []
    out += [f"{h} Énumérations", ""]
    enums = [name for name, model in defs.items() if "enum" in model]
    for name in enums:
        if name not in shared:
            values = " \\| ".join(f"`{v}`" for v in defs[name]["enum"])
            out += [f"{sub} {name}", "", values, ""]
    shared_enums = [name for name in enums if name in shared]
    out += _shared_line(shared_enums) if shared_enums else []
    return out
