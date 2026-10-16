// The primitives' accessible contract, rendered to markup under Node: names, states, roles.
import { Download } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, Count, Field, IconButton, Island, Panel, Rail, Segmented, Shortcut, Table } from "../src/ui";

const html = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe("primitives", () => {
  it("an icon button is named by its label and says its states", () => {
    expect(html(<IconButton label="x" icon={<Download />} />)).toMatch(/aria-label="x"/);
    expect(html(<IconButton label="x" icon={<Download />} pressed />)).toMatch(/aria-pressed="true".*class="ui-control ui-icon-button ui-rail"|class="ui-control ui-icon-button ui-rail".*aria-pressed="true"/);
    const off = html(<IconButton label="x" icon={<Download />} disabled />);
    expect(off).toContain('aria-disabled="true"');
    expect(off).not.toMatch(/\sdisabled=""/);
    expect(html(<IconButton label="x" icon={<Download />} loading />)).toContain('aria-busy="true"');
    expect(html(<IconButton label="x" icon={<Download />} danger />)).toContain("data-danger");
  });

  it("a button carries its variant and its chevron", () => {
    const out = html(<Button variant="primary" chevron>{"x"}</Button>);
    expect(out).toContain("ui-button-primary");
    expect(out).toContain("ui-button-chevron");
  });

  it("an island floats, a bar island is measured as a bar", () => {
    expect(html(<Island name="tools" layout="bar">{null}</Island>)).toMatch(/data-float="tools" data-bar="tools"/);
    expect(html(<Island name="p">{null}</Island>)).not.toContain("data-bar");
  });

  it("the rail strip and the segmented choice are keyboard widgets with one current item", () => {
    const rail = html(<Rail name="v" label="v" value="a" onChange={() => undefined} items={[{ id: "a", label: "a" }, { id: "b", label: "b", disabled: true }]} />);
    expect(rail).toContain('role="tablist"');
    expect(rail.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(rail).toContain('aria-disabled="true"');
    const seg = html(<Segmented name="s" label="s" value="b" onChange={() => undefined} options={[{ value: "a", label: "a" }, { value: "b", label: "b" }]} />);
    expect(seg).toContain('role="radiogroup"');
    expect(seg).toMatch(/aria-checked="true"[^>]*data-value="b"/);
  });

  it("a field says it is invalid and points at its message", () => {
    const out = html(<Field label="f" error="e" />);
    expect(out).toContain('aria-invalid="true"');
    expect(out).toMatch(/aria-describedby="([^"]+)".*id="\1"/);
  });

  it("a table sorts with aria-sort and marks the current row", () => {
    const out = html(
      <Table label="t" columns={[{ key: "a", label: "a", sortable: true }]} rows={[{ id: "1", cells: { a: "1" }, current: true }]} sort={{ key: "a", direction: "ascending" }} onSort={() => undefined} />,
    );
    expect(out).toContain('aria-sort="ascending"');
    expect(out).toContain('aria-current="true"');
  });

  it("counts, shortcuts and panels render their parts", () => {
    expect(html(<Count value={6} tone="error" />)).toContain('data-tone="error"');
    expect(html(<Shortcut keys={["Ctrl", "K"]} />)).toContain("<kbd");
    expect(html(<Panel name="p" title="t" actions={<span />}>{null}</Panel>)).toContain('data-bar="p-actions"');
  });
});
