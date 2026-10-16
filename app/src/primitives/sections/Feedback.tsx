// Counts, shortcuts, toasts, the scrim; then the tooltip in its placements.
import { Crosshair, Download, Layers, Settings } from "lucide-react";
import { Button, Count, IconButton, Island, Rail, Scrim, Shortcut, showToast, Toast } from "../../ui";
import { useText } from "../../i18n";
import { Row, Section, Specimen } from "../Specimen";

const noop = () => undefined;

export function Feedback() {
  const t = useText();
  return (
    <Section id="feedback" heading={t("primitives:feedback.title")} note={t("primitives:feedback.note")}>
      <Row>
        <Specimen name="counts" caption={t("primitives:feedback.counts")} layout="panel">
          <span className="page-group">
          <span className="page-words">
            {t("primitives:bars.control")} <Count value={6} tone="error" />
          </span>
          <span className="page-words">
            {t("primitives:feedback.warnings")} <Count value={3} tone="warning" />
          </span>
          <span className="page-words">
            {t("primitives:feedback.up")} <Count value={17} tone="ok" />
          </span>
          <span className="page-words">
            {t("primitives:feedback.ports")} <Count value={55} />
          </span>
          </span>
        </Specimen>
        <Specimen name="shortcuts" caption={t("primitives:feedback.shortcuts")} layout="panel">
          <span className="page-group">
            <Shortcut keys={[t("ui:keys.ctrl"), "K"]} />
            <Shortcut keys={["E"]} />
            <Shortcut keys={[t("ui:keys.shift"), "F"]} />
            <Shortcut keys={[t("ui:keys.escape")]} />
          </span>
        </Specimen>
      </Row>
      <Row>
        <Toast name="toast-neutral" duration={null} message={t("primitives:feedback.saved")} action={{ label: t("primitives:feedback.undo"), onClick: noop }} closeLabel={t("ui:close")} onClose={noop} />
        <Toast name="toast-error" duration={null} tone="error" message={t("primitives:feedback.failed")} action={{ label: t("primitives:feedback.retry"), onClick: noop }} closeLabel={t("ui:close")} onClose={noop} />
      </Row>
      <Row>
        <Toast name="toast-ok" duration={null} tone="ok" message={t("primitives:feedback.collected")} closeLabel={t("ui:close")} onClose={noop} />
        <Toast name="toast-warning" duration={null} tone="warning" message={t("primitives:feedback.partial")} closeLabel={t("ui:close")} onClose={noop} />
        <Island name="toast-live" layout="bar">
          <Button variant="line" onClick={() => showToast({ message: t("primitives:feedback.saved"), action: { label: t("primitives:feedback.undo"), onClick: noop } })}>
            {t("primitives:feedback.show")}
          </Button>
        </Island>
      </Row>
      <Row>
        <figure className="page-specimen">
          <div className="page-frame">
            <Scrim open />
            <div className="page-frame-content">
              <Island name="scrim-dialog" layout="panel" className="page-dialog">
                <h3>{t("primitives:feedback.scrimTitle")}</h3>
                <p>{t("primitives:feedback.scrimBody")}</p>
              </Island>
            </div>
          </div>
          <figcaption>{t("primitives:feedback.scrim")}</figcaption>
        </figure>
      </Row>
    </Section>
  );
}

export function Tooltips() {
  const t = useText();
  return (
    <Section id="tooltip" heading={t("primitives:tooltip.title")} note={t("primitives:tooltip.note")} room="tooltip">
      <Row>
        <Specimen name="tip-plain" caption={t("primitives:tooltip.plain")} captionAbove>
          <IconButton label={t("primitives:tooltip.centre")} icon={<Crosshair />} tooltipOpen />
        </Specimen>
        <Specimen name="tip-shortcut" caption={t("primitives:tooltip.shortcut")} captionAbove>
          <IconButton label={t("shell:export")} icon={<Download />} shortcut="E" tooltipOpen />
        </Specimen>
        <Specimen name="tip-disabled" caption={t("primitives:tooltip.disabled")} captionAbove>
          <IconButton label={t("primitives:tooltip.layers")} icon={<Layers />} disabled disabledReason={t("primitives:bars.l2Soon")} tooltipOpen />
        </Specimen>
        <div className="page-tip-rail">
        <Island name="tip-rail" layout="strip">
          <Rail
            name="tip-rail-tabs"
            label={t("primitives:bars.layer")}
            value="l1"
            onChange={noop}
            tooltipOpen
            items={[
              { id: "l1", label: t("primitives:bars.l1") },
              { id: "l2", label: t("primitives:bars.l2"), disabled: true, disabledReason: t("primitives:bars.l2Soon") },
            ]}
          />
        </Island>
        </div>
      </Row>
      <Row>
        <div className="page-edge">
          <Specimen name="tip-edge" caption={t("primitives:tooltip.edge")} captionAbove>
            <IconButton label={t("primitives:tooltip.settingsLong")} icon={<Settings />} tooltipOpen />
          </Specimen>
        </div>
      </Row>
    </Section>
  );
}
