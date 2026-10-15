# Product

<!-- impeccable:product-schema 1 -->

Living Diagram is the living reference of network infrastructures: discovered by collection, corrected once by the
engineer in charge, then followed over time. Interview with Orhan (owner, network engineer) on 2026-10-15; every fact
below comes from his answers, open decisions are marked as such.

## Platform

web

## Users

- **The network engineer in charge of an infrastructure.** Most of the time he **reads**: he clicks a device and reads
  its interfaces (state, description, speed, media, transceiver, neighbor on the other end) without opening an SSH
  session or typing a command. Regularly, he **checks the quality of the discovery**: why this cable is "observed" and
  not "observed and documented", which description does not follow the standard, which device did not answer. At the
  start of an infrastructure's life, then at each evolution, he **edits**: he places devices, annotates, groups,
  adjusts links. Without clear and pleasant editing, "he will never come back".
- **The non-technical reader**: manager, auditor, project lead. He comes to learn about an infrastructure, collect a
  piece of information, and **export** a diagram for a file. He knows neither the correlation vocabulary nor the
  check codes, and must never have to read them.
- Several people of both profiles use the application **at the same time**, on different infrastructures or the same.

## Product Purpose

Infrastructure references, and diagrams above all, are never up to date: the infrastructure lives, the documentation
does not follow. Living Diagram replaces Visio and file sharing (storage, history) with a reference that stays true:
a thorough discovery draws the physical topology (L1); the engineer places, annotates and validates once; the intent
layer keeps that work from one collection to the next; snapshots give the history and the evolution of the
infrastructure, showable to an auditor.

Success is measured by three things: the current information of a device is found **faster and more pleasantly than
over SSH**; a **false diagram is never shown** without one being able to see why; the reference stays up to date
**without redoing the work** at each collection.

## Positioning

Neither a monitoring tool (no real time: Grafana is not the neighbor), nor a drawing tool (Visio does not know what
is true). The closest neighbor for reading is a NetBox or a Catalyst Center, but Living Diagram is **a map one
explores, where editing is a mode**, not a document one draws nor a database one fills by hand: what is drawn comes
from collected data, every link knows where it comes from, and a disagreement between sources becomes a visible check
instead of being settled silently.

## Operating Context

- **Scenes**: a 13-inch laptop during an intervention, a 32-inch desk screen, a projector in a meeting room in front
  of an auditor. All real, none is secondary. Phone and tablet: **never targeted**.
- **Browsers**: Edge and Chrome, in the enterprise. Zone without Internet access: no external resource (fonts,
  scripts, icons embedded), content security policy `'self'`.
- **Languages**: French and English as equals (international dimension), language chosen by the user; API messages in
  English; documentation and CLI in French for now.
- **Ritual**: the exporter (written by Orhan in the secure environment) pushes bundles per collection run; the
  application shows the last run, compares it with the previous one, and keeps intents from one run to the next.
  Feedback on real data is given in words, never through a bundle (no real data ever leaves the infrastructure).
- **Operations**: one zone, one process (API plus served application), API token today.

## Capabilities and Constraints

Confirmed, existing:

- **L1** topology (cables between physical ports, aggregates, HA clusters, MLAG / vPC, stacks), per infrastructure
  and per run; status of each cable (observed, documented, confirmed) with its sources and its checks.
- Diff between two runs (added, removed, changed, rebooted, flapped); memorized placement; shared intent (pins,
  colors, groups, annotations including tables, images and code blocks, connectors), journaled; Log view (who
  changed what, when); bilingual interface; dark and light themes.
- V1 scope: **the infrastructure, never the endpoints** (phones, servers, access points hidden).

Confirmed, upcoming, which the interface must **already anticipate**:

- **L2 (VLANs, trunks) and L3 (routing, BGP, external partners) views**: soon, as views of the same graph. From v2
  on, the shell carries the L1 / L2 / L3 layer choice, the last two marked "in progress".
- **Export of the diagram as PNG and SVG**, with **anonymization** and a choice of what is shown or not (for
  auditors). A **crucial** function, not a convenience.
- **Accounts** through OAuth / OpenID: the declarative author (a typed name) is temporary; the shell must be able to
  go from a "name" field to a session without reorganizing itself.
- **Data verification enters the product**: the diagnostic page `/view` (coverage per topic, ingestion findings,
  unparsed descriptions, sources) has no reason to exist apart anymore; its readings join the check view, in plain
  language for the engineer. `/view` only survives for the duration of the migration.

Durable constraints and facts:

- **The front end invents nothing**: never a cable, a number, a silent resolution of a disagreement; a link added by
  hand is a signed intent, visible as such, never a fact.
- Interface counters are **not** in the data contract: out of V1.
- No real time: the data is that of the last collection, dated.
- Determinism: same collection, same diagram; positions are memorized, not recomputed.
- Every visible text exists in French and in English; no hard-coded string.

Open decisions (not to be invented):

- Exact form of the export (one image, a paged file, data as CSV?) and granularity of the anonymization.
- Roles and rights once accounts arrive (who edits, who reads, who exports).
- Precise fate of each `/view` tab within the check view.

## Brand Commitments

- Name: **Living Diagram**. The tool must have **an identity of its own**, which the current version lacks; no
  corporate chart imposed, no creative constraint, on one condition: it stays **professional and functional**.
- Voice: that of an engineer's tool that speaks plainly. Orhan wants it **fast and "playful" to browse**: finding a
  piece of information must be a pleasure, not a procedure. Never a "generic AI page".
- Explicit rejection of the current style (tinted dark ground, cyan accent, uppercase mono, pills everywhere, glass
  floating bars): it serves as an anti-reference, not as a starting point.
- **Binding negative constraints** (Orhan, 2026-10-15): no violet or purple tints; no pill-shaped or "bubble"
  buttons; nothing that reads as "made by an AI". **Rich in functions, light to the eye.**
- **Details are the product**: button sizes, shapes, placement, alignment between elements, text. Two controls side
  by side with different heights is a defect, not a nuance. The finish is **measured** in the DOM (heights, baselines,
  gaps, alignment), never judged on a screenshot alone.
- Orhan has no reference interface in mind and no creative process of his own: he judges what he sees. The design
  process therefore **shows him materially different directions** to choose from; it never asks him to describe a
  look.

## Evidence on Hand

- Data: no real data, ever. Synthetic fixtures (`contracts/fixtures/`) and the seeded generator
  (`ld-contracts generate`, up to 500 devices, evolution scenarios); the `demo-dc` series (30 devices, 3 runs) is
  used for captures.
- Data contracts: `contracts/CONTRAT.md` (RunBundle, Snapshot, Diff, Intent).
- Current interface: captures in `bac-a-sable/harmonie/captures/avant-*`; inventories
  `docs/revues/2026-10-13-inventaire-ui-*.md`; editor benchmark `docs/revues/2026-10-13-benchmark-editeurs.md`.
- Absences not to be fabricated: no logo, no testimonial, no usage figure, no capture of a real infrastructure.

## Product Principles

1. **Data first, readable by everyone.** What a device says about itself is read in one click, in words, exportable;
   the correlation vocabulary only appears to whoever is checking.
2. **True or visible.** A diagram only shows what the data supports; what is uncertain is seen and understood, with
   its source.
3. **Correct once.** Everything the engineer places, annotates or decides survives the following collections and can
   be read in the log.
4. **Explore, then edit.** The application is a map one browses; editing is a complete and pleasant mode, never the
   default state.
5. **From 13 inches to the projector.** One interface, readable at every size and in every light, in French as in
   English.

## Accessibility & Inclusion

No formal requirement established (no imposed standard, no known user need). Floor held on principle: readable
contrast in both themes, complete keyboard, reduced motion respected.
