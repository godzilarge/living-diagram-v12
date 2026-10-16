// A toast (DESIGN.md, Toast): an island that says what just happened, a state mark when it carries a fact (error,
// warning, ok), one action and a close button; it hides itself after 6 s unless the pointer or the focus is on it,
// and there is only one at a time (`showToast` replaces the current one, `ToastHost` shows it at the bottom centre,
// 12 px above the run band's line). It announces itself politely (`role="status"`), an error assertively.
import { X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "./Button";
import type { Tone } from "./Count";
import { TOAST_DURATION } from "./geometry";
import { IconButton } from "./IconButton";
import { Island } from "./Island";
import { Mark } from "./Mark";
import "./Toast.css";

export type ToastProps = {
  name: string;
  message: string;
  tone?: Tone;
  action?: Readonly<{ label: string; onClick: () => void }>;
  closeLabel: string;
  onClose: () => void;
  /** Milliseconds before it hides itself; `null` keeps it (the primitives page). */
  duration?: number | null;
};

/** Calls `onClose` after `duration`, paused while `held`; restarts in full when released. */
function useAutoHide(duration: number | null, held: boolean, onClose: () => void): void {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (duration === null || held) return undefined;
    const timer = setTimeout(() => close.current(), duration);
    return () => clearTimeout(timer);
  }, [duration, held]);
}

export function Toast({ name, message, tone = "neutral", action, closeLabel, onClose, duration = TOAST_DURATION }: ToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useAutoHide(duration, hovered || focused, onClose);
  return (
    <Island
      name={name}
      layout="bar"
      className="ui-toast"
      role={tone === "error" ? "alert" : "status"}
      data-tone={tone}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => setFocused(event.currentTarget.contains(event.relatedTarget as Node | null))}
    >
      <Mark tone={tone} />
      <span className="ui-toast-text">{message}</span>
      {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
      <IconButton label={closeLabel} icon={<X />} onClick={onClose} />
    </Island>
  );
}

export type ToastSpec = Readonly<Omit<ToastProps, "name" | "onClose" | "duration" | "closeLabel">>;
type Shown = ToastSpec & { id: number };

// The one slot: a new toast replaces the current one.
let shown: Shown | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function showToast(spec: ToastSpec): number {
  sequence += 1;
  shown = { ...spec, id: sequence };
  emit();
  return sequence;
}

/** Hides the toast `id` (or the current one); a toast already replaced stays replaced. */
export function dismissToast(id?: number): void {
  if (!shown || (id !== undefined && shown.id !== id)) return;
  shown = null;
  emit();
}

export function currentToast(): Shown | null {
  return shown;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function ToastHost({ name, closeLabel }: { name: string; closeLabel: string }) {
  const toast = useSyncExternalStore(subscribe, currentToast, currentToast);
  if (!toast) return null;
  const { id, ...spec } = toast;
  return (
    <div className="ui-toast-host">
      <Toast key={id} name={name} closeLabel={closeLabel} onClose={() => dismissToast(id)} {...spec} />
    </div>
  );
}
