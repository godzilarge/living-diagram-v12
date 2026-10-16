// A toast: an island at the bottom centre that says what just happened, a state mark when it carries a fact (error,
// warning, ok), an optional action and a close button. It never moves the islands; it announces itself politely
// (`role="status"`), an error assertively (`role="alert"`).
import { X } from "lucide-react";
import { Button } from "./Button";
import type { Tone } from "./Count";
import { IconButton } from "./IconButton";
import { Island } from "./Island";
import "./Toast.css";

export type ToastProps = {
  name: string;
  message: string;
  tone?: Tone;
  action?: Readonly<{ label: string; onClick: () => void }>;
  closeLabel: string;
  onClose: () => void;
};

export function Toast({ name, message, tone = "neutral", action, closeLabel, onClose }: ToastProps) {
  return (
    <Island name={name} layout="bar" className="ui-toast" role={tone === "error" ? "alert" : "status"}>
      <span className="ui-toast-mark" data-tone={tone} aria-hidden="true" />
      <span className="ui-toast-text">{message}</span>
      {action ? <Button onClick={action.onClick}>{action.label}</Button> : null}
      <IconButton label={closeLabel} icon={<X />} onClick={onClose} />
    </Island>
  );
}
