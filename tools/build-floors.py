"""בונה לכל בניין את חתכי הקומות: קירות, קו הרצפה, תמונת התוכנית (בלי כיתוב) והעתקה מהגיליון אל המתחם.
הפלט: public/floors/<A|B|C>.json ו-public/floors/<A|B|C>-<עמוד>.jpg. נטען באפליקציה רק כשפותחים חתך.
הרצה: python3 tools/build-floors.py (אחרי build-buildings.py)"""
import json, math, pathlib, importlib.util
import numpy as np, pymupdf, cv2
from scipy import ndimage
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "floors"
def kind_of(fill):
    """סוג הקיר לפי צבע המילוי בתוכנית: תכלת בטון, ורוד וירוק בלוק. הגוון משתנה מעט בין הקבצים."""
    if not fill or len(fill) != 3:
        return None
    r, g, bl = fill
    if bl > 0.95 and 0.4 < r < 0.65 and g < 0.85:
        return "concrete"
    if (r > 0.95 and g < 0.75 and bl < 0.75) or (g > 0.95 and r < 0.7 and bl < 0.7):
        return "block"
    return None
CFG = {  # עמודי התוכנית והקומות שכל עמוד מייצג, כמו ב-build-buildings.py
    "A": dict(file="building-A-102-103.pdf", scale=125, lots=["102", "103"],
              pages={1: [0], 2: [0.5], 3: list(range(1, 5)) + list(range(21, 27)), 4: [5], 5: [6], 6: list(range(7, 21)), 7: [27]},
              first=7.50, special={0: 0.0, 0.5: 4.0}, roof=92.73, parapet=94.09),
    "B": dict(file="building-B-101.pdf", scale=100, lots=["101"],
              pages={1: [0], 2: [0.5], 3: [1, 2, 3, 17, 18], 4: [4], 5: [5, 8, 9], 6: [6], 7: [7], 8: [10, 13, 15, 16], 9: [11], 10: [12], 11: [14], 12: [19]},
              first=7.50, special={0: 0.0, 0.5: 4.0, 19: 64.38}, roof=67.70, parapet=69.05),
    "C": dict(file="building-C-104.pdf", scale=100, lots=["104"], pages={1: [0], 2: [1, 4, 5, 6, 7, 8], 3: [2], 4: [3], 5: [9]},
              first=3.50, special={0: 0.20, 9: 28.78}, roof=32.01, parapet=33.36),
}
CORE = ("מבואה", "מדרגות", "מעלית", "לובי")
b = json.loads((ROOT / "data" / "buildings.json").read_text(encoding="utf-8"))

def path_rings(d):
    """מפרק מסלול מילוי לטבעות נפרדות. מסלול אחד יכול להכיל קירות רבים, ולכן אין לחבר את כולם לפוליגון אחד."""
    rings, cur = [], []
    for it in d["items"]:
        if it[0] == "l":
            a, b2 = (it[1].x, it[1].y), (it[2].x, it[2].y)
            if cur and (abs(cur[-1][0] - a[0]) > 0.01 or abs(cur[-1][1] - a[1]) > 0.01):
                rings.append(cur); cur = []
            if not cur:
                cur.append(a)
            cur.append(b2)
        else:
            if cur:
                rings.append(cur); cur = []
            if it[0] == "re":
                r = it[1]; rings.append([(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)])
            elif it[0] == "qu":
                q = it[1]; rings.append([(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)])
    if cur:
        rings.append(cur)
    return [r for r in rings if len(r) >= 3]

def find_balconies(page, mpp, K=4):
    """מרפסות: האזור הסגור שסביב כל כיתוב "מרפסת" בתוכנית, בלי קווי מידה ובלי קווי הצללה אלכסוניים."""
    W, H = int(page.rect.width * K), int(page.rect.height * K)
    img = np.zeros((H, W), np.uint8)
    for d in page.get_drawings():
        w, f = d.get("width") or 0, d.get("fill")
        for it in d["items"]:
            if it[0] == "l":
                a, b2 = it[1], it[2]
                if f is not None or (w >= 0.5 and (abs(a.x - b2.x) < 0.3 or abs(a.y - b2.y) < 0.3)):
                    cv2.line(img, (int(a.x * K), int(a.y * K)), (int(b2.x * K), int(b2.y * K)), 255, 2)
            elif it[0] == "re" and (w >= 0.5 or f is not None):
                r = it[1]; cv2.rectangle(img, (int(r.x0 * K), int(r.y0 * K)), (int(r.x1 * K), int(r.y1 * K)), 255, 2)
    lab, _ = ndimage.label(img == 0)
    words, out = page.get_text("words"), []
    for w in words:
        if "מרפסת" not in w[4] or any("שירות" in o[4] and abs(o[1] - w[1]) < 6 and abs(o[0] - w[0]) < 60 for o in words):
            continue
        cx, cy = int((w[0] + w[2]) / 2 * K), int((w[1] + w[3]) / 2 * K)
        near = lab[cy - 12:cy + 12, cx - 12:cx + 12]
        vals = near[near > 0]
        if not len(vals):
            continue
        ys, xs = np.where(lab == np.bincount(vals).argmax())
        if 3 < len(ys) / (K * K) * mpp * mpp < 45:
            out.append([round(float(v) / K, 1) for v in (xs.min(), ys.min(), xs.max(), ys.max())])
    return out

def find_openings(body, walls, mpp):
    """פתחים בחזית: קטעים בהיקף הבניין שאין בהם קיר. בתוכנית, חלון ודלת מרפסת הם רווח בין קירות."""
    wall = unary_union(walls).buffer(0.25 / mpp)
    ring = body.exterior
    step, n = 0.2 / mpp, int(ring.length / (0.2 / mpp))
    open_ = [not wall.contains(ring.interpolate(i * step)) for i in range(n)]
    out, i = [], 0
    while i < n:
        if open_[i]:
            j = i
            while j < n and open_[j]:
                j += 1
            L = (j - i) * 0.2
            if 0.7 <= L <= 7:
                a, b2 = ring.interpolate(i * step), ring.interpolate((j - 1) * step)
                out.append([round(a.x, 1), round(a.y, 1), round(b2.x, 1), round(b2.y, 1)])
            i = j
        else:
            i += 1
    return out

def export(g, tol=0.4):
    g = unary_union(g).simplify(tol)
    return [dict(pts=[[round(x, 1), round(y, 1)] for x, y in p.exterior.coords[:-1]], holes=[[[round(x, 1), round(y, 1)] for x, y in h.coords[:-1]] for h in p.interiors])
            for p in (g.geoms if hasattr(g, "geoms") else [g]) if p.area > 4]

for key, cfg in CFG.items():
    doc = pymupdf.open(ROOT / "source" / "plans" / cfg["file"])
    mpp = cfg["scale"] * 0.0254 / 72
    pages, labels0 = {}, None
    for pg, floors in cfg["pages"].items():
        page = doc[pg]
        walls = {"concrete": [], "block": []}
        for d in page.get_drawings():
            kind = kind_of(d.get("fill"))
            for pts in (path_rings(d) if kind else []):
                g = Polygon(pts).buffer(0)
                if g.area > 0.5:
                    walls[kind].append(g)
        allw = unary_union(walls["concrete"] + walls["block"])
        # הבניין: גוש הקירות הגדול ביותר. קירות פיתוח ומקרא שמחוץ לו נזרקים.
        R = 2.2 / mpp  # סוגרים פתחים של עד כ-4 מטר בין קירות, במטרים ולא בנקודות, כדי שיעבוד בכל קנה מידה
        grown = allw.buffer(R)
        blob = max(grown.geoms if hasattr(grown, "geoms") else [grown], key=lambda g: g.area)
        hull = Polygon(blob.exterior).buffer(-(R - 0.5))
        floor = max(hull.geoms, key=lambda g: g.area) if hasattr(hull, "geoms") else hull
        walls = {k: [w for w in v if w.intersects(floor)] for k, v in walls.items()}
        x0, y0, x1, y1 = floor.buffer(3).bounds
        words = page.get_text("words")
        core = [dict(name=w[4].strip("ר"), at=[round((w[0] + w[2]) / 2, 1), round((w[1] + w[3]) / 2, 1)]) for w in words if any(c in w[4] for c in CORE) and floor.contains(Polygon([(w[0], w[1]), (w[2], w[1]), (w[2], w[3])]).centroid)]
        labels = {w[4]: ((w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in words}
        # תמונת התוכנית בלי כיתוב: הכיתוב היה מתהפך בבניין משוקף
        tmp = pymupdf.open(ROOT / "source" / "plans" / cfg["file"])
        pt = tmp[pg]
        for w in words:
            pt.add_redact_annot(pymupdf.Rect(w[:4]), fill=False)
        pt.apply_redactions(images=0, graphics=0)
        k = 2000 / max(x1 - x0, y1 - y0)
        pix = pt.get_pixmap(matrix=pymupdf.Matrix(k, k), clip=pymupdf.Rect(x0, y0, x1, y1), alpha=False)
        pix.pil_save(OUT / f"{key}-{pg}.jpg", quality=70, optimize=True)
        balc = find_balconies(page, mpp)
        # גוף הבניין: הקומה בלי המרפסות. עליו מולבשת החזית, והמרפסות נבנות לפניו.
        body = floor.difference(unary_union([box(*r).buffer(0.2 / mpp) for r in balc])) if balc else floor
        body = max(body.geoms, key=lambda g: g.area) if hasattr(body, "geoms") else body
        body = body.simplify(0.25 / mpp)
        pages[str(pg)] = dict(body=[[round(x, 1), round(y, 1)] for x, y in body.exterior.coords[:-1]], balconies=balc,
                              openings=find_openings(body, walls["concrete"] + walls["block"], mpp), floors=floors, bbox=[round(v, 1) for v in (x0, y0, x1, y1)], floor=export([floor], 0.3)[0]["pts"],
                              walls={k2: export(v) for k2, v in walls.items()}, core=core)
        if labels0 is None and floors[0] >= 1:
            labels0 = (labels, floors[0])
    # העתקה מהגיליון (נקודות PDF) אל המתחם, לכל תא שטח: site = [x, y, 1] @ M
    def affine(lot, labels, floor):
        a = math.radians(b[lot]["rotation"] if not b[lot].get("mirror") else b["102"]["rotation"])
        base = "102" if b[lot].get("mirror") else lot
        R = np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]])
        apts = next(f["apts"] for f in b[base]["floors"] if f["floor"] == floor)
        types = [u["type"] for u in apts]
        u = next(u for u in apts if types.count(u["type"]) == 1 and u["type"] in labels)
        lx, ly = labels[u["type"]]
        t = np.array(u["at"]) - np.array([lx * mpp, -ly * mpp]) @ R
        M = np.vstack([np.array([[mpp, 0], [0, -mpp]]) @ R, t])
        if b[lot].get("mirror"):
            src = np.array([q["at"] for f in b["102"]["floors"] for q in f["apts"]]); dst = np.array([q["at"] for f in b[lot]["floors"] for q in f["apts"]])
            M2, *_ = np.linalg.lstsq(np.c_[src, np.ones(len(src))], dst, rcond=None)
            M = np.c_[M, [0, 0, 1]] @ M2
        return [[round(float(v), 6) for v in row] for row in M]
    fl = sorted(f for v in cfg["pages"].values() for f in v)
    z = {f: cfg["special"].get(f, round(cfg["first"] + 3.15 * (f - 1), 2)) for f in fl}
    levels = {str(f): [z[f], round((z[fl[i + 1]] if i + 1 < len(fl) else cfg["roof"]) - z[f], 2)] for i, f in enumerate(fl)}
    data = dict(levels=levels, roof=cfg["roof"], parapet=cfg["parapet"], pages=pages, lots={lot: affine(lot, *labels0) for lot in cfg["lots"]})
    (OUT / f"{key}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(key, {pg: (len(v["walls"]["concrete"]), len(v["walls"]["block"]), [c["name"] for c in v["core"]]) for pg, v in pages.items()})
