"""גימור: קובע לכל קטע קיר חיצוני בכל קומה את צבע החיפוי, לפי דגימה של חזיתות ההיתר.
מוסיף ל-public/floors/<A|B|C>.json שדה cladding לכל תוכנית: קטעי הקיר האטומים שבהיקף, וצבע לכל קטע בכל קומה.
לוח הצבעים של האדריכל, כפי שנקרא מהחזיתות: 0 לבן, 1 אפור פחם, 2 אפור בהיר, 3 כתום.
הרצה: python3 tools/build-cladding.py (אחרי build-floors.py ו-build-facades.py)"""
import json, math, pathlib
import numpy as np
from PIL import Image
from shapely.geometry import Polygon, Point

ROOT = pathlib.Path(__file__).resolve().parent.parent
fac = json.loads((ROOT / "data" / "facades.json").read_text(encoding="utf-8"))
SIDE_N = dict(right=(1, 0), left=(-1, 0), top=(0, -1), bottom=(0, 1))
SCALE = dict(A=125, B=100, C=100)

def classify(rgb):
    r, g, b = rgb
    if r > 170 and r - b > 60:
        return 3
    if min(r, g, b) > 205:
        return 0
    if max(r, g, b) < 120:
        return 1
    return 2

for key in "ABC":
    path = ROOT / "public" / "floors" / f"{key}.json"
    d = json.loads(path.read_text(encoding="utf-8"))
    mpp = SCALE[key] * 0.0254 / 72
    imgs = {s: np.asarray(Image.open(ROOT / "public" / v["img"].lstrip("/")).convert("RGB")).astype(int) for s, v in fac[key]["sides"].items()}
    typical = max(d["pages"].values(), key=lambda p: len(p["floors"]))
    xs, ys = [p[0] for p in typical["floor"]], [p[1] for p in typical["floor"]]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    count = [0, 0, 0, 0]
    for pg in d["pages"].values():
        ring = pg["body"]
        poly = Polygon(ring)
        tol = 0.35 / mpp
        segs = []
        for i in range(len(ring)):
            a, b = np.array(ring[i]), np.array(ring[(i + 1) % len(ring)])
            L = np.linalg.norm(b - a)
            if L * mpp < 0.3:
                continue
            e = (b - a) / L
            cuts = []
            for o in pg["openings"]:
                p, q = np.array(o[:2]), np.array(o[2:])
                on = [abs(e[0] * (v - a)[1] - e[1] * (v - a)[0]) < tol and -tol < np.dot(v - a, e) < L + tol for v in (p, q)]
                if on[0] and on[1]:
                    t = sorted((np.dot(p - a, e), np.dot(q - a, e)))
                elif on[0] or on[1]:  # פתח שעובר פינה: מכסה מהנקודה ועד קצה הצלע שקרוב לנקודה השנייה
                    v, w = (p, q) if on[0] else (q, p)
                    t0 = np.dot(v - a, e)
                    t = sorted((t0, 0.0 if np.linalg.norm(w - a) < np.linalg.norm(w - b) else L))
                else:
                    continue
                cuts.append((max(0, t[0]), min(L, t[1])))
            pos, n = 0.0, np.array([e[1], -e[0]])
            if poly.contains(Point(*((a + b) / 2 + n * tol))):
                n = -n
            side = max(SIDE_N, key=lambda s: n[0] * SIDE_N[s][0] + n[1] * SIDE_N[s][1])
            for c0, c1 in sorted(cuts) + [(L, L)]:
                if (c0 - pos) * mpp >= 0.3:
                    p0, p1 = a + e * pos, a + e * c0
                    segs.append(([round(float(v), 1) for v in (*p0, *p1)], side, (p0 + p1) / 2))
                pos = max(pos, c1)
        colors = {}
        for fl in pg["floors"]:
            z, h = d["levels"][str(fl)]
            row = ""
            for _, side, m in segs:
                s, img = fac[key]["sides"][side], imgs[side]
                u = 0.5 - ((m[0] - cx) * s["left"][0] + (m[1] - cy) * s["left"][1]) * mpp / s["width"]
                px = []
                for k in (0.25, 0.5, 0.8):
                    x, y = int(np.clip(u, 0.01, 0.99) * img.shape[1]), int(np.clip(1 - (z + k * h) / fac[key]["hmax"], 0.001, 0.999) * img.shape[0])
                    px.append(np.median(img[max(0, y - 2):y + 3, max(0, x - 2):x + 3].reshape(-1, 3), axis=0))
                c = classify(np.median(np.array(px), axis=0))
                count[c] += 1
                row += str(c)
            colors[str(fl)] = row
        pg["cladding"] = dict(segs=[s[0] for s in segs], colors=colors)
    path.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(key, "קטעים לפי צבע: לבן %d, פחם %d, אפור %d, כתום %d" % tuple(count))
