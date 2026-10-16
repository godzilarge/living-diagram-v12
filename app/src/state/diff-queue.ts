// Which diffs of "Latest collections" to read, and in what order: only those of rows on screen in the widget's body,
// in the order the rows came into view, one request at a time. A row reported out of view before its turn is not
// asked; a row whose request already left keeps its answer when it comes (the hook stores every answer). Pure and
// immutable: the hook keeps the queue, the component reports what it sees.

export type DiffQueue = Readonly<{
  /** Every key ever seen, in the order it came into view. */
  order: readonly string[];
  /** The keys on screen now. */
  visible: ReadonlySet<string>;
  /** The keys asked already (answered or in flight): never asked twice. */
  asked: ReadonlySet<string>;
}>;

export const EMPTY_QUEUE: DiffQueue = Object.freeze({ order: [], visible: new Set<string>(), asked: new Set<string>() });

/** Rows that came into view (in the order the page reports them) and rows that left it. */
export function seeRows(queue: DiffQueue, shown: readonly string[], hidden: readonly string[]): DiffQueue {
  const known = new Set(queue.order);
  const added = shown.filter((key, index) => !known.has(key) && shown.indexOf(key) === index);
  const visible = new Set(queue.visible);
  for (const key of hidden) visible.delete(key);
  for (const key of shown) visible.add(key);
  return { order: [...queue.order, ...added], visible, asked: queue.asked };
}

/** The next key to ask: the first on screen, in order of appearance, not asked yet and that has a diff to read. */
export function nextToAsk(queue: DiffQueue, needs: (key: string) => boolean): string | null {
  return queue.order.find((key) => queue.visible.has(key) && !queue.asked.has(key) && needs(key)) ?? null;
}

export function markAsked(queue: DiffQueue, key: string): DiffQueue {
  return { ...queue, asked: new Set(queue.asked).add(key) };
}
