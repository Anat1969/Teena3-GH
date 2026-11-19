import { Suspense, lazy, useEffect } from 'react'
import { type Tab, useStore } from './store.ts'
import { KEY_DAYS, dateLabel, hourLabel, sunAt } from './lib/sun.ts'
import Panel from './ui/Panel.tsx'
import Value from './ui/Value.tsx'

const Scene = lazy(() => import('./scene/Scene.tsx'))

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX { interface IntrinsicElements { 'ai-menu': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { chat?: string } } }
}

const TABS: [Tab, string][] = [['site', 'המתחם'], ['sun', 'שמש וצל'], ['wind', 'רוח'], ['home', 'הדירה שלי'], ['value', 'שווי ותמורה']]

export default function App() {
  const s = useStore()
  const sun = sunAt(s.day, s.hour)

  useEffect(() => {
    if (!s.playing) return
    const id = setInterval(() => {
      const st = useStore.getState()
      st.set({ hour: st.hour >= 19.75 ? 5 : st.hour + 0.25 })
    }, 140)
    return () => clearInterval(id)
  }, [s.playing])

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="/" title="חזרה למבט הפתיחה"><b>התאנה 3</b><span>מתחם האצ"ל, רחובות</span></a>
        <nav className="tabs" aria-label="נושאים">
          {TABS.map(([k, name]) => <button key={k} type="button" aria-pressed={s.tab === k} onClick={() => s.set({ tab: k })}>{name}</button>)}
        </nav>
        <ai-menu chat="https://claude.ai/code" />
      </header>

      {s.tab === 'value' ? <main className="report"><Value /></main> : <main className="stage">
        <section className="view" aria-label="המודל">
          <Suspense fallback={<div className="loading">טוען את המודל</div>}><Scene /></Suspense>

          <div className="float tl">
            <div className="seg" role="group" aria-label="מצב">
              <button type="button" aria-pressed={s.mode === 'existing'} onClick={() => s.set({ mode: 'existing', selected: null })}>מצב קיים</button>
              <button type="button" aria-pressed={s.mode === 'future'} onClick={() => s.set({ mode: 'future', selected: null })}>מצב עתידי</button>
            </div>
            <div className="seg" role="group" aria-label="מבט">
              <button type="button" onClick={() => s.look('bird')}>מבט ציפור</button>
              <button type="button" onClick={() => s.look('top')}>מבט על</button>
            </div>
          </div>

          <div className="float readout" aria-live="polite">
            {sun.altitude > 0
              ? <><b>{sun.altitude.toFixed(0)}°</b> גובה השמש<i />צל של מגדל 94 מ': <b>{sun.altitude > 1 ? Math.round(94.09 / sun.tan).toLocaleString('he') : '∞'} מ'</b></>
              : <>השמש מתחת לאופק</>}
          </div>

          <div className="time">
            <button type="button" className="play" aria-pressed={s.playing} onClick={() => s.set({ playing: !s.playing })}>{s.playing ? 'עצור' : 'נגן יום'}</button>
            <label><span>שעה <b>{hourLabel(s.hour)}</b></span>
              <input id="hour" type="range" min={5} max={20} step={0.25} value={s.hour} onChange={(e) => s.set({ hour: Number(e.target.value), playing: false })} /></label>
            <label><span>תאריך <b>{dateLabel(s.day)}</b></span>
              <input id="day" type="range" min={1} max={365} step={1} value={s.day} onChange={(e) => s.set({ day: Number(e.target.value) })} /></label>
            <div className="seg days" role="group" aria-label="ימי מפתח">
              {KEY_DAYS.map((k) => <button key={k.name} type="button" aria-pressed={s.day === k.day} title={k.label} onClick={() => s.set({ day: k.day })}>{k.name}</button>)}
            </div>
          </div>
          <div className="credit">תצלום: Esri, Maxar, Earthstar Geographics</div>
        </section>
        <Panel />
      </main>}
    </div>
  )
}
