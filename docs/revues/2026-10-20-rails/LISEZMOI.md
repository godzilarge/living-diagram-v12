# Les rails de la barre (2026-10-20)

**Remarque d'Orhan**, sur une capture de la barre : « regarde les rails sous les menus Diagram, L1, Change ».
Trois rails, trois hauteurs : l'onglet (46 px) posait le sien sur le filet de l'îlot, comme la maquette
`design/comps/shell` ; la couche et la bascule « changements » (contrôles de 32 px) au pied de leur mot, 8 px plus haut.

**Planche** (`planche.png`) : aujourd'hui, A (tout sur le bord de l'îlot), B (tout sous le mot), clair et sombre.
**Décision : B.** `app/src/ui/Rail.css` : le rail de l'onglet se pose où se pose celui d'un contrôle de 32 px ; la
page des primitives et les scopes de la palette suivent (`apres-b.png`, mesure : les trois rails à la même ligne).
DESIGN.md, Buttons « One height in a bar ». Le rail de la bascule « changements », absent de la maquette, reste : il dit
l'état « changements dessinés sur la toile », allumé par défaut.
