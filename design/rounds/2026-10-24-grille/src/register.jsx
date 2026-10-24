// Four structures of the verdicts' register, on the mockup's data (Orhan, 2026-10-24: "the data does not look well
// organized in the table, it lacks structure between the elements"). V0 is the application's register (brick 7a),
// injected as HTML; the four here are rendered from data in the same tile:
//   V1 columns: a real table, severity | verdict (the sentence without its number) | rule | code | how many;
//   V2 the number first: the count large on the left, the sentence beside it, the code once the row is open;
//   V3 by rule: sections per family (cables, aggregates…), the severity as a mark on each row, the code at right;
//   V4 the sentence alone: sections per family, the sentence without its number and its count in the count slot,
//      the code only in the detail.
import { useState } from "react";
import { VERDICTS } from "./verdicts.js";

const SEVERITIES = ["error", "warning", "info"];
const SEV_LABEL = { error: "Erreurs", warning: "Avertissements", info: "Notes" };
const MARK = { error: "err", warning: "warn", info: "info" };
const FAMILIES = ["câbles", "agrégats, MLAG et HA", "états", "identité des voisins", "ports distants", "descriptions", "contrat d'entrée"];
const FAMILY_LABEL = { "câbles": "Câbles", "agrégats, MLAG et HA": "Agrégats, MLAG et HA", "états": "États", "identité des voisins": "Voisins", "ports distants": "Ports distants", "descriptions": "Descriptions", "contrat d'entrée": "Contrat d'entrée" };

const strip = (sentence) => sentence.replace(/^\d+\s+/, "");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function Icon({ name, className = "ico" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

function Targets({ targets }) {
  if (!targets.length) return null;
  return (
    <ul className="targets">
      {targets.map((t) => (
        <li key={t.text}>
          <Icon name={t.icon} />
          <a className="lnk" href="#">{t.text}</a>
        </li>
      ))}
    </ul>
  );
}

const Code = ({ code }) => <span className="code">{code}</span>;
const Mark = ({ severity }) => <span className={`mark ${MARK[severity]}`} />;
const Chevron = ({ open }) => <Icon name="chevron-right" className={`ico chev${open ? " on" : ""}`} />;

/** The groups of a variant: by severity (V1, V2) or by family (V3, V4), each with its count of checks. */
function groupsOf(variant, shown) {
  const rows = VERDICTS.filter((v) => shown[v.severity]);
  const by = (keys, key, label) => keys.map((k) => ({ id: k, label: label(k), rows: rows.filter((v) => v[key] === k) })).filter((g) => g.rows.length);
  return variant === "v3" || variant === "v4" ? by(FAMILIES, "family", (f) => FAMILY_LABEL[f]) : by(SEVERITIES, "severity", (s) => SEV_LABEL[s]);
}

const COLUMNS = {
  v1: [["", "sev"], ["Verdict", "what-h"], ["Règle", "rule"], ["Code", "code-h"], ["Combien", "r"], ["", "chev"]],
  v2: [["", "sev"], ["Combien", "n"], ["Verdict", "what-h"], ["", "chev"]],
  v3: [["", "sev"], ["Verdict", "what-h"], ["Code", "code-h"], ["", "chev"]],
  v4: [["", "sev"], ["Verdict", "what-h"], ["Combien", "r"], ["", "chev"]],
};

function Cells({ variant, v, open }) {
  switch (variant) {
    case "v1":
      return (
        <>
          <td className="sev"><Mark severity={v.severity} /></td>
          <td className="what">{cap(strip(v.sentence))}</td>
          <td className="rule">{v.family}</td>
          <td className="code-col"><Code code={v.code} /></td>
          <td className="r">{v.count}</td>
          <td className="chev-col"><Chevron open={open} /></td>
        </>
      );
    case "v2":
      return (
        <>
          <td className="sev"><Mark severity={v.severity} /></td>
          <td className="n">{v.count}</td>
          <td className="what">{cap(strip(v.sentence))}</td>
          <td className="chev-col"><Chevron open={open} /></td>
        </>
      );
    case "v3":
      return (
        <>
          <td className="sev"><Mark severity={v.severity} /></td>
          <td className="what">{v.sentence}</td>
          <td className="code-col"><Code code={v.code} /></td>
          <td className="chev-col"><Chevron open={open} /></td>
        </>
      );
    default:
      return (
        <>
          <td className="sev"><Mark severity={v.severity} /></td>
          <td className="what">{cap(strip(v.sentence))}</td>
          <td className="r">{v.count}</td>
          <td className="chev-col"><Chevron open={open} /></td>
        </>
      );
  }
}

function Detail({ variant, v }) {
  const meta = variant === "v2" || variant === "v4";
  return (
    <div className="rg-detail-body">
      {meta ? (
        <div className="rg-meta">
          <Code code={v.code} />
          <span>{v.family}</span>
          {variant === "v4" ? <span>{SEV_LABEL[v.severity]}</span> : null}
        </div>
      ) : null}
      <Targets targets={v.targets} />
      {!v.targets.length ? <p className="rg-none">Les éléments concernés s'ouvrent ici (données de la maquette : seul le premier verdict en a).</p> : null}
    </div>
  );
}

export function Register({ variant, shown }) {
  const [open, setOpen] = useState(VERDICTS[0].code);
  const groups = groupsOf(variant, shown);
  const columns = COLUMNS[variant] ?? COLUMNS.v1;
  const span = columns.length;
  return (
    <table className="rg" data-variant={variant}>
      <thead>
        <tr>
          {columns.map(([label, cls], i) => (
            <th key={i} className={cls}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <GroupRows key={g.id} g={g} variant={variant} span={span} open={open} setOpen={setOpen} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ g, variant, span, open, setOpen }) {
  const checks = g.rows.reduce((n, v) => n + v.count, 0);
  return (
    <>
      <tr className="rg-group">
        <th colSpan={span}>
          <span className="rg-group-label">{g.label}</span>
          <span className="rg-group-count">{checks}</span>
        </th>
      </tr>
      {g.rows.map((v) => {
        const isOpen = open === v.code;
        return (
          <RowPair key={v.code} v={v} variant={variant} span={span} isOpen={isOpen} toggle={() => setOpen(isOpen ? null : v.code)} />
        );
      })}
    </>
  );
}

function RowPair({ v, variant, span, isOpen, toggle }) {
  return (
    <>
      <tr className={`rg-row${isOpen ? " open" : ""}`} tabIndex={0} aria-expanded={isOpen} onClick={(e) => { if (!e.target.closest("a")) toggle(); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
        <Cells variant={variant} v={v} open={isOpen} />
      </tr>
      {isOpen ? (
        <tr className="rg-detail">
          <td colSpan={span}><Detail variant={variant} v={v} /></td>
        </tr>
      ) : null}
    </>
  );
}
