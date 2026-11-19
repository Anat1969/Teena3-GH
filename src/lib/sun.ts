// מיקום השמש לפי שעון ישראל. טהור: בלי three ובלי DOM, ולכן נבדק ב-node.
import SunCalc from 'suncalc'
import { LAT, LON } from './site.ts'

export interface Sun { altitude: number; bearing: number; ex: number; ey: number; tan: number }

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
function offsetMs(utc: number): number {
  const p: Record<string, number> = {}
  for (const x of fmt.formatToParts(new Date(utc))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - utc
}

export const YEAR = 2027
/** יום בשנה (1 עד 365) ושעה עשרונית בשעון ישראל, לרגע מוחלט. */
export function instant(day: number, hour: number): Date {
  const guess = Date.UTC(YEAR, 0, day, 0, Math.round(hour * 60))
  return new Date(guess - offsetMs(guess - offsetMs(guess)))
}

export function sunAt(day: number, hour: number): Sun {
  const p = SunCalc.getPosition(instant(day, hour), LAT, LON)
  const bearing = ((p.azimuth * 180) / Math.PI + 180 + 360) % 360 // suncalc מודד מהדרום, מערבה
  const b = (bearing * Math.PI) / 180
  return { altitude: (p.altitude * 180) / Math.PI, bearing, ex: Math.sin(b), ey: Math.cos(b), tan: Math.tan(p.altitude) }
}

export const dayOfYear = (month: number, dayOfMonth: number) => Math.round((Date.UTC(YEAR, month - 1, dayOfMonth) - Date.UTC(YEAR, 0, 0)) / 864e5)
export function dateLabel(day: number): string {
  const d = new Date(Date.UTC(YEAR, 0, day))
  return `${d.getUTCDate()} ב${['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'][d.getUTCMonth()]}`
}
export const hourLabel = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

export const KEY_DAYS = [
  { name: 'חורף', label: '21 בדצמבר', day: dayOfYear(12, 21) },
  { name: 'אביב', label: '21 במרץ', day: dayOfYear(3, 21) },
  { name: 'קיץ', label: '21 ביוני', day: dayOfYear(6, 21) },
  { name: 'סתיו', label: '23 בספטמבר', day: dayOfYear(9, 23) },
]
