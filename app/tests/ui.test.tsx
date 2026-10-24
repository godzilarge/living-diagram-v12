// The primitives' accessible contract, rendered to markup under Node: names, states, roles.
import { Download } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Alerts, Avatar, Button, Checklist, Code, Count, Facts, Field, FileInput, IconButton, IconLink, initialOf, Island, Link, Mark, Menu, Palette, Panel, Rail, Register, registerRowKey, RegisterTargets, Segmented, Separator, Shortcut, SourceLine, Swatch, Table, Widget, WidgetToggles, Zero } from "../src/ui";
import type { PaletteProps } from "../src/ui";

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

  it("facts and alerts render their parts, a detail sets its sentence strong", () => {
    const facts = html(<Facts columns={2} items={[{ label: "a", value: "1" }, { label: "b", value: <Mark tone="ok">{"x"}</Mark> }]} />);
    expect(facts).toContain('data-columns="2"');
    expect(facts.match(/<dt>/g)).toHaveLength(2);
    expect(html(<Facts layout="strip" items={[]} />)).toContain('data-layout="strip"');
    const alerts = html(<Alerts label="l" items={[{ id: "1", tone: "error", text: "t", detail: "d" }, { id: "2", tone: "neutral", text: "u" }]} />);
    expect(alerts.match(/<li /g)).toHaveLength(2);
    expect(alerts.match(/data-strong=""/g)).toHaveLength(1);
    expect(alerts).toContain('data-tone="error"');
  });

  it("a checklist is a group of checkboxes, each saying its state", () => {
    const out = html(<Checklist name="c" label="l" items={[{ id: "a", label: "A", checked: true }, { id: "b", label: "B", checked: false }]} onToggle={() => undefined} />);
    expect(out).toContain('role="group"');
    expect(out.match(/role="checkbox"/g)).toHaveLength(2);
    expect(out).toMatch(/aria-checked="true"[^>]*data-value="a"/);
    expect(out.match(/<svg/g)).toHaveLength(1);
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
  it("the search palette is a named modal layer: a combobox naming its current option, grouped options, the tabs", () => {
    const none = () => undefined;
    const props: PaletteProps = {
      id: "p", label: "l", open: true, inline: true, query: "co", onQuery: none, inputLabel: "i", escapeKey: "e", scopesLabel: "s",
      scopes: [{ id: "all", label: "a", count: 2 }, { id: "ports", label: "p", count: 0 }], scope: "all", onScope: none, onScopeStep: none,
      groups: [{ id: "g", label: "g", count: 2, rows: [{ id: "r1", icon: <Download />, name: [{ text: "x", hit: false }, { text: "co", hit: true }], detail: "d" }, { id: "r2", icon: <Download />, name: "y", detail: "d2" }, { id: "more", icon: <Download />, name: "m", variant: "more" }] }],
      active: "r2", onMove: none, onChoose: none, onClose: none, hints: [{ id: "h", keys: [<Shortcut key="k" keys={["k"]} />], label: "h" }], total: "t", status: "2 found",
    };
    const out = html(<Palette {...props} />);
    expect(out).toMatch(/id="p"[^>]*role="dialog"[^>]*aria-label="l"[^>]*data-layer="palette"/);
    expect(out).toMatch(/role="combobox"[^>]*aria-controls="p-list"[^>]*aria-activedescendant="p-option-1"/);
    expect(out).toContain('id="p-list" role="listbox"');
    expect(out.match(/role="option"/g)).toHaveLength(3);
    // the keyboard position: the option row of a list, accent-weak by `data-active` (Option.css, one definition)
    expect(out).toMatch(/id="p-option-1" class="ui-option ui-palette-row" role="option" aria-selected="true" data-active=""/);
    expect(out).toMatch(/id="p-option-2"[^>]*data-variant="more"/);
    // the tabs command the list's tab panel, named by the current tab; the listbox inside it
    expect(out).toMatch(/id="p-panel-tab-all" aria-controls="p-panel"/);
    expect(out).toMatch(/id="p-panel" role="tabpanel" aria-labelledby="p-panel-tab-all"><div id="p-list" role="listbox"/);
    expect(out).toContain('<div class="ui-visually-hidden" aria-live="polite">2 found</div>');
    expect(out).toMatch(/role="group" aria-labelledby="([^"]+)".*id="\1"/);
    expect(out).toContain("<b>co</b>");
    expect(out).toContain('role="tablist"');
    // the current row trades its detail for the Enter chip
    expect(out).not.toContain(">d2<");
    expect(out).toContain(">d<");
    expect(html(<Palette {...props} active={null} />)).not.toContain("aria-activedescendant");
    expect(html(<Palette {...props} open={false} />)).toBe("");
    // modal when it floats: the inline specimen is not
    expect(out).not.toContain("aria-modal");
  });

  it("a shortcut may be a drawn key; snug facts take the palette's label column", () => {
    expect(html(<Shortcut icon={<Download />} />)).toMatch(/<kbd class="ui-shortcut"><span class="ui-icon" aria-hidden="true"><svg/);
    expect(html(<Facts size="snug" items={[{ label: "a", value: "1" }]} />)).toContain('data-size="snug"');
    expect(html(<Facts items={[]} />)).not.toContain("data-size");
    expect(html(<Alerts size="snug" label="a" items={[{ id: "1", tone: "error", text: "x" }]} />)).toContain('data-size="snug"');
  });
  it("a menu: actions, a chosen value, a shortcut, a deleting row, a verbatim row, a hiding lifted, a separator and a heading", () => {
    const out = html(
      <Menu
        label="m"
        onChoose={() => undefined}
        rows={[
          { id: "a", label: "a", shortcut: ["Ctrl", "C"], keys: "Control+C" },
          { kind: "separator" },
          { kind: "heading", label: "h" },
          { id: "b", label: "b", checked: true },
          { id: "c", label: "c", checked: false },
          { id: "d", label: "d", danger: true },
          { id: "e", label: "e", verbatim: true, disabled: true },
          { id: "f", label: "f", trailing: "lift" },
        ]}
      />,
    );
    expect(out).toMatch(/role="menu"[^>]*aria-label="m"|aria-label="m"[^>]*role="menu"/);
    expect(out.match(/role="menuitem"/g)).toHaveLength(4);
    // the cross says what choosing does, in a glyph the name does not read: the row's name stays its label
    expect(out.match(/data-trailing="lift"/g)).toHaveLength(1);
    expect(out).toMatch(/data-value="f"[^]*?<span class="ui-option-text">f<\/span><span class="ui-menu-trailing" data-trailing="lift"><span class="ui-icon" aria-hidden="true">/);
    expect(out.match(/role="menuitemradio"/g)).toHaveLength(2);
    expect(out).toContain('aria-checked="true"');
    expect(out).toContain('aria-keyshortcuts="Control+C"');
    expect(out).toContain("ui-shortcut");
    expect(out.match(/ui-option-check/g)).toHaveLength(1);
    expect(out).toContain("data-danger");
    expect(out.match(/data-verbatim/g)).toHaveLength(1);
    expect(out).toContain('aria-disabled="true"');
    expect(out).toContain('role="separator"');
    expect(out).toContain("ui-menu-heading");
    expect(html(<Menu label="m" surface onChoose={() => undefined} rows={[]} />)).toContain("data-surface");
  });

  it("a column island is measured as a bar; its separator lies down; a swatch and a file input stay silent", () => {
    expect(html(<Island name="edit-tools" layout="column">{null}</Island>)).toMatch(/data-float="edit-tools" data-bar="edit-tools"/);
    expect(html(<Separator orientation="horizontal" />)).toContain('aria-orientation="horizontal"');
    expect(html(<Separator />)).toContain('aria-orientation="vertical"');
    expect(html(<Swatch swatch="slate" />)).toMatch(/aria-hidden="true"/);
    const input = html(<FileInput onFile={() => undefined} accept="image/png" />);
    expect(input).toContain('type="file"');
    expect(input).toContain('tabindex="-1"');
    expect(input).toContain('aria-hidden="true"');
  });

  it("a check code is a chip of its own; a hollow mark says nothing was asked; a mark alone may be said", () => {
    expect(html(<Code>{"link_down"}</Code>)).toBe('<span class="ui-code">link_down</span>');
    expect(html(<Mark tone="off" />)).toBe('<span class="ui-mark" data-tone="off" aria-hidden="true"></span>');
    expect(html(<Mark tone="off" said="HA: not asked" />)).toBe('<span class="ui-mark" data-tone="off" role="img" aria-label="HA: not asked"></span>');
    const css = readFileSync(new URL("../src/ui/Mark.css", import.meta.url), "utf8");
    expect(css).toMatch(/\[data-tone="off"\]\s*\{[^}]*box-shadow: var\(--shadow-hollow-mark\)/);
  });

  it("a source line is a decorative stroke before its words; a zero is quiet and still said", () => {
    const line = html(<SourceLine kind="dotted">{"Description only"}</SourceLine>);
    expect(line).toContain('<span class="ui-source-line" data-line="dotted" aria-hidden="true"></span>Description only');
    expect(html(<Zero />)).toBe('<span class="ui-zero"><span aria-hidden="true">0</span><span class="ui-visually-hidden">0</span></span>');
  });

  it("a toggle carries its count; a widget's toggles are a named group measured as a bar; a band sits over the body", () => {
    const toggle = html(<Button pressed count={{ value: 6, tone: "error" }}>{"Errors"}</Button>);
    expect(toggle).toMatch(/aria-pressed="true"/);
    expect(toggle).toContain('<span class="ui-button-text">Errors</span><span class="ui-count" data-tone="error">6</span>');
    const widget = html(
      <Widget name="w" heading="h" count="19 Jan" toggles={<WidgetToggles name="severities" label="Severities">{null}</WidgetToggles>} band={<Facts layout="strip" items={[{ label: "a", value: "1" }]} />}>
        {null}
      </Widget>,
    );
    expect(widget).toContain('<span class="ui-widget-count">19 Jan</span><div class="ui-widget-toggles" role="group" aria-label="Severities" data-bar="severities">');
    expect(widget.indexOf('data-layout="strip"')).toBeLessThan(widget.indexOf("ui-widget-body"));
  });

  it("a table may centre a column (a mark under its short header)", () => {
    const out = html(<Table label="t" columns={[{ key: "ha", label: "HA", align: "center", fit: true }]} rows={[{ id: "1", cells: { ha: <Mark tone="off" /> } }]} />);
    expect(out).toContain('data-key="ha" data-align="center" data-fit=""');
  });

  it("the register: group headings, rows that open (aria-expanded, a detail row under the open one), targets as links", () => {
    const row = (id: string) => ({ id, tone: "error" as const, title: `sentence ${id}`, meta: <Code>{"aggregate_below_min_links"}</Code>, count: 2, detail: <RegisterTargets label="What it concerns" targets={[{ id: "t", icon: null, label: "dc01-core-01 · port-channel101", href: "#aggregate=x" }, { id: "u", icon: null, label: "gone", href: null }]} /> });
    const out = html(
      <Register label="Verdicts" columns={{ mark: "Severity", verdict: "Verdict", count: "How many", open: "Open" }} groups={[{ id: "error", label: "Errors", count: 2, rows: [row("a"), row("b")] }]} open={new Set(["a"])} onToggle={() => undefined} />,
    );
    expect(out).toContain('<table class="ui-table ui-register" aria-label="Verdicts" data-density="relaxed" data-head="widget">');
    expect(out).toMatch(/<tr class="ui-register-group" data-group="error"><th scope="colgroup" colSpan="4">/i);
    expect(out.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(out.match(/aria-expanded="false"/g)).toHaveLength(1);
    expect(out.match(/tabindex="0"/gi)).toHaveLength(2);
    const controls = /aria-expanded="true" aria-controls="([^"]+)"/.exec(out)?.[1];
    expect(out).toContain(`<tr class="ui-register-detail" id="${controls}">`);
    expect(out.match(/ui-register-detail/g)).toHaveLength(1);
    expect(out).toContain('<a href="#aggregate=x" class="ui-link" data-variant="inline">dc01-core-01 · port-channel101</a>');
    expect(out).toContain('<span class="ui-register-target-words">gone</span>');
    expect(out).toContain('<span class="ui-register-title">sentence a</span><span class="ui-register-meta"><span class="ui-code">aggregate_below_min_links</span></span>');
  });

  it("a register row opens and closes at the keyboard: Enter and Space on the row, never on a link inside it", () => {
    const row = {};
    const press = (key: string, target: object = row) => {
      let toggled = 0, prevented = 0;
      registerRowKey({ key, target, currentTarget: row, preventDefault: () => (prevented += 1) } as never, () => (toggled += 1));
      return [toggled, prevented];
    };
    expect(press("Enter")).toEqual([1, 1]);
    expect(press(" ")).toEqual([1, 1]);
    expect(press("ArrowDown")).toEqual([0, 0]);
    expect(press("Enter", {}), "a link inside keeps its Enter").toEqual([0, 0]);
  });
});
