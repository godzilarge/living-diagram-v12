"""The v2 application (`app/`, React, built by Vite into `app/dist/`), served at `/next/` while the migration lasts;
`/` keeps serving the v1 until the last surface has moved.

The files are read at request time from the build folder (`LD_APP_DIST`, by default `app/dist` in the repository):
a rebuild shows at the next request, no restart. Only names found by walking the folder are served, never a path
built from the request; symbolic links are ignored. Same CSP as `/`: `'self'` only. Without a build, `/next/` is a
404 `Problem`, like any unknown file.
"""

import base64
import hashlib
from pathlib import Path

from ld_backend.render.app import APP_CSP

NEXT_ROUTE = "/next/"
NEXT_FILE = "/next/{name:path}"
NEXT_INDEX = "index.html"
NEXT_CSP = APP_CSP
MEDIA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff2": "font/woff2",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".json": "application/json",
}


def next_file_names(root: Path) -> list[str]:
    """The servable files of a build, by relative POSIX path, sorted; none when the build is absent."""
    if not root.is_dir():
        return []
    names = []
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        linked = path.is_symlink() or any((root / parent).is_symlink() for parent in relative.parents)
        if path.is_file() and not linked:
            names.append(relative.as_posix())
    return sorted(names)


def read_next_file(root: Path, name: str) -> tuple[bytes, str, str] | None:
    """The content, media type and ETag of a build file; `None` when the name is not one of the listed files or its
    type is not served."""
    if name not in next_file_names(root):
        return None
    media_type = MEDIA_TYPES.get(Path(name).suffix)
    if media_type is None:
        return None
    content = (root / name).read_bytes()
    etag = '"' + base64.urlsafe_b64encode(hashlib.sha256(content).digest()).decode("ascii").rstrip("=") + '"'
    return content, media_type, etag
