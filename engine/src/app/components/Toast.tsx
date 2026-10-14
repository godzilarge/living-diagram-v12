// La ligne d'état : ce que la couche d'intention ou le placement vient de faire (« épingle de X enregistrée »),
// en bas à gauche, qui s'efface d'elle-même ; un envoi en cours garde sa pastille. Une ligne peut proposer une action
// (lot 2 de docs/11 : Suppr sur un équipement dit qu'il vient de la donnée et propose de le masquer) : elle reste plus
// longtemps, et son bouton la ferme.
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../state/store";
import { Button } from "../ui";

const SHOWN_MS = 4500, OFFER_MS = 9000;

export function Toast() {
  const { state, dispatch, commands } = useStore();
  const { t } = useTranslation();
  const note = state.note;
  useEffect(() => {
    if (!note || note.busy) return;
    const timer = setTimeout(() => dispatch({ type: "note", text: null }), note.offer ? OFFER_MS : SHOWN_MS);
    return () => clearTimeout(timer);
  }, [note, dispatch]);
  if (!note) return null;
  const offer = note.offer;
  return (
    <div className={"toast glass" + (note.busy ? " busy" : "") + (offer ? " with-offer" : "")} role="status">
      <span>{note.text}</span>
      {offer ? <Button className="toast-action" onClick={() => { commands.hideHosts(offer.hosts); dispatch({ type: "note", text: null }); }}>{t("messages.hideOffer")}</Button> : null}
    </div>
  );
}
