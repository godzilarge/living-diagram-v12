// What a widget says instead of its content: still reading, empty, refused, waiting for the token. One sentence in
// ink-3, never a toast.
import type { ReactNode } from "react";

export function Note({ children }: { children: ReactNode }) {
  return <p className="home-note">{children}</p>;
}
