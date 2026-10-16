// The logo mark (DESIGN.md, Logo mark): two squares, ink and accent, joined by a wire; 20 px; never the name beside it.
import "./LogoMark.css";

export function LogoMark() {
  return (
    <svg className="ui-logo" viewBox="0 0 24 24" aria-hidden="true">
      <rect className="ui-logo-ink" x="2" y="2" width="9" height="9" rx="1.5" />
      <path className="ui-logo-wire" d="M11 6.5H17.5V13" />
      <rect className="ui-logo-accent" x="13" y="13" width="9" height="9" rx="1.5" />
    </svg>
  );
}
