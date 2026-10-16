// The page's own layout pieces (not primitives): a section with its heading, a row of specimens, one specimen with
// its caption under the island that shows it.
import type { ReactNode } from "react";
import { Island } from "../ui";
import type { IslandLayout } from "../ui";

export function Section({ id, heading, note, children, room }: { id: string; heading: string; note: string; children: ReactNode; room?: "popover" | "tooltip" }) {
  return (
    <section className="page-section" id={id} aria-labelledby={`${id}-title`} data-room={room}>
      <h2 id={`${id}-title`}>{heading}</h2>
      <p className="page-note">{note}</p>
      {children}
    </section>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="page-row">{children}</div>;
}

type SpecimenProps = { name: string; caption: string; layout?: IslandLayout; captionAbove?: boolean; children: ReactNode };

export function Specimen({ name, caption, layout = "bar", captionAbove, children }: SpecimenProps) {
  return (
    <figure className="page-specimen" data-caption={captionAbove ? "above" : "below"}>
      <Island name={name} layout={layout}>
        {children}
      </Island>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
