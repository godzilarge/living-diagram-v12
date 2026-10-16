"""Extract the shared demo-dc dataset for the direction mockups (bac-a-sable/directions/data/demo-dc.json).

Reads the archived snapshots of the two latest runs (by collection start) and the memorized placement, and writes a
compact JSON every mockup draws from: the same devices at the same places, the same cables, the same selected
device with its interfaces, the same diff. Synthetic data from the generator; nothing real.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ARCHIVE = ROOT / "backend" / "archive"
OUT = Path(__file__).resolve().parents[1] / "data" / "demo-dc.json"
SELECTED = "dc01-core-01"


def runs() -> list[tuple[str, dict]]:
    found = []
    for d in (ARCHIVE / "demo-dc").iterdir():
        if (d / "meta.json").exists():
            meta = json.loads((d / "meta.json").read_text())
            found.append((d.name, meta))
    found.sort(key=lambda t: t[1]["run_start"])
    return found


def snapshot(run_id: str) -> dict:
    return json.loads((ARCHIVE / "demo-dc" / run_id / "snapshot.json").read_text())


def link_key(link: dict) -> tuple:
    ends = sorted([(link["a"]["hostname"], link["a"]["interface"]), (link["b"]["hostname"], link["b"]["interface"])])
    return tuple(ends)


def main() -> None:
    all_runs = runs()
    (prev_id, prev_meta), (cur_id, cur_meta) = all_runs[-2], all_runs[-1]
    cur, prev = snapshot(cur_id), snapshot(prev_id)
    places = {p["hostname"]: (p["x"], p["y"]) for p in json.loads((ARCHIVE / "_placement" / "demo-dc" / "placement.json").read_text())["places"]}

    ha_role = {}
    ha_clusters = []
    for c in cur["ha_clusters"]:
        ha_clusters.append({"name": c["cluster_name"], "mode": c["mode"], "members": [m["hostname"] for m in c["members"]]})
        for m in c["members"]:
            ha_role[m["hostname"]] = {"role": m["role"], "state": m["state"], "cluster": c["cluster_name"]}

    devices = [n for n in cur["nodes"] if n["kind"] in ("device", "external")]
    device_names = {n["hostname"] for n in devices}
    prev_names = {n["hostname"] for n in prev["nodes"] if n["kind"] in ("device", "external")}
    degree: dict[str, int] = {}
    links = []
    for l in cur["links"]:
        a, b = l["a"]["hostname"], l["b"]["hostname"]
        if a not in device_names or b not in device_names:
            continue
        degree[a] = degree.get(a, 0) + 1
        degree[b] = degree.get(b, 0) + 1
        links.append({
            "a": l["a"], "b": l["b"], "status": l["status"], "oper": l["oper"], "speed_mbps": l["speed_mbps"],
            "aggregate_a": l["aggregate_a"], "aggregate_b": l["aggregate_b"],
            "sources": sorted({e["source"] for e in l["evidence"]}),
        })
    prev_links = {link_key(l) for l in prev["links"] if l["a"]["hostname"] in prev_names and l["b"]["hostname"] in prev_names}
    cur_links = {link_key(l) for l in cur["links"] if l["a"]["hostname"] in device_names and l["b"]["hostname"] in device_names}
    for l in links:
        l["diff"] = "added" if link_key(l) not in prev_links else None

    nodes = []
    for n in devices:
        x, y = places.get(n["hostname"], (None, None))
        nodes.append({
            "hostname": n["hostname"], "kind": n["kind"], "type": n["type"], "vendor": n["vendor"], "model": n["model"],
            "os": f"{n['os_name']} {n['os_version']}" if n["os_name"] else None, "site": n["site"],
            "collection": n["collection"], "stack_members": len(n["stack"]["members"]) if n.get("stack") else None,
            "ha": ha_role.get(n["hostname"]), "x": x, "y": y, "cables": degree.get(n["hostname"], 0),
            "diff": "added" if n["hostname"] not in prev_names else None,
        })
    removed_nodes = sorted(prev_names - device_names)
    removed_links = [{"a": {"hostname": k[0][0], "interface": k[0][1]}, "b": {"hostname": k[1][0], "interface": k[1][1]}} for k in sorted(prev_links - cur_links)]

    neighbor = {}
    for l in cur["links"]:
        for me, other in ((l["a"], l["b"]), (l["b"], l["a"])):
            if me["hostname"] == SELECTED:
                neighbor[me["interface"]] = {"hostname": other["hostname"], "interface": other["interface"], "status": l["status"]}
    interfaces = []
    for i in cur["interfaces"]:
        if i["hostname"] != SELECTED or i["type"] not in ("physical", "management"):
            continue
        interfaces.append({
            "name": i["name"], "type": i["type"], "admin": i["admin_status"], "oper": i["oper_status"], "oper_reason": i["oper_reason"],
            "speed_mbps": i["speed_mbps"], "duplex": i["duplex"], "media": i["media"], "description": i["description"],
            "aggregate": i["aggregate"], "mode": i["switchport_mode"], "neighbor": neighbor.get(i["name"]),
        })
    aggregates = [
        {"name": a["name"], "protocol": a["protocol"], "oper": a["oper_status"], "members": [m["name"] for m in a["members"]],
         "mlag_id": a["mlag_id"], "peer_link": a["mlag_peer_link"]}
        for a in cur["aggregates"] if a["hostname"] == SELECTED
    ]
    checks_sel = [c for c in cur["checks"] if any(
        (r.get("hostname") == SELECTED) or (r.get("a", {}).get("hostname") == SELECTED) or (r.get("b", {}).get("hostname") == SELECTED) for r in c["refs"])]
    sev = {"error": 0, "warning": 0, "info": 0}
    for c in cur["checks"]:
        sev[c["severity"]] += 1

    raw = json.loads((OUT.parent / "diff-raw.json").read_text()) if (OUT.parent / "diff-raw.json").exists() else {}
    def ref_host(c):
        return [r.get("hostname") or r.get("a", {}).get("hostname") for r in c["refs"]]
    per_node = {}
    for c in cur["checks"]:
        for r in c["refs"]:
            for h in {r.get("hostname"), r.get("a", {}).get("hostname") if isinstance(r.get("a"), dict) else None, r.get("b", {}).get("hostname") if isinstance(r.get("b"), dict) else None} - {None}:
                per_node.setdefault(h, {"error": 0, "warning": 0, "info": 0})[c["severity"]] += 1
    for n in nodes:
        n["checks"] = per_node.get(n["hostname"], {"error": 0, "warning": 0, "info": 0})
    changed_nodes = [{"hostname": x["ref"]["hostname"], "fields": [f for f in x["fields"] if f["path"] in ("collection", "os_version", "model")]} for x in raw.get("nodes", {}).get("changed", []) if x["ref"]["hostname"] in device_names]
    changed_links = [x["ref"] for x in raw.get("links", {}).get("changed", []) if x["ref"]["a"]["hostname"] in device_names and x["ref"]["b"]["hostname"] in device_names]
    changed_set = {link_key(r) for r in changed_links}
    for l in links:
        if l["diff"] is None and link_key(l) in changed_set:
            l["diff"] = "changed"
    for n in nodes:
        if n["diff"] is None and any(c["hostname"] == n["hostname"] and c["fields"] for c in changed_nodes):
            n["diff"] = "changed"
    diff_block = {
        "summary": raw.get("summary"),
        "changed_devices": [c for c in changed_nodes if c["fields"]],
        "removed_cables": [{"a": x["a"], "b": x["b"], "status": x["status"]} for x in raw.get("links", {}).get("removed", []) if x["a"]["hostname"] in device_names and x["b"]["hostname"] in device_names],
        "added_cables_to_hidden_stubs": sum(1 for x in raw.get("links", {}).get("added", []) if x["b"]["hostname"] not in device_names or x["a"]["hostname"] not in device_names),
        "degraded_aggregates": [{"hostname": x["ref"]["hostname"], "name": x["ref"]["name"]} for x in raw.get("aggregates", {}).get("changed", []) if any(f["path"] == "degraded" and f["after"] for f in x["fields"])],
        "checks": raw.get("summary", {}).get("checks"),
    }
    data = {
        "infrastructure": "demo-dc",
        "diff_detail": diff_block,
        "runs": [{"id": rid, "start": m["run_start"], "status": m["run_status"]} for rid, m in all_runs],
        "current_run": cur_id, "compared_run": prev_id,
        "counts": {"devices": len(nodes), "cables": len(links), "stubs_hidden": sum(1 for n in cur["nodes"] if n["kind"] == "stub"), "checks": sev},
        "diff": {"added_devices": [n["hostname"] for n in nodes if n["diff"]], "removed_devices": removed_nodes,
                 "added_cables": sum(1 for l in links if l["diff"]), "removed_cables": removed_links,
                 "changed": len(cur["report"].get("checks", [])) if isinstance(cur.get("report"), dict) else None},
        "nodes": nodes, "links": links, "ha_clusters": ha_clusters,
        "mlag_domains": [{"id": d["mlag_id"], "members": sorted({c["hostname"] for c in d.get("members", [])}) if d.get("members") else d} for d in cur["mlag_domains"]][:4],
        "selected": {"hostname": SELECTED, "node": next(n for n in nodes if n["hostname"] == SELECTED), "interfaces": interfaces,
                     "aggregates": aggregates, "checks": [{"code": c["code"], "severity": c["severity"]} for c in checks_sel]},
        "bbox": {"x": [min(n["x"] for n in nodes if n["x"] is not None), max(n["x"] for n in nodes if n["x"] is not None)],
                 "y": [min(n["y"] for n in nodes if n["y"] is not None), max(n["y"] for n in nodes if n["y"] is not None)]},
        "note": "Synthetic data from ld-contracts generate. Positions come from the memorized placement (plan units, y grows downward).",
    }
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print(OUT, len(nodes), "nodes", len(links), "links", len(interfaces), "interfaces of", SELECTED, "diff", data["diff"]["added_devices"], removed_nodes, data["bbox"])


if __name__ == "__main__":
    main()
