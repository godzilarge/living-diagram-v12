// The primitives' accessible contract, rendered to markup under Node: names, states, roles.
import { Download } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Avatar, Button, Count, Field, IconButton, IconLink, initialOf, Island, Link, Mark, Panel, Rail, Segmented, Shortcut, Table, Widget } from "../src/ui";

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
    const panel = html(<Panel name="p" heading="t" tile={<Download />} actions={<span />}>{null}</Panel>);
    expect(panel).toContain('data-bar="p-actions"');
    expect(panel).toContain("ui-panel-tile");
  });

  it("a widget is a named island section with its header, its count and its action measured as a bar", () => {
    const out = html(<Widget name="w" heading="h" count={6} action={<IconButton label="x" icon={<Download />} />} grow>{null}</Widget>);
    expect(out).toMatch(/^<section[^>]*data-float="w"/);
    expect(out).toMatch(/aria-labelledby="([^"]+)".*<h2 id="\1">h<\/h2>/);
    expect(out).toContain('<span class="ui-widget-count">6</span>');
    expect(out).toContain('data-bar="w-head"');
    expect(out).toContain("data-grow");
    const bare = html(<Widget name="w" heading="h">{null}</Widget>);
    expect(bare).not.toContain("data-bar");
    expect(bare).not.toContain("ui-widget-count");
  });

  it("an avatar shows an initial, decoratively; a mark carries its tone, alone or before its words", () => {
    expect(html(<Avatar name="  camille.r" />)).toBe('<span class="ui-avatar" aria-hidden="true">C</span>');
    expect(initialOf("")).toBe("?");
    expect(html(<Avatar name="  " />)).toBe('<span class="ui-avatar" aria-hidden="true">?</span>');
    expect(readFileSync(new URL("../src/ui/Avatar.css", import.meta.url), "utf8")).toMatch(/\[aria-disabled="true"\] \.ui-avatar \{\s*color: var\(--color-ink-4\)/);
    expect(initialOf("élodie")).toBe("É");
    expect(html(<Mark tone="error" />)).toBe('<span class="ui-mark" data-tone="error" aria-hidden="true"></span>');
    expect(html(<Mark tone="warning">{"x"}</Mark>)).toMatch(/^<span class="ui-state" data-tone="warning"><span class="ui-mark"[^>]*><\/span>x<\/span>$/);
  });

  it("a table takes the home densities and narrow, silent columns; an icon button may be outlined", () => {
    const out = html(<Table label="t" density="relaxed" columns={[{ key: "a", label: "a" }, { key: "go", label: "open", fit: true, hideLabel: true }]} rows={[{ id: "1", cells: { a: "1" } }]} />);
    expect(out).toContain('data-density="relaxed"');
    expect(out).toContain('<span class="ui-th ui-visually-hidden">open</span>');
    expect(out.match(/data-fit=""/g)).toHaveLength(2);
    expect(html(<IconButton label="x" icon={<Download />} variant="line" />)).toContain("ui-icon-button ui-icon-button-line");
    expect(html(<IconButton label="x" icon={<Download />} />)).not.toContain("ui-icon-button-line");
  });

  it("a table row with an address: its link cell is a quiet Link that Tab reaches, never the row", () => {
    const columns = [{ key: "name", label: "Name", link: true, cut: true }, { key: "n", label: "n" }];
    const out = html(<Table label="t" head="widget" columns={columns} rows={[{ id: "/?a=1", href: "/?a=1", cells: { name: "demo-dc", n: "3" } }]} onRowClick={() => undefined} />);
    expect(out).toContain('data-head="widget"');
    expect(out).toContain('<a href="/?a=1" class="ui-link" data-variant="quiet">demo-dc</a>');
    expect(out).toContain("data-clickable");
    expect(out).not.toContain("tabindex");
    expect(out.match(/data-cut=""/g)).toHaveLength(2);
    const plain = html(<Table label="t" columns={columns} rows={[{ id: "1", cells: { name: "x" } }]} onRowClick={() => undefined} />);
    expect(plain).toContain('tabindex="0"');
    expect(plain).not.toContain("<a ");
    expect(html(<Table label="t" columns={columns} rows={[{ id: "1", cells: { name: "x" } }]} />)).not.toContain("data-clickable");
  });

  it("only a clickable row takes the hover fill; a count takes the mark's state colours, defined once", () => {
    const table = readFileSync(new URL("../src/ui/Table.css", import.meta.url), "utf8");
    expect(table).toContain("tr[data-clickable]:hover td");
    expect(table).not.toMatch(/tr:hover/);
    expect(readFileSync(new URL("../src/ui/Count.css", import.meta.url), "utf8")).not.toMatch(/data-tone/);
    expect(readFileSync(new URL("../src/ui/Mark.css", import.meta.url), "utf8")).toContain(':is(.ui-state, .ui-count)[data-tone="error"]');
    expect(html(<Count value={6} tone="error" />)).toBe('<span class="ui-count" data-tone="error">6</span>');
  });

  it("a link is the only anchor: inline or quiet, and the icon link of the logo, named by its label", () => {
    expect(html(<Link href="/x">dc01</Link>)).toBe('<a href="/x" class="ui-link" data-variant="inline">dc01</a>');
    expect(html(<Link href="/x" variant="quiet">dc01</Link>)).toContain('data-variant="quiet"');
    const logo = html(<IconLink href="/next/" label="Home" icon={<Download />} />);
    expect(logo).toMatch(/^<a [^>]*href="\/next\/"[^>]*class="ui-control ui-icon-button"[^>]*aria-label="Home"/);
  });

  it("a widget says at its foot what its body could not show", () => {
    expect(html(<Widget name="w" heading="h" foot="2 archive entries could not be read">{null}</Widget>)).toContain('<p class="ui-widget-foot">2 archive entries could not be read</p>');
    expect(html(<Widget name="w" heading="h">{null}</Widget>)).not.toContain("ui-widget-foot");
    expect(readFileSync(new URL("../src/ui/Widget.css", import.meta.url), "utf8")).not.toMatch(/\.ui-table|\.ui-th/);
  });
});
