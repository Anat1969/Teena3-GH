"""מחלץ מתוכנית קומה 5 של בניין A את הדירה A4-2T: קירות, קו מתאר, חדרים ומרפסות, וממקם אותה בבניין 103.
הפלט: data/apartment.json, בקואורדינטות המתחם (מטרים, x מזרחה ו-y צפונה). הרצה: python3 tools/build-apartment.py"""
import json, math, pathlib
import numpy as np, pymupdf
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parent.parent
MPP = 125 * 0.0254 / 72  # מטר לנקודת PDF, קנה מידה 1:125
PAGE, FLOOR, TYPE, LOT = 4, 5, "A4-2T", "103"
px = lambda x, y: (500 + x / 4.2, 400 + y / 4.2)  # נקודות שנמדדו על הגדלה של הגיליון
# קו המתאר של הדירה, כולל הקירות שלה, כפי שנקרא מהתוכנית
OUTLINE = [px(*p) for p in ((90, 400), (415, 400), (415, 585), (750, 585), (750, 745), (1000, 745), (1000, 1565), (150, 1565), (150, 1395), (90, 1395))]
BALCONIES = {"מרפסת": box(*px(685, 1215), *px(1000, 1565)), "מרפסת שירות": box(*px(415, 600), *px(735, 770))}
# שם החדר, מיקום התווית בגיליון, שטח במ"ר: מודפס בתוכנית, או מחושב מהמידות שבה (מסומן)
ROOMS = [("סלון ומטבח", (590, 730), 30.8, "מחושב ממידות 570 על 540"), ("ממ\"ד, חדר שינה 2", (552, 520), 9.1, "מודפס"), ("חדר רחצה", (548, 610), 4.5, "מודפס"),
         ("חדר שינה הורים", (700, 640), 9.7, "מחושב ממידות 329 על 295"), ("רחצה הורים", (706, 590), 3.2, "מחושב ממידות 235 על 135"),
         ("מרפסת", (700, 730), 12.0, "מחושב ממידות 330 על 365"), ("מרפסת שירות", (640, 560), 4.0, "מודפס")]
KIND = {(0.5, 0.75, 1.0): "concrete", (1.0, 0.55, 0.55): "block", (0.57, 1.0, 0.57): "block"}

page = pymupdf.open(ROOT / "source" / "plans" / "building-A-102-103.pdf")[PAGE]
outline = Polygon(OUTLINE)
walls = {"concrete": [], "block": []}
for d in page.get_drawings():
    kind = KIND.get(tuple(round(v, 2) for v in (d.get("fill") or ())))
    if not kind:
        continue
    pts = []
    for it in d["items"]:
        if it[0] == "l":
            pts += [(it[1].x, it[1].y), (it[2].x, it[2].y)]
        elif it[0] == "re":
            r = it[1]; pts += [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1)]
        elif it[0] == "qu":
            q = it[1]; pts += [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y)]
    if len(pts) >= 3:
        g = Polygon(pts).buffer(0).intersection(outline)
        if not g.is_empty and g.area > 0.5:
            walls[kind].append(g)

b = json.loads((ROOT / "data" / "buildings.json").read_text(encoding="utf-8"))
def unit_at(lot):
    return next(u["at"] for f in b[lot]["floors"] if f["floor"] == FLOOR for u in f["apts"] if u["type"] == TYPE)
# גיליון -> בניין 102: סיבוב ידוע, וההזזה מתווית הדירה
w = next(w for w in page.get_text("words") if w[4] == TYPE)
a = math.radians(b["102"]["rotation"])
def to102(p):
    x, y = p[0] * MPP, -p[1] * MPP
    return np.array([x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)])
t = np.array(unit_at("102")) - to102(((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))
# בניין 102 -> בניין 103: העתקה (כולל שיקוף) שנגזרת מכל הדירות של שני הבניינים
src = np.array([u["at"] for f in b["102"]["floors"] for u in f["apts"]]); dst = np.array([u["at"] for f in b[LOT]["floors"] for u in f["apts"]])
M, *_ = np.linalg.lstsq(np.c_[src, np.ones(len(src))], dst, rcond=None)
place = lambda p: [round(float(v), 3) for v in np.r_[to102(p) + t, 1] @ M]

def polys(g):
    g = unary_union(g).simplify(0.15)
    out = []
    for poly in (g.geoms if hasattr(g, "geoms") else [g]):
        if poly.area > 0.3:
            out.append(dict(pts=[place(p) for p in poly.exterior.coords[:-1]], holes=[[place(p) for p in h.coords[:-1]] for h in poly.interiors]))
    return out

right = np.array(place((1, 0))) - np.array(place((0, 0))); down = np.array(place((0, 1))) - np.array(place((0, 0)))
bearing = lambda v: round(math.degrees(math.atan2(v[0], v[1])) % 360)
out = dict(lot=LOT, floor=FLOOR, type=TYPE, level=b[LOT]["levels"][str(FLOOR)], plan_area=106.2,
           gross=round(outline.area * MPP * MPP, 1), outline=[place(p) for p in OUTLINE],
           walls={k: polys(v) for k, v in walls.items()},
           balconies=[dict(name=n, pts=[place(p) for p in g.exterior.coords[:-1]]) for n, g in BALCONIES.items()],
           rooms=[dict(name=n, at=place(p), area=ar, source=s) for n, p, ar, s in ROOMS],
           bearings=dict(balcony=bearing(right), living=bearing(down), entry=bearing(-right)))
(ROOT / "data" / "apartment.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("שטח קו המתאר %.1f מ\"ר | קירות בטון %d, בלוק %d | כיוונים %s | מפלס %.2f" % (out["gross"], len(out["walls"]["concrete"]), len(out["walls"]["block"]), out["bearings"], out["level"]))
