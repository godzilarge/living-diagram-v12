# Revue indépendante — `mlag_peer_link` nullable et refus `mlag_peer_link_with_id` (2026-10-02)

Rapport rendu tel quel par le relecteur (agent indépendant, sondes jetables hors dépôt), suivi en fin de fichier.

**Verdict : conforme à la décision et à la doctrine du contrat ; aucun défaut de correction ni de déterminisme ; deux
écarts de documentation / catalogue (MOYEN) et six points bas, surtout des trous de test.**

Suites exécutées : contracts 413 passed, backend 316 passed, ruff propre. Golden : `ld correlate` sur
`bundle-minimal.json` puis `cmp` ⇒ identique à l'octet.

## CRITIQUE / HAUT

Aucun.

## MOYEN

**M1 — La règle partagée n'est pas rangée dans le catalogue des règles partagées.** `snapshot/codes.py` ajoute
`mlag_peer_link_with_id` à `SNAPSHOT_ERROR_TYPES` avec une seconde formulation alors que `SHARED_ERROR_TYPES` existe
pour ce cas (règle VLAN / mode). Résultat dans `CONTRAT.md` : deux libellés à maintenir à la main, et le code rangé
parmi les refus propres au snapshot au lieu du tableau « Hérités des types partagés ».

**M2 — `backend/README.md` § R4 décrit un cas que B1 ne voit plus, et ne dit rien de `null`.** « Un peer-link marqué
n'est jamais candidat à un domaine, même s'il porte un `mlag_id` (revue, B1) » : ce bundle n'entre plus. Rien ne dit
au lecteur de B1 que `null` est lu comme « pas un drapeau » et que le domaine se forme alors par le repli.

## BAS

**B1 — `docs/05` §2.4 surestime le cas `null` : « aucune paire par peer-link ».** Vrai quand les deux bouts sont
`null`. Sonde `null` d'un seul côté : la paire se forme depuis le bout `true`, `peer_link` désigné, rôles d'un seul
côté, aucun contrôle. C'est le cas parqué « peer-link marqué d'un seul côté », auquel `null` mène désormais aussi.
Côté page, le faisceau n'est pas classé peer-link alors que le domaine en a un (comportement pré-existant du cas
parqué, pas une régression).

**B2 — Deux branches d'affichage non testées.** `tables.js` (`id + " · peer-link non lu"`, `null` avec `mlag_id`) et
`structures.js` (« Membre du domaine MLAG n. » suivi de « Peer-link non lu… ») : la page de test met `null` sur les
Po10, dont `mlag_id` est `null`.

**B3 — Le test « à la porte » ne prouve pas la porte.** `RunBundle` et `SnapshotAggregate` lèvent le même type ; si
l'entrée lâchait, B1 planterait entre les deux contrats et le test resterait vert. Ajouter `exc.value.title ==
"RunBundle"`.

**B4 — Assertion molle dans `test_mlag_peer_link.py`.** `text.count(code) >= 2` passerait avec la partie B absente.

**B5 — Clause devenue morte dans B1.** `structures.py` : `not a.mlag_peer_link` ne filtre plus rien par le contrat ;
le commentaire laisse croire que le cas peut survenir.

**B6 — Le cas `null` n'a pas de test d'ingestion par l'API.** Sondé correct (clé absente ⇒ 201 avec
`nullable_key_absent`, `null` explicite relivré ⇒ 200 `already_present`, peer-link + `mlag_id` ⇒ 422 sans la valeur
dans le corps), rien ne le fige côté backend.

## Points vérifiés sans constat

Règle et branchement dans les deux modèles (`None` + id accepté, `False` + id accepté, `True` + id refusé, `ctx` de
même forme que les autres refus du fichier, message sans valeur) ; golden identique, schémas et `CONTRAT.md` commis =
générés ; les cinq lectures de B1 et de l'intégrité traitent `None` comme `False`, aucun tri ne touche le champ,
déterminisme inter-processus sous trois `PYTHONHASHSEED` ; clé absente comptée `aggregates[].mlag_peer_link`,
garde-fous dérivés du schéma ; anonymiseur neutre (`null` et absence conservés) ; pages cohérentes sur les trois
lectures, aucune chaîne HTML depuis une donnée, test Node réellement exécuté, rendu vérifié en Chromium ;
documentation exacte (`docs/04` disait déjà « nullables » : la brique résout une contradiction ancienne).

## Suivi (2026-10-02)

- **M1 traité** : code déplacé dans `SHARED_ERROR_TYPES`, un seul libellé (partie A), rappel en partie B, `CONTRAT.md`
  régénéré.
- **M2 traité** : `backend/README.md` § R4 corrigé (refus à la porte, lecture de `null`), liste des tests à jour.
- **B3, B4, B5 traités** : `title == "RunBundle"` asserté, assertion coupée sur « Partie B », commentaire de la clause.
- **B1, B2, B6 parqués** (décision d'Orhan : clore la brique, le rituel complet est disproportionné pour un champ).
  Comportement visible et prudent : `null` d'un seul côté ⇒ paire depuis le bout `true`, même cas que « peer-link
  marqué d'un seul côté » déjà parqué dans `docs/05` R4. Ajouté à cette liste.
