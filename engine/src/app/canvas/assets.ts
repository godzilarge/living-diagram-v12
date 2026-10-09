// Les images des annotations (docs/10 §6) : lues par l'API avec le jeton, montrées par une adresse `blob:` (CSP
// `img-src 'self' blob:`), jamais le jeton dans une adresse. Un fichier lu une fois sert à toutes les annotations qui
// le citent ; une lecture en échec rend `""` (la toile écrit le texte de remplacement).
import { useEffect, useState } from "react";

const cache = new Map<string, Promise<string>>();
let reader: ((asset: string) => Promise<string>) | null = null;
/** La page branche ici comment lire un fichier (session courante) ; sans lecteur, aucune image ne se charge. */
export const setAssetReader = (next: ((asset: string) => Promise<string>) | null): void => { reader = next; cache.clear(); };

export function loadAsset(asset: string): Promise<string> {
  const known = cache.get(asset);
  if (known) return known;
  const read = reader ? reader(asset).catch(() => "") : Promise.resolve("");
  cache.set(asset, read);
  return read;
}

/** `null` tant que la lecture est en cours, `""` si elle a échoué, sinon l'adresse `blob:` ; rien sans empreinte. */
export function useAsset(asset: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (!asset) return undefined;
    void loadAsset(asset).then((found) => { if (alive) setUrl(found); });
    return () => { alive = false; };
  }, [asset]);
  return asset ? url : "";
}
