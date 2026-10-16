// An island (DESIGN.md, Islands): paper, a hairline, the island shadow, the surface radius; it floats over the map and
// keeps its distance. `layout="bar"` is a row of 32 px controls in a 48 px island; `strip` holds a tab strip (Rail)
// that reaches the island's edges; `panel` pads 16 px. Every island is `data-float`; a bar is also `data-bar`.
import type { HTMLAttributes, ReactNode, Ref } from "react";
import "./Island.css";

export type IslandLayout = "bar" | "strip" | "panel" | "plain";

export type IslandProps = Omit<HTMLAttributes<HTMLElement>, "style" | "title"> & {
  /** The island's name for the measurement (`data-float`, `data-bar`). */
  name: string;
  layout?: IslandLayout;
  as?: "div" | "aside" | "section" | "nav" | "header";
  children: ReactNode;
  ref?: Ref<HTMLElement>;
};

export function Island({ name, layout = "plain", as: Tag = "div", children, className, ref, ...rest }: IslandProps) {
  return (
    <Tag
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      className={["ui-island", `ui-island-${layout}`, className ?? ""].join(" ").trim()}
      data-float={name}
      data-bar={layout === "bar" ? name : undefined}
    >
      {children}
    </Tag>
  );
}

/** The hairline between two groups of controls in a bar: 17 px across (8 + 1 + 8). */
export function Separator() {
  return <span className="ui-separator" role="separator" aria-orientation="vertical" />;
}
