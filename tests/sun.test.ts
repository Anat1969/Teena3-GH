// בדיקות לחישוב השמש והצל, מול ערכים אסטרונומיים ידועים לקו רוחב 31.9.
import assert from 'node:assert/strict'
import { sunAt, dayOfYear, instant } from '../src/lib/sun.ts'
import { buildHeightMap, blocker, facadeSun } from '../src/lib/shade.ts'
import { towers, oldBuildings, context, facadesOf } from '../src/lib/site.ts'

const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} מול ${b}`)

// צהרי היום: 21 בדצמבר 34.7 מעלות, 21 ביוני 81.5 מעלות
let best = 0
for (let h = 10; h < 14; h += 0.05) best = Math.max(best, sunAt(dayOfYear(12, 21), h).altitude)
near(best, 34.7, 0.4, 'גובה שמש בצהרי החורף')
best = 0
for (let h = 10; h < 14; h += 0.05) best = Math.max(best, sunAt(dayOfYear(6, 21), h).altitude)
near(best, 81.5, 0.4, 'גובה שמש בצהרי הקיץ')
// שעון קיץ: 12:00 ביוני הוא 09:00 UTC, ובדצמבר 10:00 UTC
assert.equal(instant(dayOfYear(6, 21), 12).getUTCHours(), 9)
assert.equal(instant(dayOfYear(12, 21), 12).getUTCHours(), 10)
// בבוקר השמש במזרח, אחר הצהריים במערב
assert.ok(sunAt(dayOfYear(3, 21), 8).ex > 0 && sunAt(dayOfYear(3, 21), 16).ex < 0)

assert.equal(towers.length, 5)
assert.deepEqual(towers.map((t) => t.h), [69.05, 94.09, 94.09, 33.36, 17])
assert.ok(oldBuildings.filter((b) => b.h > 8).length >= 6)

// צל: נקודה 100 מטר מצפון למגדל 103 מוצלת בצהרי החורף (צל של 143 מטר), ו-200 מטר מצפון כבר לא
const hm = buildHeightMap([...towers, ...context])
const t103 = towers.find((t) => t.lot === '103')!
const cx = t103.pts.reduce((s, p) => s + p[0], 0) / t103.pts.length, cy = t103.pts.reduce((s, p) => s + p[1], 0) / t103.pts.length
let noon = 11.6, alt = 0
for (let h = 11; h < 12.5; h += 0.02) { const a = sunAt(dayOfYear(12, 21), h).altitude; if (a > alt) { alt = a; noon = h } }
const s = sunAt(dayOfYear(12, 21), noon)
assert.equal(blocker(hm, cx, cy + 100, 0.5, s), t103.id, 'נקודה במרחק 100 מטר מצפון מוצלת')
assert.notEqual(blocker(hm, cx, cy + 200, 0.5, s), t103.id, 'נקודה במרחק 200 מטר מצפון אינה בצל המגדל')

// חזית דרום־מערבית מקבלת יותר שמש מחזית צפון־מזרחית בחורף
const f = facadesOf(t103)
assert.equal(f.length, 4)
const sw = f.find((x) => x.key === 'sw')!, ne = f.find((x) => x.key === 'ne')!
const hSw = facadeSun(hm, sw.at, sw.nx, sw.ny, 60, dayOfYear(12, 21), t103.id).hours
const hNe = facadeSun(hm, ne.at, ne.nx, ne.ny, 60, dayOfYear(12, 21), t103.id).hours
assert.ok(hSw > hNe, `דרום־מערב ${hSw} מול צפון־מזרח ${hNe}`)
import { floorZ } from '../src/lib/site.ts'
assert.equal(floorZ(t103, 5), 20.1 + 1.5) // קומה 5 במפלס 20.10 לפי החתך
console.log('כל הבדיקות עברו. צהרי החורף בשעה', noon.toFixed(2), '| שמש בחורף, קומה גבוהה במגדל 103: דרום־מערב', hSw, 'שעות, צפון־מזרח', hNe, 'שעות')
