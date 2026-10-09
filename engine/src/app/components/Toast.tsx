// La ligne d'état : ce que la couche d'intention ou le placement vient de faire (« épingle de X enregistrée »),
// en bas à gauche, qui s'efface d'elle-même ; un envoi en cours garde sa pastille.
import { useEffect } from "react";
import { useStore } from "../state/store";

const SHOWN_MS = 4500;

export function Toast() {
  const { state, dispatch } = useStore();
  const note = state.note;
  useEffect(() => {
    if (!note || note.busy) return;
    const timer = setTimeout(() => dispatch({ type: "note", text: null }), SHOWN_MS);
    return () => clearTimeout(timer);
  }, [note, dispatch]);
  if (!note) return null;
  return <div className={"toast glass" + (note.busy ? " busy" : "")} role="status">{note.text}</div>;
}
