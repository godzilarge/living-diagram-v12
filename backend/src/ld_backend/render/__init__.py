"""Pages HTML de visualisation d'un snapshot : un outil de lecture de B1, pas le moteur de diagramme.

Un fichier autonome par run, hors ligne, sans librairie : le graphe, les sources de chaque câble, les contrôles,
et la qualité des données, qui sert à mettre au point l'exportateur.
"""

from ld_backend.render.build import PageOutcome, page_from_archive, page_from_bundle
from ld_backend.render.page import build_page_data, render_page

__all__ = ["PageOutcome", "build_page_data", "page_from_archive", "page_from_bundle", "render_page"]
