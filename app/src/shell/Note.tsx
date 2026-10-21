// What a surface says instead of its content: still reading, empty, refused, nothing matches, waiting for the token.
// One sentence in ink-3, never a toast; one definition for the home's widgets, Check's widgets, the token form and the
// diagram's centred island.
import type { ReactNode } from "react";
import "./Note.css";

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={["shell-note", className ?? ""].join(" ").trim()}>{children}</p>;
}
