// Synthetic sample values for the page's table: identifiers only (ports, hostnames, speeds), never words of the
// interface; the words (states) come from the catalogues.
export type SamplePort = Readonly<{ port: string; state: "up" | "down"; speed: string; neighbour: string }>;

export const PORTS: readonly SamplePort[] = Object.freeze([
  { port: "Ethernet1/1", state: "up", speed: "10 G", neighbour: "dc01-acc-01" },
  { port: "Ethernet1/2", state: "up", speed: "10 G", neighbour: "dc01-acc-02" },
  { port: "Ethernet1/3", state: "down", speed: "10 G", neighbour: "" },
  { port: "Ethernet1/49", state: "up", speed: "100 G", neighbour: "dc01-core-02" },
  { port: "Ethernet1/50", state: "up", speed: "100 G", neighbour: "dc01-core-02" },
  { port: "Ethernet1/51", state: "up", speed: "40 G", neighbour: "dc01-fw-01" },
  { port: "Ethernet1/52", state: "down", speed: "40 G", neighbour: "dc01-fw-02" },
]);

export const INFRASTRUCTURES = Object.freeze(["demo-dc", "lab-paris", "site-lyon"]);
export const DEVICE = "dc01-core-01";
/** Declared authors (the home's feed): names, never words of the interface. */
export const AUTHORS = Object.freeze(["orhan", "camille.r", "t.martin"]);
export const MODEL = "N9K-C93180YC-FX";

/** The search palette's specimen: what "core" finds (identifiers only; the words come from the catalogue). */
export const PALETTE_QUERY = "core";
export const PALETTE_DEVICES = Object.freeze(["dc01-core-01", "dc01-core-02", "dc02-core-01"]);
export const PALETTE_PORTS = Object.freeze([
  { port: "Ethernet1/54", host: "dc01-core-01", to: "dc02-core-01" },
  { port: "Ethernet1/53", host: "dc02-core-01", to: "dc01-core-01" },
]);
export const PALETTE_DESTINATIONS = Object.freeze([
  { ports: "Eth1/49, 1/50", host: "dc01-core-02" },
  { ports: "Eth1/54", host: "dc02-core-01" },
  { ports: "Eth1/41, 1/42", host: "dc01-fw-01" },
]);
export const PALETTE_SITE = "dc01";
/** The ports beyond the window of All, said by the "more" row. */
export const PALETTE_MORE = 24;

/** The Log's specimens (facets and feed): names of objects as the data writes them, never words of the interface. */
export const LOG_OBJECTS = Object.freeze({ annotation: "rack-12", table: "core-addressing", group: "old-core" });
export const LOG_COUNTS = Object.freeze({ all: 412, demo: 236, lyon: 98, paris: 0, positions: 300, colors: 24, groups: 31, annotations: 40, connectors: 0 });
