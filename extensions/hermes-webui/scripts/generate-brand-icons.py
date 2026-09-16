from pathlib import Path
import hashlib
import io

import cairosvg
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "extensions/hermes-webui/branding/favicon.svg"
CANONICAL_HASH = "e3084e2318e4e4f54973af4bd19ca68bace67262ef1edd01ee2ffbe46c610873"

if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != CANONICAL_HASH:
    raise RuntimeError("canonical fox favicon hash mismatch")


def write_png(path: Path, size: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rendered = cairosvg.svg2png(
        url=str(SOURCE), output_width=size, output_height=size
    )
    if not isinstance(rendered, bytes):
        raise TypeError("CairoSVG did not return PNG bytes")
    path.write_bytes(rendered)


def write_ico(path: Path) -> None:
    source_png = cairosvg.svg2png(
        url=str(SOURCE), output_width=256, output_height=256
    )
    if not isinstance(source_png, bytes):
        raise TypeError("CairoSVG did not return PNG bytes")
    image = Image.open(io.BytesIO(source_png)).convert("RGBA")
    image.save(
        path,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


write_png(ROOT / "apps/storefront/src/app/icon.png", 32)
write_png(ROOT / "apps/storefront/src/app/apple-icon.png", 180)
write_png(ROOT / "apps/storefront/public/icon-192.png", 192)
write_png(ROOT / "apps/storefront/public/icon-512.png", 512)
write_ico(ROOT / "apps/storefront/src/app/favicon.ico")

BRANDING = ROOT / "extensions/hermes-webui/branding"
write_png(BRANDING / "favicon-32.png", 32)
write_png(BRANDING / "apple-touch-icon.png", 180)
write_png(BRANDING / "favicon-192.png", 192)
write_png(BRANDING / "favicon-512.png", 512)
write_ico(BRANDING / "favicon.ico")
