// Les pastilles d'une carte (Orhan, 2026-10-07), en une rangée à cheval sur son bord haut, alignée à droite : le point
// de gravité, la pastille de stack (icône de couches, nombre de membres), la pastille HA (« ACTIF » transmet, « PASSIF »
// attend, « DOWN » si le membre est tombé ; model.haBadge dit quand le snapshot permet de l'écrire). Toutes ont la
// forme commune (pill.tsx). Un clic sur la pastille de stack ouvre la liste des membres ; un clic sur la liste, Échap ou
// un clic ailleurs la ferme. Ni la pastille ni la liste ne sélectionnent ni ne déplacent la carte (`nodrag`).
import { Layers } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import type { StackMember } from "../../contracts/snapshot";
import type { CardPlan } from "../../canvas/card";
import { PILL_H } from "../../canvas/pill";
import { PillSvg, pillSvgWidth } from "./pill";

export interface HaChip { letter: "A" | "P"; down: boolean; title: string }

const TOP_ROOM = 64, ROW_INSET = 16, GAP = 6, DOT_R = 5;
const HA_TEXT = { A: "actif", P: "passif" } as const;

export function Chips({ plan, ha, count, severity, open, onToggle }: { plan: CardPlan; ha: HaChip | null; count: number; severity: string | null; open: boolean; onToggle: () => void }) {
  const dot = severity === "error" || severity === "warning" ? severity : null;
  if (!ha && !count && !dot) return null;
  const top = -plan.h / 2 - PILL_H / 2;
  let right = plan.w / 2 - ROW_INSET;
  const dotX = right - DOT_R;
  if (dot) right -= 2 * DOT_R + GAP;
  const stackText = String(count), sw = count ? pillSvgWidth(stackText, "icon") : 0, sx = right - sw;
  if (count) right = sx - GAP;
  const haText = ha ? (ha.down ? "down" : HA_TEXT[ha.letter]) : "", hx = right - (ha ? pillSvgWidth(haText) : 0);
  const toggle = (event: MouseEvent | KeyboardEvent): void => { event.stopPropagation(); event.preventDefault(); onToggle(); };
  const keys = (event: KeyboardEvent): void => { if (event.key === "Enter" || event.key === " ") toggle(event); };
  return (
    <g className="card-pills">
      {ha ? (
        <g className={"chip-ha ha-" + ha.letter + (ha.down ? " down" : "")} role="img" aria-label={ha.title}>
          <PillSvg x={hx} y={top} text={haText} tone={ha.down ? "danger" : ha.letter === "A" ? "ok" : "muted"} />
        </g>
      ) : null}
      {count ? (
        <g className={"chip-stack nodrag nopan" + (open ? " open" : "")} role="button" tabIndex={0} aria-expanded={open ? "true" : "false"}
          aria-label={"stack de " + count + " membres : voir la liste"} onClick={toggle} onKeyDown={keys} onPointerDown={(event) => event.stopPropagation()}>
          <PillSvg x={sx} y={top} text={stackText} tone="neutral" icon={Layers} />
        </g>
      ) : null}
      {dot ? <circle className={"node-badge severity-" + dot} cx={dotX} cy={-plan.h / 2} r={DOT_R} /> : null}
    </g>
  );
}

/** La liste des membres d'un stack, au-dessus de la carte. */
export function StackList({ hostname, members, onClose }: { hostname: string; members: StackMember[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);
  // Pas la place au-dessus de la carte (sous la barre du haut) : la liste s'ouvre dessous.
  useLayoutEffect(() => { const el = ref.current; if (el && el.getBoundingClientRect().top < TOP_ROOM) setBelow(true); }, []);
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (!target || !ref.current || ref.current.contains(target)) return;
      if (target.closest && target.closest(".chip-stack") && ref.current.parentElement && ref.current.parentElement.contains(target)) return; // la chip bascule elle-même
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey, true); document.removeEventListener("pointerdown", onDown, true); };
  }, [onClose]);
  const close = (event: MouseEvent): void => { event.stopPropagation(); onClose(); };
  return (
    <div ref={ref} className={"stack-list nodrag nopan nowheel" + (below ? " below" : "")} role="dialog" aria-label={"membres du stack " + hostname} onClick={close} onPointerDown={(event) => event.stopPropagation()}>
      <div className="stack-list-head"><Layers aria-hidden="true" />stack · {members.length} membres</div>
      <ol>
        {members.map((m) => (
          <li key={m.slot}>
            <b className="slot">{m.slot}</b>
            <span className={"pill tone-" + (m.role === "active" ? "ok" : "neutral")}>{m.role}</span>
            <span className={"pill tone-" + (m.state === "ready" ? "ok" : m.state === "removed" || m.state === "version_mismatch" ? "danger" : "muted")}>{m.state}</span>
            <span className="stack-model">{m.model || "—"}</span>
            <code className="stack-serial">{m.serial || "—"}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
