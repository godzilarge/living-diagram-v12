// An icon at the one size (16 px, stroke 1.75, Lucide), decorative: the words live in the tooltip or the label.
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import "./control.css";

export function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="ui-icon" aria-hidden="true">
      {children}
    </span>
  );
}

/** The busy state of a control: the same icon slot, turning (still under reduced motion). */
export function Spinner() {
  return (
    <span className="ui-icon ui-spin" aria-hidden="true">
      <LoaderCircle />
    </span>
  );
}
