"""בונה את tasrit.html: דף התסריט, עם תרשים המתחם שמחושב מ-data/site.json.
הדף הוא קטע HTML (בלי html/head/body), כך שהוא מתפרסם גם כ-Artifact וגם נפתח ישירות מהריפו."""
import json, math, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from sun import shadow_vec  # noqa: E402

d = json.loads((ROOT / "data" / "site.json").read_text(encoding="utf-8"))

X0, X1, Y0, Y1 = -300, 250, -118, 300  # מסגרת התרשים במטרים מקומיים
W, H = X1 - X0, Y1 - Y0

def P(pt):
    return "%.1f,%.1f" % (pt[0] - X0, Y1 - pt[1])

def poly(pts, cls, extra=""):
    return '<polygon class="%s" points="%s"%s/>' % (cls, " ".join(P(p) for p in pts), extra)

def centroid(pts):
    a = cx = cy = 0.0
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        k = x1 * y2 - x2 * y1
        a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k
    return (cx / (3 * a), cy / (3 * a))

def inside(pt, ring):
    x, y = pt
    c = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c

def hull(points):
    pts = sorted(set(map(tuple, points)))
    def half(seq):
        out = []
        for p in seq:
            while len(out) >= 2 and (out[-1][0] - out[-2][0]) * (p[1] - out[-2][1]) - (out[-1][1] - out[-2][1]) * (p[0] - out[-2][0]) <= 0:
                out.pop()
            out.append(p)
        return out
    lo, up = half(pts), half(reversed(pts))
    return lo[:-1] + up[:-1]

def shadow(pts, height, day, hour):
    v = shadow_vec(day, hour, height)
    return hull(list(pts) + [(p[0] + v[0], p[1] + v[1]) for p in pts])

lots = {l["num"]: l for l in d["lots"]}
envelopes = [l for l in d["lines"] if l["kind"] == "line"]
towers = []
for env in envelopes:
    c = centroid(env["pts"])
    for num in ("101", "102", "103", "104", "401"):
        if inside(c, lots[num]["rings"][0]):
            towers.append(dict(num=num, pts=env["pts"], c=c, **lots[num]["rights"]))
towers.sort(key=lambda t: t["num"])
existing = [c for c in d["context"] if inside(centroid(c["pts"]), d["boundary"]) and c["h"] >= 2.5]
context = [c for c in d["context"] if not inside(centroid(c["pts"]), d["boundary"])
           and X0 - 20 < c["pts"][0][0] < X1 + 20 and Y0 - 20 < c["pts"][0][1] < Y1 + 20]

DAY = 355  # 21 בדצמבר
HOURS = (9, 12, 15)
svg = []
svg.append('<g class="ctx">' + "".join(poly(c["pts"], "tall" if c["h"] > 25 else "b") for c in context) + "</g>")
USE = {1250: "res", 400: "pub", 670: "park", 820: "road", 830: "road"}
svg.append("<g>" + "".join(poly(l["rings"][0], "lot " + USE[l["code"]]) for l in d["lots"] if USE[l["code"]] == "road") + "</g>")
svg.append("<g>" + "".join(poly(l["rings"][0], "lot " + USE[l["code"]]) for l in d["lots"] if USE[l["code"]] != "road") + "</g>")
svg.append(poly(d["boundary"], "blue"))
svg.append('<g class="trees">' + "".join('<circle class="%s" cx="%s" cy="%s" r="1.6"/>' % ((t["kind"],) + tuple(P(t["at"]).split(","))) for t in d["trees"]) + "</g>")

fut = ['<g id="fut">']
for hr in HOURS:
    fut.append('<g class="sh h%d">' % hr + "".join(poly(shadow(t["pts"], t["height"], DAY, hr), "s") for t in towers) + "</g>")
fut.append("".join(poly(t["pts"], "tower") for t in towers))
for t in towers:
    x, y = P(t["c"]).split(",")
    fut.append('<text class="tl" x="%s" y="%s"><tspan class="n">%s</tspan><tspan x="%s" dy="8.5">%d מ\'</tspan></text>' % (x, float(y) - 2, t["num"], x, t["height"]))
t103 = next(t for t in towers if t["num"] == "103")
for hr in HOURS:
    v = shadow_vec(DAY, hr, 99)
    x, y = P((t103["c"][0] + v[0] * 0.93, t103["c"][1] + v[1] * 0.93)).split(",")
    fut.append('<text class="hr" x="%s" y="%s">%d:00</text>' % (x, y, hr))
fut.append("</g>")
cur = ['<g id="cur" hidden>']
for hr in HOURS:
    cur.append('<g class="sh h%d">' % hr + "".join(poly(shadow(c["pts"], c["h"], DAY, hr), "s") for c in existing) + "</g>")
cur.append("".join(poly(c["pts"], "old") for c in existing))
cur.append("</g>")
svg += fut + cur
svg.append('<g class="dem">' + "".join(poly(l["pts"], "x") for l in d["lines"] if l["kind"] == "demolish") + "</g>")

for s in d["streets"]:
    x, y = P(s["at"]).split(",")
    rot = -s["rot"]
    if 90 < s["rot"] < 270:
        rot += 180
    svg.append('<text class="st" x="%s" y="%s" transform="rotate(%.1f %s %s)">%s</text>' % (x, y, rot, x, y, s["name"].replace('"', "&quot;")))

# שעות הצל, צפון, קנה מידה ורוח
v9, v12, v15 = (shadow_vec(DAY, h, 99) for h in HOURS)
svg.append('<g class="north" transform="translate(%d,%d)"><path d="M0,-26 L7,6 L0,1 L-7,6 Z"/><text y="20">צפון</text></g>' % (W - 34, 44))
svg.append('<g class="scale" transform="translate(%d,%d)"><path d="M0,0 H100 M0,-4 V4 M50,-3 V3 M100,-4 V4"/><text x="50" y="-8">100 מ\'</text></g>' % (W - 130, H - 18))
svg.append('<g class="wind" transform="translate(34,%d) rotate(38)"><path d="M0,0 H58 M58,0 l-9,-5 M58,0 l-9,5"/></g><text class="wl" x="70" y="%d">בריזת קיץ, ממערב ומצפון־מערב</text>' % (H - 150, H - 160))
svg.append('<g class="wind e" transform="translate(%d,%d) rotate(180)"><path d="M0,0 H58 M58,0 l-9,-5 M58,0 l-9,5"/></g><text class="wl" x="%d" y="%d">רוח חורף, ממזרח</text>' % (W - 16, H - 120, W - 46, H - 130))
SVG = '<svg viewBox="0 0 %d %d" role="img" aria-label="תרשים המתחם עם צל ב-21 בדצמבר">%s</svg>' % (W, H, "".join(svg))

rows = "".join(
    "<tr><td class=\"n\">%s</td><td>%s</td><td>%d</td><td>%d</td><td>%s</td><td>%s</td><td>%d</td></tr>" % (
        t["num"], "בית כנסת" if t["num"] == "401" else "מגורים, ציבור בקרקע", t["floors"], t["height"],
        t["units"] or "", "{:,}".format(lots[t["num"]]["area"].__round__()), round(shadow_vec(DAY, 12, t["height"])[2]))
    for t in towers)
n_trees = {k: sum(1 for t in d["trees"] if t["kind"] == k) for k in ("uproot", "move", "keep")}
old_h = sorted(c["h"] for c in existing if c["h"] > 8)
facts = dict(ctx=len(d["context"]), old=len([c for c in existing if c["h"] > 8]), oldh=old_h[len(old_h) // 2],
             s12=round(v12[2]), s9=round(v9[2]), alt12=v12[3], **n_trees)

tpl = (ROOT / "tools" / "tasrit.template.html").read_text(encoding="utf-8")
html = tpl.replace("{{SVG}}", SVG).replace("{{ROWS}}", rows)
for k, v in facts.items():
    html = html.replace("{{%s}}" % k, ("%.1f" % v) if isinstance(v, float) else str(v))
(ROOT / "tasrit.html").write_text(html, encoding="utf-8")
print(facts, "towers", [(t["num"], t["height"]) for t in towers], "ctx in frame", len(context), "bytes", len(html))
