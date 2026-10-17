#!/usr/bin/env bash
# Revue brique 6 : les fonctions d'édition de la v1 (fiches de l'inspecteur, palette des types) que l'application v2
# n'atteint ni par la palette, ni par une barre, ni par le menu du clic droit, ni au clavier.
# Lancer depuis la racine du dépôt : bash docs/revues/2026-10-16-edition-sondes/fonctions-v1.sh
set -u
v1=engine/src/app/components
v2=app/src
check() { # $1 = ce que la v1 fait, $2 = motif dans la v1, $3 = motif attendu dans la v2
  local where; where=$(grep -rlE "$2" "$v1" | tr '\n' ' ')
  if grep -rqE "$3" "$v2"; then echo "atteint    | $1"; else echo "MANQUANT   | $1 (v1 : $where)"; fi
}
check "retirer un membre d'un groupe (op group_remove)"          "commands\.groupRemove"                 "groupRemove"
check "teinte d'un type d'équipement (op color_type)"             "commands\.colorType"                   "colorType|onTypeColor"
check "description d'un groupe"                                   "groupUpdate\(group\.id, \{ description" "groupUpdate\([^)]*description"
check "étiquette d'un connecteur (en place sur la toile : atteint)"  "update\(\{ label \}\)"                 "onConnector"
check "police / couleur / alignement vertical du texte"           "text_valign|text_font"                 "text_valign|text_font"
check "style du cadre d'un groupe (marge, épaisseur, étiquette)"  "StyleSections"                         "(padding|label_size|label_weight|label_placement): (Number|value)"
check "courbure numérique d'un connecteur (bend)"                 "connector\.bend"                       "bend: [^0]"
