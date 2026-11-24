#!/usr/bin/env python3
"""Poll the glasses framebuffer and print lit-px over time.
Usage: poll.py <seconds> <interval_s> [label]
Used to measure render lag (e.g. Home -> Positions waits on /api/markets).
"""
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

SIM = "http://127.0.0.1:9898/api/screenshot/glasses"


def lit_px() -> int:
    with urllib.request.urlopen(SIM, timeout=10) as r:
        data = r.read()
    import io

    a = Image.open(io.BytesIO(data)).getchannel("A")
    return int((np.array(a) > 10).sum())


if __name__ == "__main__":
    seconds = float(sys.argv[1])
    interval = float(sys.argv[2])
    label = sys.argv[3] if len(sys.argv) > 3 else ""
    t0 = time.time()
    while time.time() - t0 < seconds:
        print(f"{time.time() - t0:5.2f}s lit={lit_px()} {label}", flush=True)
        time.sleep(interval)
