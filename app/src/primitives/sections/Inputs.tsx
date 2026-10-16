// Fields, choices that open a list, segmented choices: rest, focus, filled, invalid, disabled, open.
import { ListFilter } from "lucide-react";
import { useState } from "react";
import { Field, Segmented, Select } from "../../ui";
import { useText } from "../../i18n";
import { INFRASTRUCTURES } from "../sample";
import { Row, Section, Specimen } from "../Specimen";

export function Inputs() {
  const t = useText();
  const [filter, setFilter] = useState("Ethernet1/4");
  const [infrastructure, setInfrastructure] = useState(INFRASTRUCTURES[0]);
  const [scope, setScope] = useState("cabled");
  const options = INFRASTRUCTURES.map((value) => ({ value, label: value }));
  const scopes = [
    { value: "cabled", label: t("primitives:inputs.cabled") },
    { value: "all", label: t("primitives:inputs.all") },
    { value: "down", label: t("primitives:inputs.down"), disabled: true },
  ];
  return (
    <Section id="inputs" title={t("primitives:inputs.title")} note={t("primitives:inputs.note")} room="popover">
      <Row>
        <Specimen name="field-rest" caption={t("primitives:states.rest")}>
          <Field label={t("primitives:inputs.filter")} placeholder={t("primitives:inputs.filter")} icon={<ListFilter />} />
        </Specimen>
        <Specimen name="field-focus" caption={t("primitives:states.focus")}>
          <Field label={t("primitives:inputs.filter")} placeholder={t("primitives:inputs.filter")} icon={<ListFilter />} data-force="focus" />
        </Specimen>
        <Specimen name="field-filled" caption={t("primitives:inputs.filled")}>
          <Field label={t("primitives:inputs.filter")} value={filter} onChange={(event) => setFilter(event.target.value)} icon={<ListFilter />} />
        </Specimen>
        <Specimen name="field-invalid" caption={t("primitives:inputs.invalid")}>
          <Field label={t("primitives:inputs.rule")} defaultValue="name:(" error={t("primitives:inputs.ruleError")} />
        </Specimen>
        <Specimen name="field-disabled" caption={t("primitives:states.disabled")}>
          <Field label={t("primitives:inputs.filter")} placeholder={t("primitives:inputs.filter")} disabled />
        </Specimen>
      </Row>
      <Row>
        <Specimen name="segmented" caption={t("primitives:inputs.segmented")}>
          <Segmented name="scope" label={t("primitives:inputs.scope")} options={scopes} value={scope} onChange={setScope} />
        </Specimen>
        <Specimen name="select-disabled" caption={t("primitives:states.disabled")}>
          <Select name="select-disabled-list" label={t("primitives:bars.infrastructure")} options={options} value={infrastructure} onChange={setInfrastructure} disabled />
        </Specimen>
        <Specimen name="select-open" caption={t("primitives:inputs.open")} captionAbove>
          <Select name="select-open-list" label={t("primitives:bars.infrastructure")} options={options} value={infrastructure} onChange={setInfrastructure} defaultOpen />
        </Specimen>
      </Row>
    </Section>
  );
}
