_Rapport d'un agent de recherche, consigné tel que rendu, pour `docs/11-audit-ui-edition-et-plan.md` §9.3. Sept éditeurs plus un outil réseau, pages officielles seulement ; « non trouvé » = absent des pages atteintes. Deux limites dites par l'agent : le code du bouton de l'exemple « Download Image » de React Flow n'était pas lisible en texte (recette donnée de mémoire, non revérifiée) ; help.miro.com bloque le fetch direct, lu via l'API Zendesk._

# Benchmark : ergonomie d'édition des éditeurs de diagrammes (2026-10-13)

**Méthode.** Sept éditeurs plus un outil réseau, lus sur leurs pages officielles (aide, docs SDK, code source public) ; React Flow 12 sur reactflow.dev et le dépôt xyflow. « non trouvé » = absent des pages atteintes, jamais deviné. Les clés `[D3]`, `[L5]`… renvoient aux sources sous chaque fiche ; citations en anglais ; raccourcis en forme Windows (Mac : ⌘ pour Ctrl, Option pour Alt).

## 1. Fiches produit

### draw.io / diagrams.net
1. Ctrl+C/V/X ; `Ctrl+D` ou `Ctrl+Enter` duplique ; `Ctrl+Drag` clone, `Alt+Drag` déplace sans aimant [D1][D2]. **Dupliquer décale de `gridSize` = +10/+10 px ; coller cumule +10 par collage** (`STEPSIZE: 10`, `insertCount++`) [D3]. Copy/Paste Style `Alt+C / V`, texte seul `Ctrl+Alt+C / V`, Copy/Paste Size `Alt+Shift+F / V` [D4][D1].
2. Aucune barre flottante ; panneau Format droit, onglets Style / Text / Arrange, `Ctrl+Shift+P` [D5].
3. 8 poignées (`createSizers`) ; Maj = proportions, Ctrl = depuis le centre ; champs W/H/Left/Top ; « match size » = Copy/Paste Size [D6][D3].
4. Grille 10 pt = aimant (`Ctrl+Shift+G`) ; guides bleus bords et centres ; Align (6), Distribute ; cotes : non trouvé [D7].
5. Survol = quatre flèches bleues (clic = clone connecté) ; croix = points fixes ; **drop sur le contour bleu = flottant, sur la croix verte = fixe** ; waypoints ajoutés en glissant ; droit / orthogonal / courbe ; **« Auto-route around shapes » par connecteur** [D8][D9].
6. `Ctrl+Shift+F / B`, `Ctrl+Alt+Shift+F / B` ; calques `Ctrl+Shift+L` (œil, cadenas) ; `Ctrl+L` verrouille [D10].
7. Rectangle = entièrement enclos, **`Alt+drag` = touché** ; Maj / Ctrl+clic ; `Ctrl+Shift+I / E` sommets / arêtes ; Tab ; Esc [D2][D1].
8. Ctrl+molette ; Espace, clic droit ou molette = pan ; `Ctrl+Shift+H` fit (« If shapes are selected, it zooms to the selection ») ; `Enter` 100 % ; aide-mémoire SVG [D11][D1].
9. Taper remplace le libellé ; `Enter / F2` ; HTML riche ; trois étiquettes par connecteur [D12].
10. Layout : Flow, Tree, Radial, Organic, Org Chart, Orthogonal Routing, Circle (ELK), page entière ou **contenu du conteneur sélectionné** [D13].
11. PNG / SVG / PDF / VSDX (bêta) ; `Selection Only`, `Transparent background`, zoom, DPI ; Presentation Mode, lightbox [D14].
12. Curseurs et changements en direct **seulement** via Drive, OneDrive, Confluence, Nextcloud ; historique et commentaires délégués au stockage [D15].

Sources : [D1] https://app.diagrams.net/shortcuts.svg · [D2] https://www.drawio.com/docs/reference/shortcuts/modifier-shortcuts-in-diagrams/ · [D3] https://github.com/jgraph/drawio/blob/dev/src/main/webapp/mxgraph/src/util/mxClipboard.js, …/handler/mxVertexHandler.js · [D4] https://www.drawio.com/docs/reference/shortcuts/shortcut-styles/ · [D5] https://www.drawio.com/docs/manual/editor/panels/ · [D6] https://www.drawio.com/doc/faq/shape-resize · [D7] https://www.drawio.com/docs/manual/editor/alignment-tools/ · [D8] https://www.drawio.com/doc/faq/connector-fixed-vs-floating · [D9] https://www.drawio.com/docs/manual/connectors/connectors-auto-route/ · [D10] https://www.drawio.com/docs/manual/layers/, https://www.drawio.com/doc/faq/lock-elements · [D11] https://www.drawio.com/doc/faq/zoom · [D12] https://www.drawio.com/docs/manual/connectors/connector-labels/ · [D13] https://www.drawio.com/docs/manual/layouts/ · [D14] https://www.drawio.com/docs/manual/export/export-to-png/ · [D15] https://www.drawio.com/doc/faq/share-diagrams

### Lucidchart
1. `Ctrl+D` ; clone par `Alt+drag` (blog) ou `Ctrl+Shift+drag` (aide) ; décalage non documenté, coller en place « is not something that is possible » ; Copy/Paste Style, **Paint Format** persistant au double-clic [L1][L2].
2. Éditeur 2026 : **Shape Editing Bar** « dynamic, so it only shows the controls that are relevant to what you have selected » (couleurs, texte, lien, cadenas, accès au Right Panel), déplaçable ; panneau droit pour trait, taille, attributs [L3].
3. Carrés bleus (nombre non chiffré) ; Maj = proportions ; L/H, rotation ; **`Match Size` largeur / hauteur / les deux** ; sélection multiple scalée d'un bloc [L2][L4].
4. Grille, `Snap to objects`, guides ; **« Dotted lines show matching edges; a solid line shows matching centerpoints », « Measurements show the distance between two objects »** ; Align relatif à la forme cliquée, Distribute (≥ 3) [L5][L6].
5. **Points rouges au survol ou au clic** ; « smart line » = tenir sur la cible (flottant) vs extrémité posée (fixe) ; Elbow par défaut, joints, line jumps ; auto-routing dans les grid layouts seulement [L6][L7][L12].
6. `Ctrl+Alt+] / Ctrl+] / Ctrl+[ / Ctrl+Alt+[` ; quatre verrous ; calques par page [L5][L8][L1].
7. **Rectangle = tout ce qu'il touche, non réglable** ; Maj+clic ; `Select > Shapes with Same` ; Tab en mode clavier [L9][L5].
8. `Ctrl+0`, Espace+glissé, zoom % en bas à droite (zoom to content, reset, minimap) ; aide `F1` [L1][L10].
9. Double-clic ; gras, listes, liens, Markdown ; étiquette de ligne glissable [L11][L7].
10. Auto Layout Grid / Hierarchy ; Tidy up et grid layout sur la sélection [L4][L12].
11. PDF / PNG / JPEG / SVG / VSDX, Crop to content, transparent ; Presentation Builder [L13].
12. Curseurs, Follow, cursor chat ; commentaires ; **Compare Selected Versions** [L14].

Sources : [L1] https://community.lucid.co/product-questions-3/list-of-available-keyboard-shortcuts-in-lucid-11502 · [L2] https://help.lucid.co/hc/en-us/articles/16390096079764 · [L3] https://community.lucid.co/community-news-and-announcements-9/edit-and-format-shapes-in-lucidchart-13976 · [L4] https://help.lucid.co/hc/en-us/articles/16300314888724 · [L5] https://help.lucid.co/hc/en-us/articles/14589107304468 · [L6] https://help.lucid.co/hc/en-us/articles/15578781626772 · [L7] https://help.lucid.co/hc/en-us/articles/16157138194836 · [L8] https://help.lucid.co/hc/en-us/articles/16296419779476 · [L9] https://community.lucid.co/product-questions-3/area-select-partially-enclosed-shapes-selected-4188 · [L10] https://help.lucid.co/hc/en-us/articles/15154609056916 · [L11] https://help.lucid.co/hc/en-us/articles/16361791013524 · [L12] https://help.lucid.co/hc/en-us/articles/34727996594324 · [L13] https://help.lucid.co/hc/en-us/articles/16324571257492 · [L14] https://help.lucid.co/hc/en-us/articles/13893815605268, …/16726269725204, …/16079471374996

### Microsoft Visio (web / desktop)
1. `Ctrl+D` (web) ; « hold the Ctrl key while you drag » = double ; collé **« centered on the page »** (web), même place (desktop) ; Format Painter `Ctrl+Shift+C / V` [V1][V2][V3].
2. Desktop : Mini toolbar au clic droit, volet Format Shape (F3) ; web : « floating toolbar » et volet Format Options (L/H par 0,25 pt) [V4][V5].
3. **« Each 2-D shape has 8 selection handles »** ; coin = proportionnel ; multi-sélection = un rectangle à 8 poignées ; Size & Position : « To make several shapes the same size, select them and enter values » [V5].
4. **Dynamic Grid** « alignment, spacing, and resizing guides… gently 'snaps' » ; Snap & Glue ; `Ctrl+Shift+L/S/R/E/M/Z`, Distribute, Auto Align & Space [V6][V1].
5. AutoConnect au survol (flèches ; web : « four gray triangle and circle tools ») ; **point = « static connection », corps = « dynamic connection », bouts collés verts** ; coudé par défaut ; « The default Dynamic connector can re-route itself around other shapes » (desktop) [V7].
6. `Ctrl+Shift+F / B`, Forward / Backward ; calques Visible / Lock / Snap / Glue (Plan 1-2 sur le web) [V8][V1].
7. Desktop : Area et Lasso Select, « completely within the selection area » sauf option « partially within » ; Select by Type ; Tab [V9]. Web : règle non trouvée [V2].
8. Desktop `Ctrl+Shift+W` fit, Ctrl+Maj = loupe et rectangle, Ctrl+molette ; web curseur en bas à droite, Pan & Zoom ; aide via Help [V10][V1].
9. `F2`, double-clic ; connecteur = une boîte, « yellow handle along the connector » [V11].
10. **Re-Layout Page : Flowchart, Hierarchy, Compact Tree, Radial, Circular**, sur la sélection sinon « the entire diagram » [V12].
11. PNG / JPG / SVG / PDF, « select the shapes you want to export » ; web PNG transparent ; Presentation Mode F5 (desktop) [V13].
12. Web : sélection d'autrui = **« colored border on its bounding box »**, timeout 10 min ; commentaires ; curseurs, follow : non trouvé [V14].

Sources : [V1] https://support.microsoft.com/en-us/office/keyboard-shortcuts-for-visio-ee952f31-7e3e-4564-8116-f3ecbb733cc1 · [V2] https://support.microsoft.com/en-gb/office/select-copy-and-move-shapes-in-visio-for-the-web-0ec11994-4001-40d0-aa19-0ffb2c14c358 · [V3] https://support.microsoft.com/en-us/visio/copy-the-fill-and-formatting-from-one-shape-to-another · [V4] https://support.microsoft.com/en-us/office/format-a-shape-in-visio-e618442e-f0d0-42a4-be21-4cff36d726d3 · [V5] https://support.microsoft.com/en-us/visio/resize-a-shape, https://support.microsoft.com/en-us/office/change-the-size-rotation-and-order-of-a-shape-in-visio-for-the-web-54ac4683-c0bf-426d-a7b5-11dc64e2ed2b · [V6] https://support.microsoft.com/en-us/visio/improve-shape-placement-by-using-the-dynamic-grid · [V7] https://support.microsoft.com/en-us/office/add-connectors-between-visio-shapes-eaa045c8-5ce9-4d4b-bd30-bb87dc8ac65a, https://support.microsoft.com/en-us/visio/glue-or-unglue-connectors · [V8] https://support.microsoft.com/en-us/visio/use-layers-to-set-properties-for-multiple-shapes · [V9] https://support.microsoft.com/en-us/office/shape-selection-tools-812c8f5a-e7c4-40ed-82f0-c796916878b3 · [V10] https://support.microsoft.com/en-us/office/zoom-and-pan-in-a-diagram-f9ee5535-7402-4e97-8b93-127e3ecbf027 · [V11] https://support.microsoft.com/en-us/visio/add-and-edit-connector-text · [V12] https://support.microsoft.com/en-us/office/re-layout-a-diagram-in-visio-abfd3fbd-c2a8-4c11-bc4c-789466e6aedb · [V13] https://support.microsoft.com/en-us/office/save-a-visio-diagram-as-a-graphic-or-image-file-94c892d1-523c-4073-882d-c8ee2ff65d18 · [V14] https://support.microsoft.com/en-us/office/work-together-on-visio-drawings-413c0b5a-0d52-4ace-af85-8b9bf115bbbf

### Miro
1. `Ctrl+D`, **`Alt+drag`**, `Alt+flèche` duplique dans une direction ; style `Ctrl+Alt+C / V` ; décalage non trouvé [M1][M2].
2. **« its context menu will appear horizontally above the object »**, Maj tenu le cache ; pas de panneau : couleur, bordure, opacité, coins, texte, Switch type, « … » ; connecteur : pointes, droit / orthogonal / courbe, +T [M3][M4][M7].
3. « white nodes on the corners » (4 documentées) ; Maj = ratio ; **Alt = « keeping its center attached »** ; cotes L × H bleues ; champs px en Focus mode Diagramming seulement [M4][M5][M6].
4. **« blue smart guidelines… indicating equal spacing »** ; grille Line / Dot (`G`), Ctrl suspend ; Align ; poignée « Auto layout » pour répartir [M6][M9].
5. **Points bleus à la sélection** : clic = objet lié créé, glissé = ligne ; point central = flottant (« won't cross the objects »), côté = ancre ; waypoints, Maj = H/V, line jumps [M7][M6].
6. PgUp / PgDn (+ Maj) ; calques sur tous les plans ; `Ctrl+Shift+L`, Protected Lock [M8][M1].
7. **« every object touched by selection »**, règle des 90 % en précis / lasso ; Maj ou Ctrl+clic ; Filter by type ; Tab [M8][M1].
8. `Ctrl+0`, **`Alt+1` fit, `Alt+2` sélection**, Espace+glissé ; % en bas à droite ; `F1` / `?` [M1].
9. Double-clic / Entrée ; gras, listes, liens ; **plusieurs étiquettes par ligne, glissables** [M2][M7].
10. Auto layout sur sélection ; mind map, Mermaid, org chart seulement [M9].
11. Image Small / Medium / Large / **Vector (PDF, SVG)**, PDF par frame ; transparent non trouvé ; Presentation mode [M10].
12. Curseurs, Follow, « Bring everyone to me » ; commentaires ; historique 90 jours, **« See recent changes » en rose** [M11].

Sources : [M1] https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys · [M2] https://help.miro.com/hc/en-us/articles/360017572094-Text · [M3] https://help.miro.com/hc/en-us/articles/11997028019858, https://help.miro.com/hc/en-us/articles/360017730553-Toolbars · [M4] https://help.miro.com/hc/en-us/articles/360017730713-Shapes · [M5] https://help.miro.com/hc/en-us/articles/32903445474706-Precise-resizing · [M6] https://help.miro.com/hc/en-us/articles/4403634496402-Miro-for-mapping-diagramming · [M7] https://help.miro.com/hc/en-us/articles/360017730733-Connection-lines · [M8] https://help.miro.com/hc/en-us/articles/360017730953-Working-with-objects, …/20258488000786-Layers, …/4408887253778 · [M9] https://help.miro.com/hc/en-us/articles/360017730973-Structuring-board-content · [M10] https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board, …/34307373858450-Presentation-mode · [M11] https://help.miro.com/hc/en-us/articles/360013358479-Attention-management, …/360017730873-Comments, …/360021668819

### FigJam (Figma)
1. `Ctrl+D` ou **`Alt+drag`** ; Figma : le double est « placed on top of the original », puis `Ctrl+D` répète « the same spacing » d'un Alt+glissé ; Copy/Paste properties `Ctrl+Alt+C / V` [F1][F2][F3].
2. Pas de panneau : **une barre apparaît sur la sélection**, typée (sticky : couleur, auteur ; forme : couleur, opacité, texte ; connecteur : embouts, trait ; ≥ 3 objets : Tidy up ; verrouillé : cadenas seul) [F2][F4][F5][F7][F8].
3. Bords + coins ; Maj = uniforme, **Alt = depuis le centre** ; champs numériques non trouvés (Figma : W/H, lock ratio) [F6][F12].
4. Guides et grille FigJam non trouvés ; alignement « only… to other objects » ; **Tidy up** (lignes roses, points de réordonnancement) ; Figma `Alt+A/D/W/S`, `Alt+H/V` [F7][F12].
5. Coudé `X`, droit `L` ; extrémité **accrochée à un côté, Ctrl pour la poser n'importe où** ; « wrap around objects » ; Quick create `Ctrl+Enter` [F5][F2].
6. `]` / `[`, `Ctrl+]` / `Ctrl+[` ; pas de calques ; `Ctrl+Shift+L` [F7][F8].
7. **« Any object that the box selection touches will be selected »** ; Maj+clic ; aide `Ctrl+Shift+?` [F7][F9].
8. `H`, Espace, Ctrl+molette ; **`Shift+1` fit, `Shift+2` sélection** ; % en haut à droite [F9].
9. Point text vs area text ; gras, barré, listes, Markdown, lien ; étiquette de connecteur gras / barré [F4][F5].
10. Tidy up sur la sélection seulement [F7].
11. PNG / JPG / PDF, « Export selection », transparent ; **« SVG exports from FigJam aren't currently supported »** [F10].
12. 200 curseurs, cursor chat, Follow ; commentaires ; historique nommé [F11].

Sources : [F1] https://help.figma.com/hc/en-us/articles/4409078832791 · [F2] https://help.figma.com/hc/en-us/articles/1500004414382 · [F3] https://help.figma.com/hc/en-us/articles/4412765442967 · [F4] https://help.figma.com/hc/en-us/articles/1500004291281 · [F5] https://help.figma.com/hc/en-us/articles/1500004414542 · [F6] https://help.figma.com/hc/en-us/articles/1500006206242 · [F7] https://help.figma.com/hc/en-us/articles/1500004292221 · [F8] https://help.figma.com/hc/en-us/articles/1500004291361 · [F9] https://help.figma.com/hc/en-us/articles/1500004414582, …/360040328653 · [F10] https://help.figma.com/hc/en-us/articles/4407699832855 · [F11] https://help.figma.com/hc/en-us/articles/1500006775761, …/360040322673, …/1500004290941, …/360038006754 · [F12] https://help.figma.com/hc/en-us/articles/360039956914

### Excalidraw
1. `Ctrl+D` ou `Alt+drag` ; **décalage `DEFAULT_GRID_SIZE / 2` = +10/+10 px** ; styles `Ctrl+Alt+C / V` ; copie PNG `Shift+Alt+C` [E1][E2].
2. Pas de barre flottante ; panneau fixe à prédicats par type (Stroke, Background, Fill, width, style, Sloppiness, Edges, Arrow type Sharp / Curved / Elbow, fonte, Opacity, Layers, Align, Actions) [E3].
3. 8 poignées + rotation ; **multi-sélection = coins seuls** ; Maj = proportions, « hold Alt to resize from the center » ; `MIN_WIDTH_OR_HEIGHT = 1` ; L/H/angle derrière `Alt+/` [E4][E1].
4. Grille `Ctrl+'` ; **« Snap to objects » `Alt+S`, `SNAP_DISTANCE = 8` px / zoom, accroches de gaps, Ctrl inverse** ; align `Ctrl+Shift+flèches`, distribute `Alt+H / V` [E5][E1].
5. Flèche `A` : liaison flottante par défaut, **« Hold Ctrl to disable binding, or Alt to bind at a fixed point »** ; **coudées (PR #8299, 2024) à point fixe qui contournent les formes** ; `Ctrl+flèche` crée le nœud connecté [E1][E6].
6. `Ctrl+[ / ]`, `Ctrl+Shift+[ / ]` ; pas de calques ; `Ctrl+Shift+L` [E1].
7. Rectangle **« contain » par défaut, préférence Wrap / Overlap** ; `Alt+drag` = lasso (PR #9169, 2025) ; `Ctrl+clic` deep select ; `Alt+clic` cycle [E5][E7][E1].
8. `Ctrl+0`, `Shift+1`, `Shift+2`, Espace ; `?` = aide ; bouton % en bas à gauche [E1].
9. Entrée ou double-clic ; texte brut ; conteneurs avec retour à la ligne [E1][E3].
10. Aucun arrangement ; Mermaid → éléments [E3].
11. **« Only selected », « Background », « Dark mode », « Embed scene », Scale 1 / 2 / 3** ; PNG / SVG / presse-papiers ; Zen et View mode [E8].
12. Salle chiffrée de bout en bout, curseurs, Follow ; commentaires et versions = Excalidraw+ [E9].

Sources : [E1] https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/HelpDialog.tsx · [E2] https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/actions/actionDuplicateSelection.tsx · [E3] https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/Actions.tsx · [E4] https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/transformHandles.ts · [E5] https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/snapping.ts, …/appState.ts · [E6] https://github.com/excalidraw/excalidraw/pull/8299, https://plus.excalidraw.com/blog/building-elbow-arrows-part-one · [E7] https://github.com/excalidraw/excalidraw/pull/9169 · [E8] https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/ImageExportDialog.tsx, https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export · [E9] https://plus.excalidraw.com/pricing

### tldraw (app et SDK 5.x)
1. `Ctrl+D` ; **duplicata posé à droite à `adjacentShapeMargin` = 10 px** ; `Alt+drag` clone et **programme l'offset des `Ctrl+D` suivants** ; collage « in place if any are on screen », sinon centré ; `Ctrl+Alt+V` au curseur ; style par survol `Shift+Q` [T1][T2][T3].
2. StylePanel en haut à droite (couleur, fill, dash, size, font, alignements, pointes, arrow kind) ; **RichTextToolbar flottante** à l'édition [T4][T1].
3. 8 poignées ; `isAspectRatioLocked = shiftKey`, Alt = centre ; une échelle pour la multi-sélection ; aucun champ L/H [T5].
4. **Aimant = geste : « hold Ctrl… while translating, resizing »** (snap mode inverse), bords / centres / **gaps « spacing measurement lines »**, 8 px ; grille `Ctrl+'` ; `Alt+A/D/W/S/H/V`, distribute `Alt+Shift+H/V`, stretch, stack, pack [T6][T1].
5. Flèche `A` ; binding « precise when moving slowly, and exact when holding the alt key » ; **coudées v3.13 « right-angle routing that goes around obstacles »** ; étiquette glissable [T7].
6. `]` / `[`, `Alt+] / [` ; forward « only passes shapes they overlap » ; pas de calques ; `Shift+L` [T8][T1].
7. **Rectangle = touché, `Ctrl` tenu = enclos seulement, `Alt` = lasso « scribble »** ; Maj et Ctrl+clic ; Tab [T9].
8. `Shift+0 / 1 / 2` ; molette = pan, Ctrl = zoom ; Espace ; % sur le bouton ; aide `Ctrl+Alt+/` [T10][T1].
9. Double-clic ou Entrée ; **rich text TipTap** ; `autoSize` par défaut, glissé horizontal = largeur fixe [T11][T4].
10. Aucun auto-layout [T1].
11. SVG / PNG sélection ou tout, `toggle-transparent` ; API **`editor.toImage(shapes, { format, scale, background, darkMode, padding })`** ; readonly [T12].
12. `@tldraw/sync` : présence = curseur, sélection, viewport ; Follow ; commentaires = paquet licencié 5.3 ; pas d'historique [T13].

Sources : [T1] https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/ui/context/actions.tsx · [T2] https://tldraw.dev/sdk-features/clipboard, https://tldraw.dev/reference/editor/defaultTldrawOptions · [T3] https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/tools/SelectTool/childStates/Translating.ts · [T4] https://tldraw.dev/sdk-features/styles, https://tldraw.dev/sdk-features/rich-text · [T5] https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/tools/SelectTool/childStates/Resizing.ts · [T6] https://tldraw.dev/sdk-features/snapping · [T7] https://tldraw.dev/examples/arrows-precise-exact, https://tldraw.dev/releases/v3.13.0 · [T8] https://tldraw.dev/examples/z-order, https://tldraw.dev/sdk-features/locked-shapes · [T9] https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/tools/SelectTool/childStates/Brushing.ts, …/ScribbleBrushing.ts · [T10] https://tldraw.dev/sdk-features/camera · [T11] https://tldraw.dev/sdk-features/text-shape · [T12] https://tldraw.dev/sdk-features/image-export · [T13] https://tldraw.dev/sdk-features/collaboration, …/user-following, …/commenting, …/history

### Outil réseau : netbox-topology-views (plugin NetBox, v4.7.0)
Choisi parce que seul son README documente le glissé, la sauvegarde des positions et l'export ; netTerrain n'a que des billets de 2017 (snap-to-grid par diagramme, bend points) derrière un portail, D2 et diagrams.mingrammer sont du code sans édition interactive [N1][N3]. **« By default, the position of the devices are calculated with a physics engine. As soon as a device icon is dragged to another location, its position is saved »** et exclue du calcul ; sauvegarde sous permission ; **Coordinate Groups** = plusieurs dispositions ; multi-sélection « holding down the Shift key and dragging a frame » ; liens jamais dessinés à la main ; export « xml (for draw.io/diagrams.net) or png » ; copier, redimensionner, aimant, calques, collaboration : non trouvé [N1][N2].

Sources : [N1] https://github.com/netbox-community/netbox-topology-views · [N2] https://github.com/netbox-community/netbox-topology-views/releases · [N3] https://graphicalnetworks.com/blog-netterrain-7-0-released/, https://d2lang.com/tour/layouts/, https://netboxlabs.com/docs/visual-explorer/

## 2. Synthèse

### (a) Matrice produit × capacité

| Capacité | draw.io | Lucid | Visio | Miro | FigJam | Excalidraw | tldraw |
|---|---|---|---|---|---|---|---|
| Dupliquer | Ctrl+D +10/+10, Ctrl+drag | Ctrl+D, Alt+drag | Ctrl+D, Ctrl+drag | Ctrl+D, Alt+drag | Ctrl+D, Alt+drag | Ctrl+D +10/+10, Alt+drag | Ctrl+D +10 droite, Alt+drag |
| Coller le style | Alt+C/V | menu, Paint Format | Ctrl+Shift+C/V | Ctrl+Alt+C/V | Ctrl+Alt+C/V | Ctrl+Alt+C/V | Shift+Q |
| Barre contextuelle | non | dynamique + panneau | mini toolbar + volet | au-dessus, seule | seule | non | texte seul |
| Poignées / Maj / centre | 8 / oui / Ctrl | ? / oui / — | 8 / oui / — | 4 doc. / oui / Alt | 8 / oui / Alt | 8 / oui / Alt | 8 / oui / Alt |
| Même taille | Copy/Paste Size | Match Size | Size & Position | — | — | — | — |
| Guides / espacement égal | bords, centres | + cotes | dynamic grid | oui | — | 8 px, gaps | Ctrl, 8 px, gaps |
| Points de connexion | survol, 2 modes | survol, rouge | survol, glue 2 modes | sélection, bleus | côté, Ctrl libre | flottant, Alt fixe | lent = précis, Alt |
| Routage évitant | opt-in | grid layout | desktop | — | wrap around | coudées | coudées |
| Z / calques / verrou | 4 / oui / Ctrl+L | 4 / oui / 4 verrous | 4 / oui / protection | 4 / oui / Ctrl+Shift+L | 4 / non / Ctrl+Shift+L | 4 / non / Ctrl+Shift+L | 4 / non / Shift+L |
| Rectangle | enclos, Alt = touché | touché | enclos, option | touché 90 % | touché | enclos, préférence | touché, Ctrl, Alt lasso |
| Fit / sélection / 100 % | Ctrl+Shift+H / idem / Enter | menu / — / Ctrl+0 | Ctrl+Shift+W / — / — | Alt+1 / Alt+2 / Ctrl+0 | Shift+1 / Shift+2 / — | Shift+1 / Shift+2 / Ctrl+0 | Shift+1 / Shift+2 / Shift+0 |
| Texte riche / étiquettes de lien | oui / 3 | oui / 1 | oui / 1 | oui / n | oui / 1 | non / 1 | oui / 1 |
| Auto-layout | 9 algos | Grid, Hierarchy | 5, sélection | sélection | Tidy up | non | non |
| Export sélection / transparent / SVG | oui / oui / oui | oui / oui / oui | oui / web / desktop | zone / ? / oui | oui / oui / non | oui / oui / oui | oui / oui / oui |
| Curseurs / follow / commentaires / historique | backend / — / backend / backend | oui × 4 | bordure / — / oui / oui | oui × 4 | oui × 4 | oui / oui / + / + | oui / oui / licence / non |

### (b) Les « table stakes » (≥ 5 des 7 éditeurs) et le motif dominant

1. **Ctrl+C / V / X, Ctrl+D** : 7/7 ; le double se décale d'un pas de grille, +10/+10 (draw.io, Excalidraw) ou +10 à droite (tldraw) ; les autres ne documentent rien.
2. **Clone par modificateur + glissé** : 7/7, **Alt+glissé chez 5**, Ctrl+glissé chez draw.io et Visio ; tldraw et Figma font répéter l'écart par le Ctrl+D suivant.
3. **Copier / coller le style** : 7/7, `Ctrl+Alt+C / V` chez Miro, Figma, Excalidraw (et draw.io pour le texte).
4. **Barre contextuelle à la sélection** : 5/7 (Lucid, Visio, Miro, FigJam, tldraw pour le texte) ; apparaît sur la sélection, au-dessus ou à côté, **contenu typé par l'élément** (couleur, trait, texte, lien, cadenas, « … ») ; le panneau latéral ne garde que valeurs numériques et attributs.
5. **8 poignées, Maj = proportions, Alt = depuis le centre** : 8 poignées documentées 5/7 (Lucid sans nombre, Miro 4), Maj 7/7, Alt-centre 4/7 (draw.io prend Ctrl).
6. **Guides bords + centres** : 6/7 (pas FigJam), espacement égal 5/7 (pas draw.io) ; **seuil 8 px écran** chez Excalidraw et tldraw ; grille optionnelle partout, Ctrl la suspend (Miro, Excalidraw) ou l'active (tldraw).
7. **Aligner (6) / répartir (2)** : 7/7 ; `Alt+A/D/W/S` + `Alt+H/V` chez Figma et tldraw.
8. **Deux modes de liaison, flottant et fixe** : 7/7 ; points visibles **au survol ou à la sélection** (draw.io, Lucid, Visio, Miro), jamais en permanence ; le fixe se choisit par Alt (Excalidraw, tldraw) ou par le point visé (croix verte draw.io, point de côté Miro).
9. **Connecteur coudé à points de passage** : 7/7, coudé par défaut chez Lucid et Visio ; évitement d'obstacles chez 5 (draw.io opt-in, Visio desktop, FigJam, Excalidraw, tldraw).
10. **Quatre commandes d'ordre Z + verrou** : 7/7 ; `Ctrl+] / [` (Lucid, Figma, Excalidraw ; tldraw `]` `[`) contre `Ctrl+Shift+F / B` (draw.io, Visio) ; verrou `Ctrl+Shift+L` chez 3.
11. **Rectangle de sélection, Maj+clic, Ctrl+A, Échap** : 7/7 ; défaut partagé (enclos : draw.io, Visio, Excalidraw ; touché : Lucid, Miro, FigJam, tldraw) ; **un modificateur bascule** chez draw.io (Alt) et tldraw (Ctrl).
12. **Zoom : Ctrl+molette et Espace+glissé (6/7), fit (7/7), zoom sur la sélection (5/7), pourcentage cliquable et aide-mémoire (7/7)** ; `Shift+1 / 2` chez FigJam, Excalidraw, tldraw ; `Alt+1 / 2` chez Miro ; aide par `?` ou `F1`.
13. **Double-clic ou Entrée pour éditer** : 6/7 documenté (FigJam : non trouvé) ; étiquette sur le lien 7/7 ; texte riche 6/7.
14. **Export « sélection seule »** : 7/7 ; fond transparent 6/7 (Miro non trouvé) ; SVG 6/7 (FigJam non) ; échelle 1 / 2 / 3× chez Excalidraw et tldraw.
15. **Curseurs en direct + Follow** : 5/7 ; la sélection d'autrui se montre par une bordure à sa couleur (Visio, tldraw) ; commentaires 6/7.

### (c) Les patterns « best in class » à copier

1. **draw.io, la liaison lisible au drop** : contour bleu = flottant, croix verte = fixe ; « Auto-route around shapes » par câble, jamais imposé [D8][D9]. Nos ancres `auto` / `n e s w` peuvent reprendre ce code visuel.
2. **Lucidchart, cotes et Match Size** : pointillé pour les bords, plein pour les centres, « Measurements show the distance between two objects », commande Match Size directe [L5][L4] : l'aide d'alignement la plus complète de l'échantillon.
3. **tldraw, l'aimant comme geste** : Ctrl tenu aimante avec des « spacing measurement lines » ; Alt+glissé puis Ctrl+D répète l'écart ; le rectangle touche, Ctrl exige l'englobement, Alt passe en lasso [T6][T3][T9]. Trois modificateurs, zéro réglage.
4. **Excalidraw, l'export en un dialogue et le flowchart au clavier** : « Only selected », fond, mode sombre, scène embarquée, échelle 1-3× ; `Ctrl+flèche` crée le nœud voisin déjà relié [E8][E1].
5. **Miro, la barre unique au-dessus de l'objet** : tout y est, Maj la cache ; « See recent changes » surligne en rose ce que les autres ont modifié [M3][M4][M11].
6. **Visio, relayout sur la sélection et taille numérique** : Re-Layout Page ne touche que la sélection ; Size & Position rend plusieurs formes identiques en tapant une valeur [V12][V5].
7. **FigJam, Tidy up dans la barre de sélection** : dès trois objets, grille régulière, lignes roses, points pour réordonner [F7].
8. **netbox-topology-views, « la première place qui reste »** : un nœud glissé quitte le moteur physique, sa position est enregistrée côté serveur par groupe [N1] : exactement notre placement mémorisé (`docs/09`).

### (d) Ce que React Flow / xyflow v12 fournit, ou non

`@xyflow/react` 12.12.0 (2026-09-24) ; jalons : `EdgeToolbar` 12.9.0, `zIndexMode` 12.10.0, `autoPanOnSelection` 12.11.0, « Snap selection instead of separate nodes when snap grid is enabled » 12.8.3 (https://reactflow.dev/whats-new).

- **Copier / coller** : rien de natif ; briques `addNodes` / `addEdges`, `toObject()`, `screenToFlowPosition({ snapToGrid, snapGrid })` (https://reactflow.dev/api-reference/types/react-flow-instance). « Copy and Paste » est **Pro** (https://reactflow.dev/examples/interaction/copy-paste) ; « Context Menu » (gratuit) duplique et supprime via `onNodeContextMenu` (https://reactflow.dev/examples/interaction/context-menu). Décalage, presse-papiers, Alt+glissé : à coder.
- **Barre contextuelle** : `<NodeToolbar nodeId position offset={10} align="center" isVisible>` « only visible when a node is selected », « doesn't scale with the viewport », `nodeId` en tableau = une barre pour un groupe, masquée si plusieurs nœuds sont sélectionnés (https://reactflow.dev/api-reference/components/node-toolbar) ; `<EdgeToolbar edgeId x y alignX alignY>` (https://reactflow.dev/api-reference/components/edge-toolbar). Le contenu est à nous.
- **Redimensionner** : `<NodeResizer minWidth={10} minHeight={10} keepAspectRatio autoScale shouldResize onResize…>` (https://reactflow.dev/api-reference/components/node-resizer) ; `<NodeResizeControl position="top-left" variant="handle" resizeDirection>` (https://reactflow.dev/api-reference/components/node-resize-control). Maj = proportions n'est pas un défaut (brancher `keepAspectRatio` sur la touche) ; multi-sélection, champs L/H, « même taille » : à coder.
- **Aimant et guides** : `snapToGrid` / `snapGrid` (https://reactflow.dev/api-reference/react-flow) ; **Helper Lines = exemple Pro** (`useHelperLines`, ancres top / bottom / left / right / centerX / centerY, `SNAP_RADIUS`, « the node will snap and align with the boundaries of other nodes while a helper line is displayed », https://reactflow.dev/examples/interaction/helper-lines). Espacement égal, cotes, aligner / répartir : à coder (notre `align.ts` existe).
- **Points de connexion** : `<Handle type position id isConnectable isConnectableStart isConnectableEnd isValidConnection>` (https://reactflow.dev/api-reference/components/handle) ; masquer = `visibility: hidden` ou `opacity: 0`, « instead of `display: none` », classes `connecting` / `valid` pendant le glissé (https://reactflow.dev/learn/customization/handles) ; `connectionMode="loose"` « will allow you to connect handles with differing types, including source-to-source » (défaut `strict`), `connectionRadius` 20, `connectOnClick`, `connectionLineType` Bezier, `connectionLineComponent` (https://reactflow.dev/api-reference/react-flow, https://reactflow.dev/api-reference/types/connection-mode) ; `useConnection()` → `inProgress`, `fromNode` (https://reactflow.dev/api-reference/hooks/use-connection). Easy Connect : arête `floating` au bord du nœud, poignée cible rendue seulement `!connection.inProgress || isTarget` (https://reactflow.dev/examples/nodes/easy-connect, https://github.com/xyflow/xyflow/blob/main/examples/react/src/examples/EasyConnect/CustomNode.tsx) ; ligne de connexion sur mesure (https://reactflow.dev/examples/edges/custom-connectionline). **Points de passage = Pro « Editable Edge »** (https://reactflow.dev/examples/edges/editable-edge) ; **aucun routage évitant** : `smoothstep` ne connaît que `offset`, `borderRadius`, `stepPosition` (https://github.com/xyflow/xyflow/blob/main/examples/react/src/examples/EdgeRouting/index.tsx).
- **Ordre Z, calques** : `zIndex` par nœud et arête, `elevateNodesOnSelect` (défaut `true`), `zIndexMode` `auto / basic / manual` ; sous-flux `parentId`, `extent: 'parent'`, parents avant enfants (https://reactflow.dev/learn/layouting/sub-flows, https://reactflow.dev/api-reference/types/node). Pas de calques utilisateur ; verrou = `draggable / selectable / deletable: false`.
- **Sélection** : `selectionMode` `'full'` (défaut) ou `'partial'` « A node is selected when the selection rectangle partially overlaps with it » (https://reactflow.dev/api-reference/types/selection-mode) ; `selectionOnDrag`, `selectionKeyCode` Maj, `multiSelectionKeyCode` Ctrl, `panOnDrag=[1,2]` ; réglage « façon Figma » du dépôt : `selectionOnDrag`, `SelectionMode.Partial`, `panOnDrag={[1, 2]}`, `panOnScroll`, `selectNodesOnDrag={false}` (https://github.com/xyflow/xyflow/blob/main/examples/react/src/examples/Figma/index.tsx) ; Tab, Entrée, Échap, flèches, Maj accélère (https://reactflow.dev/learn/advanced-use/accessibility) ; **lasso** : « Lasso Selection », « Toggle between selecting nodes partially or fully enclosed », non marqué Pro (https://reactflow.dev/examples/whiteboard/lasso-selection). Alt enclos / touché : changer `selectionMode` à la volée.
- **Zoom, raccourcis** : `zoomTo(level, { duration })`, `zoomIn / zoomOut` (× 1.2), `fitView({ padding, nodes, minZoom, maxZoom, duration })`, `fitBounds`, `setCenter` (https://reactflow.dev/api-reference/types/react-flow-instance) ; `panActivationKeyCode="Space"`, `zoomActivationKeyCode` Ctrl, `minZoom` 0.5, `maxZoom` 2 ; `useKeyPress(['Meta+s', 'Strg+s'], { actInsideInputWithModifier })` (https://reactflow.dev/api-reference/hooks/use-key-press). Aucun pourcentage ni aide-mémoire fournis.
- **Texte** : rien ; `<EdgeLabelRenderer>` pose une étiquette HTML (`translate(-50%,-50%) translate(labelX,labelY)`, `pointerEvents: 'all'` + `nopan`) (https://reactflow.dev/api-reference/components/edge-label-renderer).
- **Auto-layout** : rien dans le cœur ; Dagre (« If the nodes or edges in the graph change, the layout won't recalculate! », https://reactflow.dev/examples/layout/dagre), ELK (https://reactflow.dev/examples/layout/elkjs), **Pro** Auto Layout commutable dagre / d3-hierarchy / elk (https://reactflow.dev/examples/layout/auto-layout) ; sélection seule : non documenté.
- **Export** : `toObject()` « Returns the nodes, edges and the viewport as a JSON object » ; `getNodesBounds`, `getViewportForBounds(bounds, width, height, minZoom, maxZoom, padding)` (https://reactflow.dev/api-reference/utils/get-viewport-for-bounds) ; Download Image : `html-to-image` **épinglé à 1.11.11**, « the latest working version » (https://reactflow.dev/examples/misc/download-image). Le code du bouton est dans le bac à sable de la page, illisible en texte ; recette connue, non revérifiée ce jour : `getNodesBounds(getNodes())` → `getViewportForBounds(bounds, W, H, 0.5, 2)` → `toPng(document.querySelector('.react-flow__viewport'), { backgroundColor, width, height, style: { transform: 'translate(x, y) scale(zoom)' } })`. SVG vectoriel, sélection seule, transparent : à coder.
- **Collaboration, historique** : rien ; annuler / rétablir = exemple **Pro** (`useUndoRedo` par instantanés, https://reactflow.dev/examples/interaction/undo-redo) ; le nôtre existe (`history.ts`).

### Lecture pour Living Diagram
Déjà là : Maj+clic, Maj+rectangle, flèches, aligner / répartir, grille et aimant, Ctrl+Z, ancres de connecteurs, verrou d'annotation. Manquent, par valeur décroissante : (1) `Ctrl+D` / `Alt+glissé` des annotations et groupes, décalage +10/+10, écart répété ; (2) guides bords / centres / espacement égal à 8 px ; (3) `Ctrl+Alt+C / V` du style ; (4) `Shift+1 / Shift+2 / Ctrl+0` et un pourcentage cliquable ; (5) export PNG / SVG « sélection seule, transparent, 1-3× » en un dialogue, condition de la « sortie figée » parquée dans `docs/10` §6.5.
