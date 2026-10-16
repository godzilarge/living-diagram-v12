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
