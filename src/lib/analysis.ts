// ניתוחים שנגזרים ממפת הגבהים: מפה לכל מצב, שמש בשצ"פ, וניתוח הדירה.
import { type Building, type Facade, type Unit, context, facadesOf, floorZ, inside, lots, oldBuildings, towers, unitFaces } from './site.ts'
import { type FacadeDay, type HeightMap, type UnitDay, buildHeightMap, facadeSun, groundSunHours, unitSun } from './shade.ts'
import { KEY_DAYS } from './sun.ts'

const cache = new Map<string, HeightMap>()
export function heightMapFor(mode: 'existing' | 'future'): HeightMap {
  if (!cache.has(mode)) cache.set(mode, buildHeightMap([...(mode === 'future' ? towers : oldBuildings), ...context]))
  return cache.get(mode)!
}

const park = lots.find((l) => l.num === '501')!.rings[0]
const parkCache = new Map<string, number>()
/** ממוצע שעות השמש הישירה בשצ"פ (תא 501) ביום נתון. */
export function parkSunHours(mode: 'existing' | 'future', day: number): number {
  const key = `${mode}:${day}`
  if (!parkCache.has(key)) {
    const r = groundSunHours(heightMapFor(mode), day, 150, 4)
    let sum = 0, count = 0
    const cell = (2 * r.half) / r.n
    for (let j = 0; j < r.n; j++)
      for (let i = 0; i < r.n; i++) {
        const h = r.hours[j * r.n + i]
        if (h >= 0 && inside([(i + 0.5) * cell - r.half, (j + 0.5) * cell - r.half], park)) { sum += h; count++ }
      }
    parkCache.set(key, count ? sum / count : 0)
  }
  return parkCache.get(key)!
}

export interface AptReport { facade: Facade; z: number; days: { name: string; label: string; r: FacadeDay }[] }
export function aptReport(mode: 'existing' | 'future', b: Building, floor: number, facadeKey: string): AptReport {
  const facade = facadesOf(b).find((f) => f.key === facadeKey) ?? facadesOf(b)[0], z = floorZ(b, floor)
  const hm = heightMapFor(mode)
  return { facade, z, days: KEY_DAYS.slice(0, 3).map((k) => ({ name: k.name, label: k.label, r: facadeSun(hm, facade.at, facade.nx, facade.ny, z, k.day, b.id) })) }
}

/** חשיפת חזית לרוח: 1 מול הרוח, -1 בצד המוגן. */
export const exposure = (f: Facade, from: number) => Math.cos(((f.bearing - from) * Math.PI) / 180)
export const exposureWord = (e: number) => (e > 0.5 ? 'חשופה' : e < -0.5 ? 'מוגנת' : 'צידית')

export interface UnitReport { faces: Facade[]; z: number; days: { name: string; label: string; r: UnitDay }[] }
/** דוח לדירה אמיתית מתוכנית הבניין: החזיתות שלה, ושעות השמש בשלוש עונות. */
export function unitReport(b: Building, floor: number, unit: Unit): UnitReport {
  const faces = unitFaces(b, unit.at), z = floorZ(b, floor), hm = heightMapFor('future')
  return { faces, z, days: KEY_DAYS.slice(0, 3).map((k) => ({ name: k.name, label: k.label, r: unitSun(hm, faces, z, k.day, b.id) })) }
}

export interface Ranked { floor: number; unit: Unit; winter: number; summer: number; faces: string }
const rankCache = new Map<number, Ranked[]>()
/** כל דירות התמורה בבניין, מדורגות לפי שמש ישירה בחורף. */
export function rankTmura(b: Building): Ranked[] {
  if (!b.real) return []
  if (!rankCache.has(b.id)) {
    const hm = heightMapFor('future'), out: Ranked[] = []
    for (const f of b.real.floors)
      for (const u of f.apts) {
        if (!u.tmura) continue
        const faces = unitFaces(b, u.at), z = floorZ(b, f.floor)
        out.push({ floor: f.floor, unit: u, faces: faces.map((x) => x.name).join(' ו'), winter: unitSun(hm, faces, z, KEY_DAYS[0].day, b.id).hours, summer: unitSun(hm, faces, z, KEY_DAYS[2].day, b.id).hours })
      }
    rankCache.set(b.id, out.sort((x, y) => y.winter - x.winter || y.floor - x.floor))
  }
  return rankCache.get(b.id)!
}

/** הדירה הנבחרת: הבניין, הדירה מהתוכנית (אם יש), החזית הראשית והגובה. משמש את הסימון במודל ואת המבט מהחלון. */
export function aptSpot(apt: { id: number; floor: number; facade: string; unit?: string } | null, b: Building | null) {
  if (!apt || !b) return null
  const unit = b.real?.floors.find((f) => f.floor === apt.floor)?.apts.find((u) => u.key === apt.unit) ?? null
  const faces = unit ? unitFaces(b, unit.at) : []
  const face = faces[0] ?? facadesOf(b).find((f) => f.key === apt.facade) ?? facadesOf(b)[0]
  return { unit, faces, face, z: floorZ(b, apt.floor) }
}
