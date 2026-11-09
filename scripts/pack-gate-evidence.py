"""Copies a gate sweep into docs/audit/screenshots/gate at a size fit for the repository:
desktop shots scaled to 720 px wide, phone shots kept at 390 px, both cut to the first 2,400 px of height, JPEG q55.
Usage: python3 scripts/pack-gate-evidence.py <sweepDir>"""
import json, os, shutil, sys
from PIL import Image
src, dst = sys.argv[1], 'docs/audit/screenshots/gate'
os.makedirs(dst, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith('.jpg'): continue
    im = Image.open(os.path.join(src, f)).convert('RGB')
    if f.endswith('-desktop.jpg'): im = im.resize((720, round(im.height * 720 / im.width)))
    im = im.crop((0, 0, im.width, min(im.height, 2400)))
    im.save(os.path.join(dst, f), quality=55, optimize=True)
shutil.copy(os.path.join(src, 'sweep.json'), os.path.join(dst, 'sweep.json'))
print(len([f for f in os.listdir(dst) if f.endswith('.jpg')]), 'screenshots')
