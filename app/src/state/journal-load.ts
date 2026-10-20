// How the Log view reads its pages (the v1's `journal-commands.ts`, the pure part): one read per set of filters, the
// next page appended, a re-read as long as what was shown (the log may have grown: the place stays), the limits.
// `useJournal.ts` runs the effects. Pure, tested under Node.
import type { JournalEntry, JournalPage } from "../api/journal";
import { newer } from "./journal";

/** Entries per read (the rest is read on reaching the foot of the feed). */
export const PAGE = 200;
/** The API's bound for one read: beyond it, the tail already read is kept as it was. */
export const RELOAD_MAX = 500;
/** Entries at most in an export (200 reads): beyond, the file says so. */
export const EXPORT_MAX = 100_000;

/** How many entries a re-read of the same filters asks for: as many as were shown, between one page and the bound. */
export const reloadLimit = (shown: number | null): number => (shown === null ? PAGE : Math.min(RELOAD_MAX, Math.max(PAGE, shown)));

/** The page read, put together with what was shown: the next page is appended; a re-read shorter than what was shown
 *  keeps the tail already read (older than its last entry) and its cursor. */
export function merged(page: JournalPage, cached: JournalPage | null, more: boolean): JournalPage {
  if (!cached) return page;
  if (more) return { ...page, entries: [...cached.entries, ...page.entries], start_missing: cached.start_missing };
  const last = page.entries[page.entries.length - 1];
  if (!last || !page.next || cached.entries.length <= page.entries.length) return page;
  const tail = cached.entries.filter((e: JournalEntry) => newer(last, e));
  return { ...page, entries: [...page.entries, ...tail], next: cached.next };
}
