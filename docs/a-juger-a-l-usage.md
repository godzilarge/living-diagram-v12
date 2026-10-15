# À juger à l'usage

Liste des points qu'Orhan préfère trancher **en se servant de l'application** plutôt que sur un prototype ou une
capture (« sans tester, visuellement, c'est pas facile de juger », 2026-10-14). Un point entre ici avec sa date, le
comportement actuel (prudent) et ce qu'il faudra regarder ; il en sort quand Orhan a tranché, avec la décision écrite
dans le document qui fait foi et dans le journal de `CLAUDE.md`.

| Ajouté le | Point | Comportement actuel | À regarder | Source |
|---|---|---|---|---|
| 2026-10-14 | Barre contextuelle loin d'une grosse sélection | Quand la place manque au-dessus et au-dessous de la sélection, la barre se pose au bord de la zone visible, loin des éléments | Est-elle encore « contextuelle » ? Sinon : la poser sur l'élément principal, ou rouvrir D10 (alignements aussi dans la barre haute) | `docs/11` § Lot 4, question 6 du prototype |
| 2026-10-14 | Pastilles ACTIF / PASSIF cachées à l'ouverture | À l'ouverture (zoom 0,55, sous le palier 0,6), les pastilles de rôle HA et de stack sont cachées | Faut-il un point de couleur sans texte de loin ? | `docs/11` § Lot 5 « Fait » |
| 2026-10-14 | Clic molette pour déplacer la vue | Corrigé au lot 2 sans reproduction (action du navigateur annulée) | Marche-t-il chez Orhan (navigateur, système) ? | `docs/11` § Lot 2 « Fait » |
| 2026-10-14 | Raccourcis Alt de la barre contextuelle | Alt+T donne la main à la barre ; Alt+A / H / D / W / V / S alignent | Alt+D est aussi « barre d'adresse » de Chrome et Firefox, Alt+T le menu Outils de Firefox (Windows / Linux) : la page les prend-elle chez Orhan ? Sinon, autres touches | `docs/11` § Lot 4 « Fait » |
| 2026-10-14 | Ctrl + . masque la barre contextuelle | Vérifié dans Chromium sans écran seulement | Marche-t-il dans le navigateur d'Orhan ? | `docs/11` § Lot 4 |
| 2026-10-14 | La toile ne monte que ce qui se voit (`onlyRenderVisibleElements`) | Un élément entre dans le DOM quand sa boîte entre dans la vue ; un câble quand la boîte de ses deux bouts y entre ; « cadrer tout » monte tout (0,5 s à 500 équipements, contre 0,4 s avant) | Au panoramique, des câbles ou des pastilles qui « apparaissent » au bord de l'écran (la courbe d'un câble, une étiquette de groupe posée hors de son cadre, une ligne de rappel dont l'annotation est hors champ) ? Sinon : garder ; si oui, retirer la culture (une propriété) au prix de la sélection (≈ 290 ms) et du glissé (≈ 25 i/s) à 500 | `docs/11` § Lot 13 « Fait » |
| 2026-10-14 | Alt+G (mettre en grille) | Alt+G met la sélection en grille (trois éléments au moins), comme Alt+A / H / D… alignent ; aussi au volet « aligner et répartir » et au clic droit | La page reçoit-elle Alt+G dans le navigateur d'Orhan (Firefox sous Windows ou Linux peut le prendre pour un menu) ? Sinon, une autre touche | `docs/11` § Lot 8 « Fait » |
| 2026-10-14 | Seuil des repères d'alignement (8 px d'écran) | Un glissé ou un bord tiré se colle à moins de 8 px d'écran d'un centre, d'un bord ou d'un écart égal ; Ctrl tenu s'en passe ; les repères se coupent dans la colonne des réglages | Sur une grosse infrastructure (beaucoup de cartes proches) : trop collant, ou pas assez ? Sinon : garder ; ajuster le seuil (une constante) | `docs/11` § Lot 8 « Fait » |
