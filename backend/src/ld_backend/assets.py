"""Le magasin des images d'une infrastructure (docs/10 §6) : les fichiers que les annotations citent.

Sous `<archive>/_intent/<infra>/assets/<sha256>`, rangés par empreinte (un même fichier envoyé deux fois n'est rangé
qu'une fois), **reconnus à leurs octets de tête** (PNG, JPEG, WebP ; jamais SVG, qui embarque des scripts ; jamais au
nom ni au type déclaré), bornés par `LD_MAX_ASSET_BYTES`. Les dimensions se lisent dans l'en-tête, sans bibliothèque
d'image. Une suppression est refusée tant qu'une annotation cite le fichier.
"""

import hashlib
import struct
from dataclasses import dataclass
from pathlib import Path

from ld_backend.archive import _segment
from ld_backend.intent import INTENT_DIR

ASSETS_DIR = "assets"
ALLOWED = {"image/png", "image/jpeg", "image/webp"}


class AssetTypeError(ValueError):
    """Le fichier n'est pas un PNG, un JPEG ou un WebP d'après ses octets de tête (ou son en-tête est illisible)."""


class AssetUnknownError(KeyError):
    """Aucun fichier sous cette empreinte pour cette infrastructure."""


@dataclass(frozen=True, slots=True)
class AssetInfo:
    asset: str
    media_type: str
    bytes: int
    width: int
    height: int


def sniff(data: bytes) -> tuple[str, int, int]:
    """Le type et les dimensions d'une image à ses octets, ou `AssetTypeError`."""
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24 and data[12:16] == b"IHDR":
        width, height = struct.unpack(">II", data[16:24])
        return "image/png", width, height
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", *_jpeg_size(data)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", *_webp_size(data)
    raise AssetTypeError("ni PNG, ni JPEG, ni WebP d'après les octets de tête")


def _jpeg_size(data: bytes) -> tuple[int, int]:
    """Parcourt les segments jusqu'au premier `SOFn` (hauteur, largeur en gros-boutien)."""
    at = 2
    while at + 9 < len(data):
        if data[at] != 0xFF:
            raise AssetTypeError("JPEG illisible")
        marker = data[at + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            at += 2
            continue
        length = struct.unpack(">H", data[at + 2 : at + 4])[0]
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            height, width = struct.unpack(">HH", data[at + 5 : at + 9])
            return width, height
        at += 2 + length
    raise AssetTypeError("JPEG sans en-tête de dimensions")


def _webp_size(data: bytes) -> tuple[int, int]:
    chunk = data[12:16]
    if chunk == b"VP8X" and len(data) >= 30:
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if chunk == b"VP8L" and len(data) >= 25:
        bits = int.from_bytes(data[21:25], "little")
        return 1 + (bits & 0x3FFF), 1 + ((bits >> 14) & 0x3FFF)
    if chunk == b"VP8 " and len(data) >= 30:
        width, height = struct.unpack("<HH", data[26:30])
        return width & 0x3FFF, height & 0x3FFF
    raise AssetTypeError("WebP sans en-tête de dimensions")


class AssetStore:
    def __init__(self, root: Path) -> None:
        self.root = Path(root)

    def _folder(self, infrastructure: str) -> Path:
        return self.root / INTENT_DIR / _segment(infrastructure) / ASSETS_DIR

    def put(self, infrastructure: str, data: bytes) -> tuple[AssetInfo, bool]:
        """Range le fichier sous son empreinte ; rend (info, créé) : faux si le même fichier était déjà là."""
        media_type, width, height = sniff(data)
        asset = hashlib.sha256(data).hexdigest()
        folder = self._folder(infrastructure)
        path = folder / asset
        created = not path.exists()
        if created:
            folder.mkdir(parents=True, exist_ok=True)
            write_atomically_bytes(path, data)
        return AssetInfo(asset=asset, media_type=media_type, bytes=len(data), width=width, height=height), created

    def exists(self, infrastructure: str, asset: str) -> bool:
        return _valid_id(asset) and (self._folder(infrastructure) / asset).is_file()

    def get(self, infrastructure: str, asset: str) -> tuple[bytes, str]:
        """Les octets et le type vérifié à la lecture (jamais le type déclaré à l'envoi)."""
        if not self.exists(infrastructure, asset):
            raise AssetUnknownError(asset)
        data = (self._folder(infrastructure) / asset).read_bytes()
        media_type, _, _ = sniff(data)
        return data, media_type

    def delete(self, infrastructure: str, asset: str) -> None:
        if not self.exists(infrastructure, asset):
            raise AssetUnknownError(asset)
        (self._folder(infrastructure) / asset).unlink()

    def list(self, infrastructure: str) -> list[AssetInfo]:
        folder = self._folder(infrastructure)
        if not folder.is_dir():
            return []
        out: list[AssetInfo] = []
        for path in sorted(folder.iterdir()):
            if not _valid_id(path.name) or not path.is_file():
                continue
            data = path.read_bytes()
            try:
                media_type, width, height = sniff(data)
            except AssetTypeError:
                continue
            out.append(AssetInfo(asset=path.name, media_type=media_type, bytes=len(data), width=width, height=height))
        return out


def _valid_id(asset: str) -> bool:
    return len(asset) == 64 and all(c in "0123456789abcdef" for c in asset)


def write_atomically_bytes(path: Path, data: bytes) -> None:
    """Comme `files.write_atomically`, pour des octets."""
    import os
    from uuid import uuid4

    tmp = path.parent / f".tmp-{path.name}-{uuid4().hex}"
    try:
        with tmp.open("wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        tmp.replace(path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
