// נתוני דירות התמורה לבדיקת טענת הדירות המורחבות. מחושב מתוכניות הבניינים ומהמודל, בלי שמות.
import { type Building, centroid, lots, towers, unitFaces } from './site.ts'
import { heightMapFor } from './analysis.ts'
import { unitSun } from './shade.ts'
import { floorZ } from './site.ts'
import { KEY_DAYS } from './sun.ts'

export interface Row { lot: string; type: string; floor: number; top: number; rel: number; area: number | null; expanded: boolean; faces: string; park: boolean; winter: number; units: number }
const park = centroid(lots.find((l) => l.num === '501')!.rings[0])
const rooms = (t: string) => (t.startsWith('DPX') ? 5 : Number(/^[A-Z](\d)/.exec(t)?.[1] ?? 0))
const unitsIn = (b: Building) => lots.find((l) => l.num === b.lot)!.rights!.units

// ארבע הדירות המורחבות שבמגדלים, לפי טבלת הדירות המוצעות: בניין, טיפוס וקומה. שתיים מהן הן טיפוס A4 בלי האות T.
const TOWER_EXPANDED = new Set(['102|A4|4', '102|A4-4T|6', '103|A4|4', '103|A4-2T|5'])
const isTower = (lot: string) => lot === '102' || lot === '103'

let cache: Row[] | null = null
export function tmuraRows(): Row[] {
  if (cache) return cache
  const hm = heightMapFor('future'), out: Row[] = []
  for (const b of towers) for (const f of b.real?.floors ?? []) for (const u of f.apts) {
    const key = `${b.lot}|${u.type}|${f.floor}`
    if (!(u.tmura || TOWER_EXPANDED.has(key))) continue
    if (isTower(b.lot!) && rooms(u.type) >= 4 && !TOWER_EXPANDED.has(key)) continue // דירת T במגדל שלא שובץ בה בעלים
    const faces = unitFaces(b, u.at)
    const d = Math.hypot(park[0] - u.at[0], park[1] - u.at[1]), px = (park[0] - u.at[0]) / d, py = (park[1] - u.at[1]) / d
    out.push({
      lot: b.lot!, type: u.type, floor: f.floor, top: b.real!.top, rel: f.floor / b.real!.top, area: u.area, expanded: rooms(u.type) >= 4,
      faces: faces.map((x) => x.name).join(' ו'), park: faces.some((x) => x.nx * px + x.ny * py > 0.5),
      winter: unitSun(hm, faces, floorZ(b, f.floor), KEY_DAYS[0].day, b.id).hours, units: unitsIn(b),
    })
  }
  return (cache = out)
}
export const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0 }
