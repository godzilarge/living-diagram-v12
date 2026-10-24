// A motion token read back as milliseconds (DESIGN.md, Motion): the built sheet minifies `240ms` into `.24s`, so the
// unit is read, never assumed. Pure, tested under Node.

const DURATION = /^(-?(?:\d+\.?\d*|\.\d+))(ms|s)$/;

/** The milliseconds a CSS duration says (`240ms`, `.24s`, `0.24s`); 0 for anything else. */
export function durationMs(text: string): number {
  const found = DURATION.exec(text.trim());
  if (!found) return 0;
  const value = Number(found[1]);
  const ms = found[2] === "s" ? value * 1000 : value;
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}
