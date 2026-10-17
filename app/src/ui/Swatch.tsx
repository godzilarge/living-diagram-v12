// A swatch (DESIGN.md, Shapes: 12 px, the swatch radius): the colour a choice stands for, decorative (its words are the
// control's): an accent of the settings (`cobalt`, `ink`, in the current theme) or a hue of the canvas (`blue` … `slate`,
// the canvas's own twelve, `--hue-*`, which the canvas styles define). One square, wherever a colour is chosen.
import "./Swatch.css";

export function Swatch({ swatch }: { swatch: string }) {
  return <span className="ui-swatch" data-swatch={swatch} aria-hidden="true" />;
}
