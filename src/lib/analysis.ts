// ניתוחים שנגזרים ממפת הגבהים: מפה לכל מצב, שמש בשצ"פ, וניתוח הדירה.
import { type Building, type Facade, context, facadesOf, floorZ, inside, lots, oldBuildings, towers } from './site.ts'
import { type FacadeDay, type HeightMap, buildHeightMap, facadeSun, groundSunHours } from './shade.ts'
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
