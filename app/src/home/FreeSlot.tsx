// The free slot: not a widget but the place of the next one, a line-2 frame on the ground with "+" (adding widgets
// comes later), a title and what the home will hold.
import { Plus } from "lucide-react";
import { useId } from "react";
import { IconButton } from "../ui";
import { useText } from "../i18n";

export function FreeSlot() {
  const t = useText();
  const id = useId();
  return (
    <section className="home-slot" data-float="slot" aria-labelledby={id}>
      <IconButton variant="line" label={t("home:slot.add")} icon={<Plus />} disabled disabledReason={t("home:slot.addSoon")} />
      <div>
        <h2 id={id}>{t("home:slot.title")}</h2>
        <p>{t("home:slot.text")}</p>
      </div>
    </section>
  );
}
