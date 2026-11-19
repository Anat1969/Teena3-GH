// מקור הנתונים היחיד: data/site.json, שנבנה מקובצי התוכנית בכלי tools/build-data.py.
// צירים מקומיים: x מזרחה, y צפונה, במטרים, סביב נקודת הייחוס של התוכנית.
import raw from '../../data/site.json' with { type: 'json' }

export type Pt = [number, number]
export interface Rights { floors: number; basements: number; height: number; units: number; coverage: number; main: number; service: number }
export interface Lot { num: string; use: string; code: number; area: number; rings: Pt[][]; rights: Rights | null }
export interface Building { id: number; kind: 'tower' | 'old' | 'ctx'; name: string; pts: Pt[]; h: number; floors: number; lot?: string }
export interface Facade { key: string; name: string; bearing: number; nx: number; ny: number; at: Pt; length: number }

const d = raw as unknown as {
  origin_wgs: Pt; boundary: Pt[]; lots: Lot[]; trees: { kind: 'uproot' | 'move' | 'keep'; at: Pt }[]
  lines: { kind: string; pts: Pt[]; closed: boolean }[]; streets: { name: string; at: Pt; rot: number }[]
  context: { h: number; pts: Pt[] }[]; geo: { lon0: number; lat0: number; a: number; b: number; c: number; d: number }
}

export const LAT = d.geo.lat0
export const LON = d.geo.lon0
export const boundary = d.boundary
export const lots = d.lots
export const trees = d.trees
export const streets = d.streets
export const geo = d.geo

export function inside(p: Pt, ring: Pt[]): boolean {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[j]
    if (y1 > p[1] !== y2 > p[1] && p[0] < ((x2 - x1) * (p[1] - y1)) / (y2 - y1) + x1) c = !c
  }
  return c
}

export function signedArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
  return a / 2
}

export function centroid(pts: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const k = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]
    a += k; cx += (pts[j][0] + pts[i][0]) * k; cy += (pts[j][1] + pts[i][1]) * k
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : pts[0]
}

const open = (pts: Pt[]) => (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1] ? pts.slice(0, -1) : pts)

const lotOf = (p: Pt) => lots.find((l) => l.rights && inside(p, l.rings[0]))

let nextId = 1
// המגדלים: המעטפת המרבית שבתוך קו הבניין, בגובה שבטבלה 5. תוכניות הבניינים יחליפו אותה.
export const towers: Building[] = d.lines
  .filter((l) => l.kind === 'line' && l.closed)
  .map((l) => {
    const pts = open(l.pts), lot = lotOf(centroid(pts))!
    return { id: nextId++, kind: 'tower' as const, name: lot.num === '401' ? 'בית הכנסת, תא 401' : `מגדל ${lot.num}`, pts, h: lot.rights!.height, floors: lot.rights!.floors, lot: lot.num }
  })
  .sort((a, b) => a.lot!.localeCompare(b.lot!))

const inSite = (c: { pts: Pt[] }) => inside(centroid(open(c.pts)), boundary)
// הבניינים הקיימים בתחום הקו הכחול, בגובה המדוד. שלוש קומות, לפי מסמך השמאי.
export const oldBuildings: Building[] = d.context
  .filter((c) => inSite(c) && c.h >= 2.5)
  .map((c, i) => ({ id: nextId++, kind: 'old' as const, name: c.h > 8 ? `בניין קיים ${i + 1}` : `מבנה קיים ${i + 1}`, pts: open(c.pts), h: c.h, floors: c.h > 8 ? 3 : 1 }))

export const context: Building[] = d.context
  .filter((c) => !inSite(c) && c.h > 0)
  .map((c) => ({ id: nextId++, kind: 'ctx' as const, name: 'שכן', pts: open(c.pts), h: c.h, floors: Math.max(1, Math.round(c.h / 3.1)) }))

// רשת הרחובות מסובבת, ולכן ארבע החזיתות הן אלכסוניות.
const DIRS = [
  { key: 'ne', name: 'צפון־מזרח', b: 53 }, { key: 'se', name: 'דרום־מזרח', b: 143 },
  { key: 'sw', name: 'דרום־מערב', b: 233 }, { key: 'nw', name: 'צפון־מערב', b: 323 },
]

export function facadesOf(b: Building): Facade[] {
  const ccw = signedArea(b.pts) > 0
  const best = new Map<string, Facade & { len: number }>()
  const total = new Map<string, number>()
  for (let i = 0; i < b.pts.length; i++) {
    const p = b.pts[i], q = b.pts[(i + 1) % b.pts.length]
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy)
    if (len < 1.5) continue
    const nx = (ccw ? dy : -dy) / len, ny = (ccw ? -dx : dx) / len
    const bearing = (Math.atan2(nx, ny) * 180) / Math.PI
    const dir = DIRS.reduce((m, k) => (Math.abs(((bearing - k.b + 540) % 360) - 180) < Math.abs(((bearing - m.b + 540) % 360) - 180) ? k : m))
    total.set(dir.key, (total.get(dir.key) ?? 0) + len)
    const cur = best.get(dir.key)
    if (!cur || len > cur.len)
      best.set(dir.key, { key: dir.key, name: dir.name, bearing: (bearing + 360) % 360, nx, ny, at: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], length: 0, len })
  }
  return DIRS.filter((k) => best.has(k.key)).map((k) => ({ ...best.get(k.key)!, length: total.get(k.key)! }))
}

/** גובה אמצע הקומה מעל הקרקע. הערכה: הגובה הכולל מחולק שווה בין הקומות. */
export const floorZ = (b: Building, floor: number) => ((floor - 0.5) * b.h) / b.floors

export const byId = (id: number | null) => [...towers, ...oldBuildings].find((b) => b.id === id) ?? null
