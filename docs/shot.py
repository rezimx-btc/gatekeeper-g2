#!/usr/bin/env python3
"""Day 5 screenshot helper: fetch glasses screenshot from the simulator
automation API, extract the alpha channel (where the mono-green content
lives), save both the raw RGBA PNG and a readable -alpha.png, print lit px.

Usage:
  shot.py <name>            # saves docs/screenshots/day5-<name>.png (+ -alpha)
  shot.py <name> <outfile>  # saves to explicit path (no day5- prefix)
"""
import sys
import urllib.request
from pathlib import Path

from PIL import Image

SIM = "http://127.0.0.1:9898/api/screenshot/glasses"
BASE = Path.home() / "workspace" / "even-realities" / "docs" / "screenshots"


def shoot(name: str, out: Path | None = None) -> Path:
    raw = out or (BASE / f"day5-{name}.png")
    alpha = raw.with_name(raw.stem + "-alpha.png")
    with urllib.request.urlopen(SIM, timeout=15) as r:
        data = r.read()
    raw.write_bytes(data)
    im = Image.open(raw)
    a = im.getchannel("A")
    import numpy as np

    lit = int((np.array(a) > 10).sum())
    a.save(alpha)
    print(f"{raw.name}: {im.size} {im.mode} lit={lit} -> {alpha.name}")
    return raw


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else None
    shoot(sys.argv[1], out)
