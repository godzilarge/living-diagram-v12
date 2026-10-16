// Icon buttons and buttons in every state: rest, hover, focus, current, disabled, danger, loading.
import { Download, Grid3x3, Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "../../ui";
import { useText } from "../../i18n";
import type { TextKey } from "../../i18n";
import { Row, Section, Specimen } from "../Specimen";

type State = "rest" | "hover" | "focus" | "current" | "disabled" | "danger" | "loading";
const STATES: readonly State[] = ["rest", "hover", "focus", "current", "disabled", "danger", "loading"];
const STATE_KEYS: Record<State, TextKey> = {
  rest: "primitives:states.rest",
  hover: "primitives:states.hover",
  focus: "primitives:states.focus",
  current: "primitives:states.current",
  disabled: "primitives:states.disabled",
  danger: "primitives:states.danger",
  loading: "primitives:states.loading",
};

/** The props that put a control in a state without the pointer. */
function stateProps(state: State) {
  return {
    "data-force": state === "hover" || state === "danger" ? ("hover" as const) : state === "focus" ? ("focus" as const) : undefined,
    pressed: state === "current" ? true : undefined,
    disabled: state === "disabled" || undefined,
    danger: state === "danger" || undefined,
    loading: state === "loading" || undefined,
  };
}

export function IconButtons() {
  const t = useText();
  const iconOf = (state: State) => (state === "danger" ? <Trash2 /> : state === "current" ? <Grid3x3 /> : <Download />);
  const labelOf = (state: State) => (state === "danger" ? t("primitives:controls.delete") : state === "current" ? t("primitives:bars.grid") : t("shell:export"));
  return (
    <Section id="icon-button" title={t("primitives:controls.iconTitle")} note={t("primitives:controls.iconNote")}>
      <Row>
        {STATES.map((state) => (
          <Specimen key={state} name={`icon-${state}`} caption={t(STATE_KEYS[state])}>
            <IconButton
              label={labelOf(state)}
              icon={iconOf(state)}
              disabledReason={state === "disabled" ? t("shell:exportSoon") : undefined}
              {...stateProps(state)}
            />
          </Specimen>
        ))}
      </Row>
    </Section>
  );
}

export function Buttons() {
  const t = useText();
  const primary: readonly State[] = ["rest", "hover", "focus", "disabled", "loading"];
  return (
    <Section id="button" title={t("primitives:controls.buttonTitle")} note={t("primitives:controls.buttonNote")}>
      <Row>
        {STATES.map((state) => (
          <Specimen key={state} name={`button-${state}`} caption={t(STATE_KEYS[state])}>
            <Button icon={state === "danger" ? <Trash2 /> : undefined} {...stateProps(state)}>
              {state === "danger" ? t("primitives:controls.delete") : t("primitives:controls.compare")}
            </Button>
          </Specimen>
        ))}
      </Row>
      <Row>
        {primary.map((state) => (
          <Specimen key={state} name={`primary-${state}`} caption={t("primitives:controls.primary", { state: t(STATE_KEYS[state]) })}>
            <Button variant="primary" {...stateProps(state)}>
              {t("primitives:controls.openPanel")}
            </Button>
          </Specimen>
        ))}
        <Specimen name="line-rest" caption={t("primitives:controls.line")}>
          <Button variant="line" icon={<Plus />}>
            {t("primitives:controls.add")}
          </Button>
        </Specimen>
        <Specimen name="choice-rest" caption={t("primitives:controls.choice")}>
          <Button chevron>{t("primitives:controls.compareWith")}</Button>
        </Specimen>
      </Row>
    </Section>
  );
}
