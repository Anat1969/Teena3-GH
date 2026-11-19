"""מייצא כל בניין לקובץ IFC4 שנפתח ב-Revit, ב-ArchiCAD ובכל צופה BIM, ומחשב כמויות.
האלמנטים: קומות (IfcBuildingStorey), קירות בטון ובלוק (IfcWall), תקרות ומרפסות (IfcSlab), חלונות (IfcWindow) ומעקות (IfcRailing).
המקור: public/floors/*.json, כלומר תוכניות הקומות. הפלט: public/ifc/<תא>.ifc ו-data/quantities.json.
הקואורדינטות: מטרים, ביחס לנקודת הייחוס של התוכנית ברשת ישראל (181187, 645146). הרצה: python3 tools/build-ifc.py"""
import json, math, pathlib
import ifcopenshell, ifcopenshell.api as api
from shapely.geometry import Polygon

ROOT = pathlib.Path(__file__).resolve().parent.parent
SLAB_T = 0.2
PLAN = {"101": "B", "102": "A", "103": "A", "104": "C"}
quantities = {}

for lot, plan in PLAN.items():
    d = json.loads((ROOT / "public" / "floors" / f"{plan}.json").read_text(encoding="utf-8"))
    M = d["lots"][lot]
    to = lambda p: (p[0] * M[0][0] + p[1] * M[1][0] + M[2][0], p[0] * M[0][1] + p[1] * M[1][1] + M[2][1])
    f = ifcopenshell.file(schema="IFC4")
    project = api.run("root.create_entity", f, ifc_class="IfcProject", name="מתחם האצ\"ל, רחובות")
    api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    ctx = api.run("context.add_context", f, context_type="Model")
    body = api.run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=ctx)
    site = api.run("root.create_entity", f, ifc_class="IfcSite", name="תא שטח " + lot)
    bld = api.run("root.create_entity", f, ifc_class="IfcBuilding", name="בניין " + lot)
    api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    api.run("aggregate.assign_object", f, products=[bld], relating_object=site)

    def solid(ring, holes, z, h):
        pl = lambda r: f.createIfcPolyline([f.createIfcCartesianPoint([float(x), float(y)]) for x, y in list(r) + [r[0]]])
        prof = f.createIfcArbitraryProfileDefWithVoids("AREA", None, pl(ring), [pl(x) for x in holes]) if holes else f.createIfcArbitraryClosedProfileDef("AREA", None, pl(ring))
        pos = f.createIfcAxis2Placement3D(f.createIfcCartesianPoint([0.0, 0.0, float(z)]), None, None)
        return f.createIfcExtrudedAreaSolid(prof, pos, f.createIfcDirection([0.0, 0.0, 1.0]), float(h))

    def add(cls, name, storey, solids, ptype=None):
        e = api.run("root.create_entity", f, ifc_class=cls, name=name, predefined_type=ptype)
        rep = f.createIfcShapeRepresentation(body, "Body", "SweptSolid", solids)
        api.run("geometry.assign_representation", f, product=e, representation=rep)
        api.run("spatial.assign_container", f, products=[e], relating_structure=storey)
        return e

    def strip(a, c, t):
        L = math.hypot(c[0] - a[0], c[1] - a[1]); nx, ny = (c[1] - a[1]) / L * t / 2, -(c[0] - a[0]) / L * t / 2
        return [(a[0] + nx, a[1] + ny), (c[0] + nx, c[1] + ny), (c[0] - nx, c[1] - ny), (a[0] - nx, a[1] - ny)]

    q = dict(storeys=0, concrete_m3=0.0, block_m3=0.0, slab_m2=0.0, balcony_m2=0.0, glazing_m2=0.0, windows=0, railing_m=0.0, walls=0)
    page_of = {str(fl): pg for pg in d["pages"].values() for fl in pg["floors"]}
    for fl, (z, h) in sorted(d["levels"].items(), key=lambda kv: kv[1][0]):
        pg = page_of[fl]
        name = {"0": "קומת קרקע", "0.5": "קומת גלריה"}.get(fl, "קומה " + fl)
        st = api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name=name)
        st.Elevation = float(z)
        api.run("aggregate.assign_object", f, products=[st], relating_object=bld)
        q["storeys"] += 1
        wh = h - SLAB_T
        for kind, label in (("concrete", "קיר בטון"), ("block", "קיר בלוק")):
            for w in pg["walls"][kind]:
                ring = [to(p) for p in w["pts"]]
                add("IfcWall", label, st, [solid(ring, [[to(p) for p in hh] for hh in w["holes"]], z, wh)])
                a = Polygon(ring, [[to(p) for p in hh] for hh in w["holes"]]).area
                q[kind + "_m3"] += a * wh; q["walls"] += 1
        ring = [to(p) for p in pg["floor"]]
        add("IfcSlab", "תקרה", st, [solid(ring, [], z - SLAB_T, SLAB_T)], "FLOOR")
        q["slab_m2"] += Polygon(ring).area
        for r in pg["balconies"]:
            cs = [to(p) for p in ((r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3]))]
            add("IfcSlab", "מרפסת", st, [solid(cs, [], z - SLAB_T, SLAB_T)], "FLOOR")
            add("IfcRailing", "מעקה זכוכית", st, [solid(strip(cs[i], cs[(i + 1) % 4], 0.04), [], z, 1.05) for i in range(4)])
            q["balcony_m2"] += Polygon(cs).area; q["railing_m"] += Polygon(cs).length
        for o in pg["openings"]:
            a, c = to((o[0], o[1])), to((o[2], o[3]))
            L = math.hypot(c[0] - a[0], c[1] - a[1])
            if L < 0.6:
                continue
            sill = 0.02 if L > 2.2 else 0.34
            win = add("IfcWindow", "ויטרינה" if L > 2.2 else "חלון", st, [solid(strip(a, c, 0.05), [], z + sill * wh, (0.8 - sill) * wh)])
            win.OverallWidth, win.OverallHeight = round(L, 2), round((0.8 - sill) * wh, 2)
            q["glazing_m2"] += L * (0.8 - sill) * wh; q["windows"] += 1
    f.write(str(ROOT / "public" / "ifc" / f"{lot}.ifc"))
    quantities[lot] = {k: (round(v, 1) if isinstance(v, float) else v) for k, v in q.items()}
    print(lot, quantities[lot], "| MB %.1f" % ((ROOT / "public" / "ifc" / f"{lot}.ifc").stat().st_size / 1e6))

(ROOT / "data" / "quantities.json").write_text(json.dumps(quantities, ensure_ascii=False), encoding="utf-8")
