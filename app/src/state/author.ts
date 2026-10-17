// The declared author (`ld-author`, a typed name until accounts come with OAuth; PRODUCT.md): read once, kept for the
// page, changed from the user button (brick 6: nothing is written to the intent without it). Components read it from
// here, never from the storage; a change reaches every reader and the storage at once. The v1 reads the same key.
import { useSyncExternalStore } from "react";
import { readAuthor, writeAuthor } from "../api/http";

let author = readAuthor();
const listeners = new Set<() => void>();

export const currentAuthor = (): string => author;

/** Declares the author for the page and the browser; an empty name forgets it. */
export function setAuthor(name: string): void {
  const kept = name.trim().slice(0, 80);
  if (kept === author) return;
  author = kept;
  writeAuthor(kept);
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useAuthor(): string {
  return useSyncExternalStore(subscribe, currentAuthor, currentAuthor);
}
