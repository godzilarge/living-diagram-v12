"""Cherche le texte d'une langue dans les vidages de l'autre. Usage : scan.py PREFIX LANG"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

DUMPS = Path(__file__).parent / "dumps"
PREFIX, LANG = sys.argv[1], sys.argv[2]
USER = ["Cœur DC01", "Accès DC02", "Salle B, baie 4", "Zone DMZ", "plan de salle", "Français", "Acces", "Cœur", "Accès",
        "baie", "Salle", "salle"]
FR_WORDS = set("""le la les des du une un et aucun aucune pas sur avec sans câble câbles équipement équipements lien liens
voisin voisins retiré retirés ajouté ajoutés changé changés groupe groupes fiche erreur erreurs avertissement avertissements
contrôle contrôles journal épingle épingles ici rien tout tous toutes masquer isoler afficher annuler rétablir supprimer
centrer cadrer insérer note forme tableau image connecteur départ arrivée libre plus moins nom nommé jeton modifié créé
sélection sélectionner aligner répartir sous dans par pour vers depuis jamais toujours est sont été ou qui que quoi
inconnu inconnus injoignable réussie échec collecte""".split())
EN_WORDS = set("""the and of with without device devices cable cables link links neighbour neighbours added removed changed
group groups error errors warning warnings check checks log pin pins nothing all hide isolate show undo redo delete centre
frame insert note shape table image connector start end free more less name token edited created selection select align
distribute under in by for to from never always is are was or who which unknown unreachable successful failed collection
open the latest run search""".split())
BAD_KEYS = re.compile(r"\b(?:shell|panel|common|journal|checks):[a-zA-Z.]+|\b[a-z]+\.[a-z]+[A-Z][a-zA-Z]+\b|\{\{\w+\}\}")

hits = defaultdict(set)
for f in sorted(DUMPS.glob(PREFIX + "*.json")):
    d = json.loads(f.read_text())
    lines = d["text"].split("\n") + d["attrs"] + d["svg"]
    for line in lines:
        clean = line
        for u in USER:
            clean = clean.replace(u, "")
        if BAD_KEYS.search(clean):
            hits["KEY? " + clean.strip()[:160]].add(f.stem)
        words = re.findall(r"[A-Za-zÀ-ÿœŒ']+", clean.lower())
        if LANG == "en":
            acc = [w for w in words if re.search(r"[à-ÿœ]", w)]
            fr = [w for w in words if w in FR_WORDS and w not in EN_WORDS]
            if acc or len(fr) >= 1:
                hits[clean.strip()[:200]].add(f.stem)
        else:
            en = [w for w in words if w in EN_WORDS and w not in FR_WORDS]
            if en:
                hits[clean.strip()[:200]].add(f.stem)
for line, files in sorted(hits.items()):
    fs = sorted(files)
    print(f"{line!r}  <- {len(fs)}: {', '.join(x.replace(PREFIX, '') for x in fs[:4])}")
