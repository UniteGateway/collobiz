"""Builds one PDF per app from capture-all.mjs output: cover + contents, then each screen with its route and title.
Usage: python3 scripts/screens-to-pdf.py SHOTS_DIR OUT_DIR"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

shots, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
man = json.load(open(os.path.join(shots, 'manifest.json')))
TITLES = {'web': 'COLLABIZ — partner web app', 'admin': 'COLLABIZ — administration console', 'power': 'Unite Power Dispatch & Hybrid Power Lab'}
W = 1100  # output width in px; keeps text legible and files small
NAVY, GREY = (11, 31, 58), (91, 100, 117)

def font(sz, bold=False):
    for p in [f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf", '/usr/share/fonts/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

def text_page(lines, title):
    h = max(1400, 160 + 26 * len(lines))
    im = Image.new('RGB', (W, h), 'white'); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W, 8], fill=(30, 107, 255))
    d.text((60, 50), title, fill=NAVY, font=font(34, True))
    y = 120
    for ln, bold, col in lines:
        d.text((60, y), ln[:120], fill=col, font=font(17, bold)); y += 26
    return im

for app in ['web', 'admin', 'power']:
    rows = [m for m in man if m['app'] == app]
    if not rows: continue
    done = [m for m in rows if m.get('file')]
    pages = []
    lines = [('Screens captured from the running application with demonstration data (2026-11-15).', False, GREY),
             (f"{len([m for m in done if m['vw']=='desktop'])} desktop screens (1440 px) and {len([m for m in done if m['vw']=='mobile'])} phone screens (390 px).", False, GREY),
             ('Figures, companies and people are sample data. "Access-limited view" means the demo user lacks the role for that page.', False, GREY), ('', False, GREY)]
    for i, m in enumerate(rows, 1):
        tag = '' if m['status'] == 'ok' else f"  [{m['status']}]"
        lines.append((f"{m['vw']:<8} {m['route']}{('  — ' + m['title']) if m.get('title') else ''}{tag}", False, NAVY if m.get('file') else (200, 60, 60)))
    # Contents may be long: split into pages of 48 lines.
    for k in range(0, len(lines), 48):
        pages.append(text_page(lines[k:k + 48], TITLES[app] + (' — contents' if k else '')))
    for m in done:
        try: im = Image.open(m['file']).convert('RGB')
        except Exception: continue
        sc = W / im.width
        im = im.resize((W, max(1, int(im.height * sc))), Image.LANCZOS) if im.width > W else im
        bar = 56
        page = Image.new('RGB', (W, im.height + bar), 'white'); d = ImageDraw.Draw(page)
        d.rectangle([0, 0, W, bar], fill=(238, 243, 255))
        d.text((20, 8), f"{m.get('title') or m['route']}", fill=NAVY, font=font(18, True))
        d.text((20, 32), f"{m['vw']} · {m['url']}{'' if m['status']=='ok' else '  ·  ' + m['status']}", fill=GREY, font=font(13))
        page.paste(im, (0, bar))
        # Very tall pages are split so each PDF page stays readable.
        H = 6000
        for y in range(0, page.height, H): pages.append(page.crop((0, y, W, min(page.height, y + H))))
    path = os.path.join(out, f"screens-{app}.pdf")
    pages[0].save(path, save_all=True, append_images=pages[1:], resolution=110, quality=62, optimize=True)
    print(path, len(done), 'screens', round(os.path.getsize(path) / 1e6, 1), 'MB')
