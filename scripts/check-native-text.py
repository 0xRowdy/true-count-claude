#!/usr/bin/env python3
"""Check rendered labels from native-large-text screenshots, not accessibility names.

Usage: python scripts/check-native-text.py [--all] PATH_TO_MAESTRO_SCREENSHOTS
Requires Pillow and the tesseract executable. Run after .maestro/native-large-text.yml.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image


def read_pixels(image):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "text.png"
        readings = []
        # Tesseract handles gold controls and light-on-dark labels differently.
        for pixels in (image, image.convert("L")):
            pixels.save(path)
            readings.extend(
                subprocess.check_output(
                    ["tesseract", str(path), "stdout", "--psm", mode],
                    stderr=subprocess.DEVNULL,
                    text=True,
                )
                for mode in ("6", "11")
            )
        return " ".join(readings)


all_labels = sys.argv[1] == "--all"
root = Path(sys.argv[2] if all_labels else sys.argv[1])
craps = Image.open(next(root.rglob("native-large-text-craps.png")))
baccarat = Image.open(next(root.rglob("native-large-text-baccarat.png")))
# The flow scrolls to the bottom action row. Ignore the same roll title on the felt.
checks = [
    ("craps edit amount", craps.crop((0, craps.height * 0.75, craps.width / 2, craps.height)), ["Edit bets 0"]),
    ("craps roll action", craps.crop((craps.width / 2, craps.height * 0.75, craps.width, craps.height)), ["Come-out", "roll"]),
    ("baccarat road legend", baccarat, ["Player 0", "Banker 0", "Tie 0"]),
]
if all_labels:
    for name, labels in [
        ("paytable", ["Royal Flush", "4,000"]),
        ("roulette", ["Clear", "Undo", "Spin"]),
        ("video-poker", ["COINS", "COIN VALUE"]),
        ("held-card", ["HELD", "HOLD"]),
        ("play", ["Keep bets near 2% of your bankroll"]),
    ]:
        screenshot = Image.open(next(root.rglob(f"native-large-text-{name}.png")))
        checks.append((name, screenshot, labels))
    poker = Image.open(next(root.rglob("native-large-text-video-poker.png")))
    checks.append(("video-poker speed", poker.crop((0, poker.height * 0.75, poker.width / 2, poker.height)), ["Speed"]))
    roulette = Image.open(next(root.rglob("native-large-text-roulette.png")))
    # The flow leaves the lower dozen bets visible; rotate their printed labels for OCR.
    dozens = roulette.crop((roulette.width * 0.17, roulette.height * 0.25, roulette.width * 0.28, roulette.height * 0.62))
    checks.append(("roulette dozens", dozens.rotate(90, expand=True), ["2nd 12", "3rd 12"]))
    payout = Image.open(next(root.rglob("native-large-text-baccarat-payout.png")))
    checks.extend([
        ("baccarat rebet amount", payout.crop((0, payout.height * 0.75, payout.width / 2, payout.height)), ["Rebet", "25"]),
        ("baccarat next hand", payout.crop((payout.width * 0.62, payout.height * 0.85, payout.width, payout.height)), ["Next", "hand"]),
    ])
failed = False
for name, image, labels in checks:
    actual = read_pixels(image)
    if name == "play":
        # At default size the note sits beside the hand. Exclude that neighbouring label.
        actual += read_pixels(image.crop((0, 0, image.width * 0.34, image.height * 0.78)))
    if name == "paytable":
        # A wrapped hand name must be read separately from the payout beside its first line.
        actual += read_pixels(image.crop((0, 0, image.width * 0.52, image.height)))
    normalized = re.sub(r"[^a-z0-9]", "", actual.lower())
    # At this face/size OCR sometimes reads a visible zero as the letter O.
    normalized = re.sub(r"(player|banker|tie)o", r"\g<1>0", normalized)
    missing = [label for label in labels if re.sub(r"[^a-z0-9]", "", label.lower()) not in normalized]
    print(f"{'FAIL' if missing else 'PASS'} {name}: {', '.join(missing) if missing else 'all labels rendered'}")
    if missing:
        print(f"  OCR: {actual.strip()!r}")
        failed = True
sys.exit(1 if failed else 0)
