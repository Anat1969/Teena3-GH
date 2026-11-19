import { create } from 'zustand'
import { KEY_DAYS } from './lib/sun.ts'
import { towers } from './lib/site.ts'

export type Mode = 'existing' | 'future'
export type Tab = 'site' | 'sun' | 'wind' | 'home' | 'value'
export type WindKey = 'summer' | 'east' | 'storm'
export interface Apt { id: number; floor: number; facade: string; unit?: string }
export interface Owner { name: string; lot: string; floor: number; unit: string }
export interface Score { street: number; floor: number; air: number; state: number; area: number }

// משטר הרוחות: הערכה לפי הידע האקלימי המקובל לשפלת החוף. יוחלף בשושנת רוחות מדודה.
export const WINDS: Record<WindKey, { name: string; from: number; text: string }> = {
  summer: { name: 'בריזת קיץ', from: 300, text: 'בריזת הים נושבת ממערב ומצפון־מערב בשעות היום, ומצננת את החזיתות שפונות אליה.' },
  east: { name: 'רוח מזרחית', from: 90, text: 'בחורף ובעונות המעבר נושבת רוח מזרחית יבשה, קרה בחורף וחמה בשרב.' },
  storm: { name: 'סערת חורף', from: 235, text: 'סערות הגשם מגיעות מדרום־מערב, והן הרוחות החזקות של השנה.' },
}

interface S {
  mode: Mode; tab: Tab; day: number; hour: number; playing: boolean
  sat: boolean; lots: boolean; trees: boolean; heat: boolean; plan: boolean
  wind: WindKey; selected: number | null
  apt: Record<Mode, Apt | null>; score: Score; owners: Owner[]
  cam: { view: 'bird' | 'top' | 'window' | 'plan'; n: number }
  set: (p: Partial<S>) => void
  setApt: (a: Apt | null) => void
  look: (view: 'bird' | 'top' | 'window' | 'plan') => void
}

// הדירה של ענת במצב העתידי: בניין 103, קומה 5, טיפוס A4-2T. בלי שמות.
const MINE: Apt | null = (() => { const b = towers.find((t) => t.lot === '103'); return b ? { id: b.id, floor: 5, facade: 'ne', unit: 'A4-2T' } : null })()
const KEY = 'teena3.v3'
function load(): Partial<S> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}
const saved = load()

export const useStore = create<S>((set, get) => ({
  mode: 'future', tab: 'site', day: KEY_DAYS[0].day, hour: 12, playing: false,
  sat: true, lots: false, trees: true, heat: false, plan: false,
  wind: 'summer', selected: null,
  apt: { existing: null, future: MINE, ...(saved.apt ?? {}) },
  score: { street: 1, floor: 1, air: 1, state: 1, area: 0, ...(saved.score ?? {}) },
  owners: saved.owners ?? [],
  cam: { view: 'bird', n: 0 },
  set: (p) => {
    set(p)
    const s = get()
    try { localStorage.setItem(KEY, JSON.stringify({ apt: s.apt, score: s.score, owners: s.owners })) } catch { /* אחסון חסום: ממשיכים בלי שמירה */ }
  },
  setApt: (a) => get().set({ apt: { ...get().apt, [get().mode]: a } }),
  look: (view) => set({ cam: { view, n: get().cam.n + 1 } }),
}))
