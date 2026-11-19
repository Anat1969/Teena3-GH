"""חותך את ארבע החזיתות של כל בניין מגיליונות ההיתר, ומכין אותן להלבשה על המודל.
גיליונות ההיתר (101.pdf, 103.pdf, 104.pdf) נמצאים בדרייב של ענת ולא בריפו. הרצה:
  python3 tools/build-facades.py <תיקייה עם קובצי ההיתר>
הפלט: public/facades/<A|B|C>-<צד>.jpg ו-data/facades.json.
חזית היא היטל ישר, ולכן מלבישים אותה על הבניין בהיטל ישר מאותו כיוון: כל נקודה בקיר מקבלת את הצבע שמולה בשרטוט."""
import json, math, pathlib, subprocess, sys, tempfile
import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = pathlib.Path(sys.argv[1])
DPI = 72
# לכל בניין: קובץ ההיתר, התא שלפיו שורטטו החזיתות, הגובה המרבי שמסומן בשרטוט, רצועת החזיתות בגיליון,
# והחלון האופקי שבו נמצא הבניין בכל חזית (בפיקסלים ב-72 dpi). הצד הוא צד הגיליון של תוכנית הקומה.
SHEETS = {
    "A": dict(file="103.pdf", lot="103", hmax=99.0, strip=(0, 0, 3700, 870), ref=("bottom", 113),
              sides=dict(bottom=(185, 392), right=(1590, 1880), left=(2090, 2335), top=(3120, 3325))),
    "B": dict(file="101.pdf", lot="101", hmax=71.0, strip=(0, 0, 3700, 870), ref=("bottom", 247),
              sides=dict(bottom=(503, 678), left=(1225, 1447), top=(1655, 1832), right=(2450, 2664))),
    "C": dict(file="104.pdf", lot="104", hmax=37.0, strip=(0, 400, 2950, 760), ref=("right", 265),
              sides=dict(right=(193, 402), top=(1253, 1618), left=(1888, 2100), bottom=(2393, 2757))),
}
NORMAL = dict(right=(1, 0), left=(-1, 0), top=(0, -1), bottom=(0, 1))  # בצירי הגיליון, y כלפי מטה
floors = {k: json.loads((ROOT / "public" / "floors" / f"{k}.json").read_text(encoding="utf-8")) for k in SHEETS}
out = {}

def render(pdf, box, dpi):
    x, y, w, h = [int(v * dpi / DPI) for v in box]
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(["pdftoppm", "-r", str(dpi), "-x", str(x), "-y", str(y), "-W", str(w), "-H", str(h), "-png", "-singlefile", str(pdf), tmp + "/s"], check=True)
        return Image.open(tmp + "/s.png").convert("RGB").copy()

for key, cfg in SHEETS.items():
    strip = render(SRC / cfg["file"], cfg["strip"], DPI)
    a = np.asarray(strip).astype(int)
    dark = (a.sum(axis=2) < 330)  # קווים וזיגוג כהה
    ink = (a.sum(axis=2) < 660)  # כל מה שאינו נייר לבן, כולל קווי חזית בהירים
    def ground(x0, x1):
        """קו הקרקע: השורה הכהה והרציפה ביותר מתחת לבניין."""
        y0 = int(a.shape[0] * 0.78)  # מתחת לגוף הבניין, כדי לא לתפוס פס כהה של מרפסות
        rows = dark[y0:int(a.shape[0] * 0.95), x0:x1].mean(axis=1)
        return y0 + int(rows.argmax())
    rx0, rx1 = cfg["sides"][cfg["ref"][0]]
    ppm = (ground(rx0, rx1) - cfg["ref"][1]) / cfg["hmax"]  # פיקסלים למטר, מקו הגובה המרבי שבחזית הייחוס
    M = np.array(floors[key]["lots"][cfg["lot"]])
    L = M[:2]  # החלק הליניארי: גיליון -> מתחם
    sides = {}
    g = int(np.median([ground(*w) for w in cfg["sides"].values()]))  # קו קרקע אחד לכל הגיליון
    ppm = (g - cfg["ref"][1]) / cfg["hmax"]
    for side, (x0, x1) in cfg["sides"].items():
        top = g - cfg["hmax"] * ppm
        # גבולות הבניין בתוך החלון: עמודות שיש בהן תוכן כהה בגוף הבניין
        body = ink[int(top + 12 * ppm):int(g - 14 * ppm), x0:x1].mean(axis=0)
        cols = np.where(body > 0.12)[0]
        bx0, bx1 = x0 + int(cols.min()), x0 + int(cols.max()) + 1
        k = 2  # רזולוציה כפולה לטקסטורה
        box = (cfg["strip"][0] + bx0, cfg["strip"][1] + top, bx1 - bx0, g - top)
        img = render(SRC / cfg["file"], box, DPI * k)
        img.save(ROOT / "public" / "facades" / f"{key}-{side}.jpg", quality=82, optimize=True)
        # כיוון שמאל-התמונה בצירי הגיליון: מי שמביט בחזית רואה משמאלו את הכיוון שבזווית +90 מהנורמל
        n = np.array(NORMAL[side]) @ L
        left_site = np.array([n[1], -n[0]])
        left_sheet = left_site @ np.linalg.inv(L)
        axis = [float(np.sign(left_sheet[0])), 0.0] if abs(left_sheet[0]) > abs(left_sheet[1]) else [0.0, float(np.sign(left_sheet[1]))]
        sides[side] = dict(img=f"/facades/{key}-{side}.jpg", left=axis, width=round((bx1 - bx0) / ppm, 1), bearing=round(math.degrees(math.atan2(n[0], n[1])) % 360))
        print(key, side, "כיוון", sides[side]["bearing"], "רוחב %.1f מ'" % sides[side]["width"], "קרקע", g, "שמאל התמונה", axis)
    out[key] = dict(hmax=cfg["hmax"], sides=sides, lots={lot: floors[key]["lots"][lot] for lot in floors[key]["lots"]})

(ROOT / "data" / "facades.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
