// A list of alerts (DESIGN.md, Alerts): what is to be checked on the selected element, in words. Each line starts
// with the state mark of its severity (error, warning, or the neutral grey of a note), then the sentence; a line
// that carries a detail sets its sentence in body strong and the detail under it in label size, ink-3. Never a
// code: the sentence is the catalogue's, the detail names the ports or aggregates concerned.
import type { ReactNode } from "react";
import type { Tone } from "./Count";
import { Mark } from "./Mark";
import "./Alerts.css";

export type Alert = Readonly<{ id: string; tone: Tone; text: ReactNode; detail?: ReactNode }>;

export function Alerts({ label, items }: { label: string; items: readonly Alert[] }) {
  return (
    <ul className="ui-alerts" aria-label={label}>
      {items.map((alert) => (
        <li key={alert.id} className="ui-alert" data-tone={alert.tone}>
          <Mark tone={alert.tone} />
          <div className="ui-alert-body">
            <p className="ui-alert-text" data-strong={alert.detail ? "" : undefined}>
              {alert.text}
            </p>
            {alert.detail ? <p className="ui-alert-detail">{alert.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
