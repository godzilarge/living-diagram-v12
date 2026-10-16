// A count next to its word (DESIGN.md, Chips and counts): a label-size number in the state colour, no pill.
import "./Count.css";

export type Tone = "neutral" | "ok" | "warning" | "error";

export function Count({ value, tone = "neutral", label }: { value: number; tone?: Tone; label?: string }) {
  return (
    <span className="ui-count" data-tone={tone} aria-label={label}>
      {value}
    </span>
  );
}
