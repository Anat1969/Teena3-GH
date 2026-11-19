"""בונה את data/site.json מקובצי התוכנית שב-source/.
מקור אחד לכל התצוגות: תאי שטח, קווי בניין, מבנים להריסה, עצים, שמות רחובות ומבני הסביבה.
הקואורדינטות: מטרים מקומיים, ציר x מזרחה וציר y צפונה, סביב נקודת הייחוס של התוכנית ברשת ישראל החדשה."""
import json, re, sys, pathlib
import shapefile
from pyproj import Transformer

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
ORIGIN = (181187.0, 645146.0)  # נקודת הייחוס מסעיף 1.5.1 בהוראות
to_itm = Transformer.from_crs(4326, 2039, always_xy=True)
to_wgs = Transformer.from_crs(2039, 4326, always_xy=True)

def loc(x, y):
    return [round(x - ORIGIN[0], 2), round(y - ORIGIN[1], 2)]

def rd(name):
    return shapefile.Reader(str(SRC / "shp" / name), encoding="utf-8")

def rings(shape):
    parts = list(shape.parts) + [len(shape.points)]
    return [[loc(*p) for p in shape.points[a:b]] for a, b in zip(parts, parts[1:])]

# זכויות והוראות בנייה: טבלה 5 בתוכנית 414-1113752 (עובדה, מהמסמך המחייב)
RIGHTS = {
    "101": dict(floors=20, basements=4, height=71, units=73, coverage=45, main=7385, service=3000),
    "102": dict(floors=28, basements=4, height=99, units=133, coverage=45, main=13469, service=5750),
    "103": dict(floors=28, basements=4, height=99, units=133, coverage=45, main=13469, service=5750),
    "104": dict(floors=10, basements=3, height=37, units=36, coverage=45, main=3702, service=1500),
    "401": dict(floors=4, basements=0, height=17, units=0, coverage=34, main=615, service=50),
}

out = {"origin_itm": ORIGIN, "origin_wgs": [round(v, 7) for v in to_wgs.transform(*ORIGIN)]}

# העתקה ליניארית ממעלות למטרים מקומיים סביב נקודת הייחוס (כוללת את סיבוב הרשת), לשכבת הלוויין
lon0, lat0 = to_wgs.transform(*ORIGIN)
e = 0.01
ax, ay = to_itm.transform(lon0 + e, lat0)
bx, by = to_itm.transform(lon0, lat0 + e)
out["geo"] = dict(lon0=lon0, lat0=lat0, a=(ax - ORIGIN[0]) / e, c=(ay - ORIGIN[1]) / e, b=(bx - ORIGIN[0]) / e, d=(by - ORIGIN[1]) / e)

r = rd("MVT_GVUL")
out["boundary"] = rings(r.shape(0))[0]

lots = []
r = rd("MVT_PLAN")
for s, rec in zip(r.shapes(), r.records()):
    d = rec.as_dict()
    num = str(d["NUM"]).strip()
    lots.append(dict(num=num, use=d["MAVAT_NAME"].strip(), code=int(d["MAVAT_CODE"]),
                     area=round(d["SHAPE_AREA"], 1), rings=rings(s), rights=RIGHTS.get(num)))
out["lots"] = sorted(lots, key=lambda l: l["num"])

KIND = {"21120": "demolish", "21010": "line", "21020": "line_upper", "21030": "line_under", "23500": "dim"}
lines = []
r = rd("MVT_ARC")
for s, rec in zip(r.shapes(), r.records()):
    k = KIND.get(str(rec.as_dict()["MAVAT_CODE"]).strip(), "other")
    if k == "dim":
        continue
    for ring in rings(s):
        lines.append(dict(kind=k, pts=ring, closed=ring[0] == ring[-1]))
out["lines"] = lines

TREE = {"22150": "uproot", "22160": "move", "22170": "keep"}
trees = []
r = rd("MVT_SYMBOL")
for s, rec in zip(r.shapes(), r.records()):
    k = TREE.get(str(rec.as_dict()["MAVAT_CODE"]).strip())
    if k:
        trees.append(dict(kind=k, at=loc(*s.points[0])))
out["trees"] = trees

streets = []
r = rd("MVT_LABEL")
for s, rec in zip(r.shapes(), r.records()):
    d = rec.as_dict()
    if d["BLOCKNAME"] == "txt1":
        streets.append(dict(name=d["LABEL"].strip(), at=loc(*s.points[0]), rot=round(float(d["ROTATION"]), 1)))
out["streets"] = streets

# מבני הסביבה מה-KML (WGS84)
kml = (SRC / "plan.kml").read_text(encoding="utf-8")
ctx = []
folder = kml[kml.index("מבנים בסביבה"):] if "מבנים בסביבה" in kml else ""
for c in re.findall(r"<coordinates>(.*?)</coordinates>", folder, flags=re.S):
    raw = [tuple(float(v) if v not in ("None", "") else 0.0 for v in t.split(",")) for t in c.split()]
    xy = [to_itm.transform(lon, lat) for lon, lat, _ in raw]
    big = abs(sum(xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1] for i in range(len(xy) - 1))) / 2 > 15000
    if len(raw) >= 4 and not big:  # הפוליגון הענק הוא גבול התוכנית, לא מבנה
        ctx.append(dict(h=round(raw[0][2], 1), pts=[loc(*to_itm.transform(lon, lat)) for lon, lat, _ in raw]))
out["context"] = ctx

(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "data" / "site.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print("lots", len(lots), "lines", {k: sum(1 for l in lines if l["kind"] == k) for k in set(l["kind"] for l in lines)},
      "closed demolish", sum(1 for l in lines if l["kind"] == "demolish" and l["closed"]),
      "trees", len(trees), "streets", [s["name"] for s in streets], "context", len(ctx), "origin", out["origin_wgs"])
