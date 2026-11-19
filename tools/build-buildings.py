"""מחלץ מתוכניות הבניינים (source/plans) את קו המתאר האמיתי של קומה טיפוסית, וממקם אותו במתחם.
המיקום: קו המגרש (כחול) וקו הבניין (אדום) שבגיליון מותאמים לתאי השטח ולקווי הבניין שבקובצי התוכנית.
הפלט: data/buildings.json. הרצה: python3 tools/build-buildings.py"""
import json, math, os, pathlib, re, sys
import numpy as np, cv2, pymupdf
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
site = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))
UNIT = re.compile(r"^(?:[ABC]\d(?:\.\d)?(?:PH)?(?:-[A-Z0-9]+)?|DPX\d)$")  # טיפוס דירה, לא סימון חתך כמו A102

def is_tmura(plan, name, floor):
    """דירת תמורה: האות T בשם הטיפוס. במגדלי A גם דירות שלושת החדרים בקומות 1 עד 20,
    שסומנו בטבלת הדירות המוצעות כדירות של בעלי הקרקע (34 דירות, לפי סיכום הטבלה)."""
    return name.endswith("T") or (plan == "A" and name in ("A3", "A3-1") and 1 <= floor <= 20)

def keyed(apts):
    """מפתח ייחודי לדירה בקומה: טיפוס שחוזר פעמיים מקבל מספר סידורי. תווית חלקית שנחתכה מתווית אחרת נזרקת."""
    apts = [a for a in apts if not any(b is not a and b["type"].startswith(a["type"] + "-") and math.dist(a["at"], b["at"]) < 3 for b in apts)]
    seen = {}
    for a in apts:
        seen[a["type"]] = seen.get(a["type"], 0) + 1
        a["key"] = a["type"] if seen[a["type"]] == 1 else "%s (%d)" % (a["type"], seen[a["type"]])
    return apts

def span(*parts):
    out = []
    for p in parts:
        out += list(range(p[0], p[1] + 1)) if isinstance(p, tuple) else [p]
    return out

# לכל גיליון: אילו קומות הוא מייצג, לפי כותרת הגיליון. base: מספר המפלסים שמתחת לקומה 1.
PLANS = {
    "A": dict(file="building-A-102-103.pdf", scale=125, typical=3, lots=["102", "103"], base=2,
              pages={3: span((1, 4), (21, 26)), 4: [5], 5: [6], 6: span((7, 20)), 7: [27]}),
    "B": dict(file="building-B-101.pdf", scale=100, typical=3, lots=["101"], base=2,
              pages={3: [1, 2, 3, 17, 18], 4: [4], 5: [5, 8, 9], 6: [6], 7: [7], 8: [10, 13, 15, 16], 9: [11], 10: [12], 11: [14], 12: [19]}),
    "C": dict(file="building-C-104.pdf", scale=100, typical=2, lots=["104"], base=1,
              pages={1: [0], 2: [1, 4, 5, 6, 7, 8], 3: [2], 4: [3], 5: [9]}),
}
# שטח מכר מוצע במ"ר, מטבלת הדירות המוצעות (רק טיפוסים שנקראו בוודאות). בלי שמות דיירים.
AREAS = {
    "B4": 114.2, "B3": 80.0, "B3-T": 80.0, "B5-1": 134.9, "B5-2": 137.3, "B5-7T": 135.0, "B5-8": 137.1, "B5-5T": 130.0, "B5-6": 142.1,
    "B4-3": 110.9, "DPX1": 76.5, "B5-PH": 150.5, "B7-PH": 216.1,
    "C3": 80.0, "C4": 119.4, "C5": 143.0, "C6": 148.3, "C6-2": 152.8, "C4.5-T": 125.8, "C6-T": 147.5, "C5-1": 143.9, "C3-G": 80.0, "C4-G": 119.4,
    "C6PH-1": 164.5, "C6PH-2": 160.8,
    "A4": 103.0, "A4-1": 127.5, "A3": 80.0, "A5": 139.2, "A3-1": 80.0, "A5-1": 150.5, "A4-2T": 102.2, "A4-3": 128.3, "A4-4T": 108.0,
    "A6-PH": 206.7, "A5-PH1": 185.1, "A5-PH2": 174.1,
}
K = 3.0  # פיקסלים לנקודת PDF

def segments(page, color):
    out = []
    for x in page.get_drawings():
        col = tuple(round(v, 2) for v in (x.get("color") or ()))
        if col != color or (x.get("width") or 0) < 1:
            continue
        for it in x["items"]:
            if it[0] == "l":
                out.append((it[1].x, it[1].y, it[2].x, it[2].y))
    return out

def sample(segs, m_per_pt, step=0.5):
    pts = []
    for x1, y1, x2, y2 in segs:
        L = math.hypot(x2 - x1, y2 - y1) * m_per_pt
        n = max(1, int(L / step))
        for i in range(n + 1):
            t = i / n
            pts.append(((x1 + (x2 - x1) * t) * m_per_pt, -(y1 + (y2 - y1) * t) * m_per_pt))
    return np.array(pts)

def silhouette(page, m_per_pt):
    """קו המתאר של הבניין: כל מה שסגור בקווים, אחרי ניקוי קווי מידה ואותיות."""
    pix = page.get_pixmap(matrix=pymupdf.Matrix(K, K), colorspace=pymupdf.csGRAY, alpha=False)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
    ink = img < 150
    # מוחקים קווים מקווקווים צבעוניים (אדום וכחול) כדי שלא יסגרו שטחים
    rgb = page.get_pixmap(matrix=pymupdf.Matrix(K, K), alpha=False)
    c = np.frombuffer(rgb.samples, dtype=np.uint8).reshape(rgb.height, rgb.width, 3).astype(int)
    colored = (abs(c[..., 0] - c[..., 2]) > 90)
    ink &= ~colored
    lab, _ = ndimage.label(~ink)
    counts = np.bincount(lab.ravel())
    counts[0] = 0
    # הרקע שבתוך המסגרת הוא השטח הלבן הגדול בגיליון; גם השוליים שמחוץ למסגרת אינם בניין
    solid = (lab != int(counts.argmax())) & (lab != lab[3, 3])
    px_m = 1 / (K / m_per_pt)  # מטר לפיקסל
    r = max(2, int(0.9 / px_m))  # פתיחה של כ-0.9 מטר מסירה קווי מידה, צירים ואותיות
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    solid = cv2.morphologyEx(solid.astype(np.uint8), cv2.MORPH_OPEN, ker)
    # ליבה: פתיחה חזקה של כ-2 מטר מנתקת קירות פיתוח וקווי מגרש שנוגעים בבניין.
    r2 = int(2.0 / px_m)
    ker2 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r2 + 1, 2 * r2 + 1))
    core = cv2.erode(solid, ker2)
    lab2, n = ndimage.label(core)
    sizes = ndimage.sum(core, lab2, range(1, n + 1))
    best = None
    for i in np.argsort(sizes)[::-1]:
        ys, xs = np.where(lab2 == i + 1)
        if ys.max() < pix.height * 0.9:  # לא הכותרת שבתחתית הגיליון
            best = i + 1
            break
    # מחזירים לליבה את מה שנשחק ממנה, בלי מה שנותק
    grown = cv2.dilate((lab2 == best).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r2 + 5, 2 * r2 + 5))) & solid
    lab2, best = grown, 1
    if os.environ.get("DEBUG"):
        cv2.imwrite(os.environ["DEBUG"] + "/mask-%d.png" % page.number, cv2.resize(((lab2 == best) * 255).astype(np.uint8), None, fx=0.3, fy=0.3))
    mask = (lab2 == best).astype(np.uint8)
    mask = ndimage.binary_fill_holes(mask).astype(np.uint8)
    cnt = max(cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)[0], key=cv2.contourArea)
    poly = cv2.approxPolyDP(cnt, 0.25 / px_m, True)[:, 0, :]
    return np.array([(x / K * m_per_pt, -y / K * m_per_pt) for x, y in poly]), cv2.contourArea(cnt) * px_m * px_m

def dist_map(rings, half=160, cell=0.25):
    n = int(2 * half / cell)
    img = np.ones((n, n), np.uint8)
    for ring in rings:
        p = np.array([[(x + half) / cell, (y + half) / cell] for x, y in ring], np.int32)
        cv2.polylines(img, [p], False, 0, 1)
    d = cv2.distanceTransform(img, cv2.DIST_L2, 3) * cell
    return np.minimum(d, 3.0), half, cell

def lookup(dm, pts):
    d, half, cell = dm
    ij = np.clip(((pts + half) / cell).astype(int), 0, d.shape[0] - 1)
    return d[ij[..., 1], ij[..., 0]]

def rot(pts, deg, mirror=False):
    p = pts * np.array([-1, 1]) if mirror else pts
    a = math.radians(deg)
    return p @ np.array([[math.cos(a), math.sin(a)], [-math.sin(a), math.cos(a)]])

def inside_mask(poly, half=160, cell=0.25):
    n = int(2 * half / cell)
    img = np.zeros((n, n), np.uint8)
    cv2.fillPoly(img, [np.array([[(x + half) / cell, (y + half) / cell] for x, y in poly], np.int32)], 1)
    return img, half, cell

lots = {l["num"]: l for l in site["lots"]}
dm_lot = dist_map([l["rings"][0] + [l["rings"][0][0]] for l in site["lots"]])
dm_line = dist_map([l["pts"] for l in site["lines"] if l["kind"].startswith("line")])
envelopes = {}
for l in site["lines"]:
    if l["kind"] == "line" and l["closed"]:
        c = np.mean(l["pts"], axis=0)
        for num in ("101", "102", "103", "104"):
            ring = np.array(lots[num]["rings"][0], np.float32)
            if cv2.pointPolygonTest(ring, (float(c[0]), float(c[1])), False) > 0:
                envelopes[num] = l["pts"]

def register(blue, red, foot, num):
    """מחפש סיבוב והזזה שמניחים את קווי הגיליון על קווי התוכנית. מחזיר (ציון, זווית, הזזה)."""
    target = np.mean(envelopes[num], axis=0)
    best = (9e9, 0, None)
    grid = np.arange(-18, 18.01, 0.75)
    gx, gy = np.meshgrid(grid, grid)
    shifts = np.stack([gx.ravel(), gy.ravel()], 1)
    for deg in np.arange(0, 360, 0.5):
        b, r, f = rot(blue, deg), rot(red, deg), rot(foot, deg)
        base = target - f.mean(axis=0)
        s = lookup(dm_lot, b[None] + (base + shifts)[:, None]).mean(1)
        if len(r):
            s = s + lookup(dm_line, r[None] + (base + shifts)[:, None]).mean(1)
        i = int(s.argmin())
        if s[i] < best[0]:
            best = (float(s[i]), float(deg), base + shifts[i])
    score, deg0, t0 = best
    for step_d, step_t, span in ((0.1, 0.15, 0.9), (0.02, 0.03, 0.2)):  # עידון
        cand = (9e9,)
        g = np.arange(-span, span + 1e-9, step_t)
        gx, gy = np.meshgrid(g, g)
        sh = np.stack([gx.ravel(), gy.ravel()], 1)
        for deg in np.arange(deg0 - 5 * step_d, deg0 + 5 * step_d + 1e-9, step_d):
            b, r = rot(blue, deg), rot(red, deg)
            # ההזזה מוגדרת סביב ראשית הגיליון המסובבת, ולכן מחשבים אותה מחדש לכל זווית
            base = t0 + (rot(foot, deg0).mean(axis=0) - rot(foot, deg).mean(axis=0))
            s = lookup(dm_lot, b[None] + (base + sh)[:, None]).mean(1)
            if len(r):
                s = s + lookup(dm_line, r[None] + (base + sh)[:, None]).mean(1)
            i = int(s.argmin())
            if s[i] < cand[0]:
                cand = (float(s[i]), float(deg), base + sh[i])
        score, deg0, t0 = cand
    return score, deg0, t0

def fit_inside(foot, num):
    """לבניין שאין לו גיליון מיקום: מניחים את קו המתאר כך שיישב בתוך קו הבניין של התא. הערכה."""
    mask = inside_mask(envelopes[num])
    target = np.mean(envelopes[num], axis=0)
    dense = sample([(a[0], -a[1], b[0], -b[1]) for a, b in zip(foot, np.roll(foot, -1, axis=0))], 1.0, 0.5)
    best = (-1,)
    g = np.arange(-8, 8.01, 0.5)
    gx, gy = np.meshgrid(g, g)
    sh = np.stack([gx.ravel(), gy.ravel()], 1)
    for mirror in (False, True):
        for deg in np.arange(0, 360, 1.0):
            f = rot(dense, deg, mirror)
            base = target - f.mean(axis=0)
            p = f[None] + (base + sh)[:, None]
            ij = np.clip(((p + mask[1]) / mask[2]).astype(int), 0, mask[0].shape[0] - 1)
            s = mask[0][ij[..., 1], ij[..., 0]].mean(1)
            i = int(s.argmax())
            if s[i] > best[0]:
                best = (float(s[i]), float(deg), base + sh[i], mirror)
    return best

out = {}
for key, cfg in PLANS.items():
    if os.environ.get("ONLY") and key not in os.environ["ONLY"]:
        continue
    doc = pymupdf.open(ROOT / "source" / "plans" / cfg["file"])
    page = doc[cfg["typical"]]
    mpp = cfg["scale"] * 0.0254 / 72
    foot, area = silhouette(page, mpp)
    blue, red = sample(segments(page, (0, 0, 1)), mpp), sample(segments(page, (1, 0, 0)), mpp)
    def labels_of(pg):
        return [(w[4], ((w[0] + w[2]) / 2 * mpp, -(w[1] + w[3]) / 2 * mpp)) for w in doc[pg].get_text("words")
                if UNIT.match(w[4]) and w[4][0] in (key, "D")]
    fits = {num: register(blue, red, foot, num) for num in cfg["lots"]}
    drawn = min(fits, key=lambda n: fits[n][0])
    for num in cfg["lots"]:
        if num == drawn:
            score, deg, t = fits[num]
            mirror, how = False, "מיקום לפי קו המגרש וקו הבניין שבגיליון"
        else:
            contain, deg, t0, mirror = fit_inside(foot, num)
            # ההזזה חושבה על נקודות צפופות; מעבירים אותה לקו המתאר עצמו
            dense = sample([(a[0], -a[1], b[0], -b[1]) for a, b in zip(foot, np.roll(foot, -1, axis=0))], 1.0, 0.5)
            t = t0 + rot(dense, deg, mirror).mean(axis=0) - rot(dense, deg, mirror).mean(axis=0)
            score, how = 1 - contain, "הערכה: אותה תוכנית, מונחת בתוך קו הבניין של התא"
            base = t0
        if num == drawn:
            place = lambda p: rot(np.array(p), deg) + t
        else:
            place = lambda p, deg=deg, mirror=mirror, base=t0: rot(np.array(p), deg, mirror) + base
        pts = place(foot)
        floors = []
        for pg, nums in cfg["pages"].items():
            apts = [dict(type=name, at=[round(float(v), 2) for v in place(np.array([at]))[0]], area=AREAS.get(name)) for name, at in labels_of(pg)]
            apts = keyed(sorted(apts, key=lambda a: (a["type"], a["at"])))
            floors += [dict(floor=f, apts=[dict(a, tmura=is_tmura(key, a["type"], f)) for a in apts]) for f in nums]
        floors.sort(key=lambda x: x["floor"])
        apts = floors
        out[num] = dict(plan=key, how=how, score=round(score, 3), rotation=round(deg, 2), mirror=bool(mirror), floor_area=round(float(area), 1), base=cfg["base"],
                        pts=[[round(float(x), 2), round(float(y), 2)] for x, y in pts], floors=apts)
        print(num, key, "| שטח קומה %.0f מ\"ר | זווית %.2f | ציון %.3f | %s | דירות %s" % (area, deg, score, how, sum(len(f["apts"]) for f in apts)))

if os.environ.get("ONLY"):
    prev = json.loads((ROOT / "data" / "buildings.json").read_text(encoding="utf-8")) if (ROOT / "data" / "buildings.json").exists() else {}
    out = {**prev, **out}
(ROOT / "data" / "buildings.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
