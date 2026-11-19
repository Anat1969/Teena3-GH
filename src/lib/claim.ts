// נתוני דירות התמורה לבדיקת טענת הדירות המורחבות. מחושב מתוכניות הבניינים ומהמודל, בלי שמות.
import { type Building, centroid, lots, towers, unitFaces } from './site.ts'
import { heightMapFor } from './analysis.ts'
import { unitSun } from './shade.ts'
import { floorZ } from './site.ts'
import { KEY_DAYS } from './sun.ts'

export interface Row { value: number; ppm: number; lot: string; type: string; floor: number; top: number; rel: number; area: number; expanded: boolean; faces: string; park: boolean; winter: number; units: number }
// שטחי דירה לטיפוסים שלא נקראו מהטבלה הסרוקה, מטבלת האקסל של דירות התמורה
const AREA_MORE: Record<string, number> = { 'B5-3T': 131, 'B5-2T': 137.3, 'B5-5T': 130, 'B5-7T': 135, 'B3-1T': 80, 'B3-2T': 80, DPX0: 83.5, A4: 103, 'A4-4T': 108, 'A4-2T': 102.2, 'C4.5-T': 125.8, 'C6-T': 147.5 }
/** אומדן שווי ראשוני לדירת תמורה: שטח כפול מחיר בסיס, עם תוספת לקומה ותוספת למ"ר בדירה קטנה. הנחות, לא שומה. */
export const VALUE = { base: 26000, perFloor: 0.5, small: 10 }
export const estimate = (area: number, floor: number, v = VALUE) => area * v.base * (1 + (v.perFloor * (floor - 5)) / 100) * (area <= 85 ? 1 + v.small / 100 : 1)
/** ארבעת בעלי הדירות המורחבות שבמגדלים, שאישרו לחשוף את שמם (19.11.2026). הבניין של שתי דירות קומה 4 לפי הטבלה הסרוקה, ראו הערה בדף. */
export const FOUR = [
  { name: 'עובדיה ויהודית דוד', lot: '103', floor: 5, type: 'A4-2T' },
  { name: 'חן שני', lot: '102', floor: 6, type: 'A4-4T' },
  { name: 'יניב כהן', lot: '102', floor: 4, type: 'A4' },
  { name: 'נינה צוקר', lot: '103', floor: 4, type: 'A4' },
]
const park = centroid(lots.find((l) => l.num === '501')!.rings[0])
const rooms = (t: string) => (t.startsWith('DPX') ? 5 : Number(/^[A-Z](\d)/.exec(t)?.[1] ?? 0))
const unitsIn = (b: Building) => lots.find((l) => l.num === b.lot)!.rights!.units

// ארבע הדירות המורחבות שבמגדלים, לפי טבלת הדירות המוצעות: בניין, טיפוס וקומה. שתיים מהן הן טיפוס A4 בלי האות T.
const TOWER_EXPANDED = new Set(['102|A4|4', '102|A4-4T|6', '103|A4|4', '103|A4-2T|5'])
const isTower = (lot: string) => lot === '102' || lot === '103'

/** האם הדירה שייכת לבעלים ותיקים (דירת תמורה), ולא ליזם. */
export const isOwnerUnit = (lot: string, type: string, floor: number, tmura: boolean) => {
  const key = `${lot}|${type}|${floor}`
  if (TOWER_EXPANDED.has(key)) return true
  return tmura && !(isTower(lot) && rooms(type) >= 4)
}
export const isFour = (lot: string, type: string, floor: number) => TOWER_EXPANDED.has(`${lot}|${type}|${floor}`)
export type Paint = 'none' | 'four' | 'owners' | 'types'
export const LEGEND: Record<Exclude<Paint, 'none'>, { key: string; name: string; color: string }[]> = {
  four: [{ key: 'four', name: 'ארבע הדירות המורחבות שבמגדלים', color: '#D7263D' }],
  owners: [{ key: 'owner', name: 'דירות הבעלים הוותיקים', color: '#1F5FBF' }, { key: 'dev', name: 'דירות היזם, לדיירים חדשים', color: '#E8B04A' }],
  types: [{ key: 't3', name: 'בעלים: 3 חדרים, 80 מ"ר', color: '#3F7D4E' }, { key: 'four', name: 'בעלים: ארבע המורחבות שבמגדלים', color: '#D7263D' }, { key: 't4', name: 'בעלים: מורחבת, 4 עד 4.5 חדרים', color: '#E07B39' }, { key: 't5', name: 'בעלים: מורחבת, 5 חדרים ומעלה', color: '#7A4FB5' }],
}
/** הקטגוריה של דירה במצב צביעה נתון, או null אם אינה נצבעת. */
export function paintKey(mode: Paint, lot: string, type: string, floor: number, tmura: boolean): string | null {
  const own = isOwnerUnit(lot, type, floor, tmura), four = isFour(lot, type, floor)
  if (mode === 'four') return four ? 'four' : null
  if (mode === 'owners') return own ? 'owner' : 'dev'
  if (mode === 'types') return !own ? null : four ? 'four' : rooms(type) <= 3 ? 't3' : rooms(type) < 5 ? 't4' : 't5'
  return null
}

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
      lot: b.lot!, type: u.type, floor: f.floor, top: b.real!.top, rel: f.floor / b.real!.top, area: AREA_MORE[u.type] ?? u.area ?? 80,
      value: estimate(AREA_MORE[u.type] ?? u.area ?? 80, f.floor), ppm: estimate(AREA_MORE[u.type] ?? u.area ?? 80, f.floor) / (AREA_MORE[u.type] ?? u.area ?? 80), expanded: rooms(u.type) >= 4,
      faces: faces.map((x) => x.name).join(' ו'), park: faces.some((x) => x.nx * px + x.ny * py > 0.5),
      winter: unitSun(hm, faces, floorZ(b, f.floor), KEY_DAYS[0].day, b.id).hours, units: unitsIn(b),
    })
  }
  return (cache = out)
}
export const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0 }
