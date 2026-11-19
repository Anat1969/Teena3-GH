import { useEffect, useMemo, useState } from 'react'
import { type WindKey, WINDS, useStore } from '../store.ts'
import { byId, facadesOf, lots, oldBuildings, towers, trees } from '../lib/site.ts'
import { KEY_DAYS, dateLabel, hourLabel, sunAt } from '../lib/sun.ts'
import { aptReport, exposure, exposureWord, parkSunHours } from '../lib/analysis.ts'

const n1 = (x: number) => x.toLocaleString('he', { maximumFractionDigits: 1 })
const Check = ({ id, label, on, flip }: { id: string; label: string; on: boolean; flip: () => void }) => (
  <button id={id} type="button" className="check" aria-pressed={on} onClick={flip}><i>{on ? '✓' : ''}</i>{label}</button>
)

function Site() {
  const s = useStore()
  const b = byId(s.selected)
  const lot = b?.lot ? lots.find((l) => l.num === b.lot) : null
  const future = s.mode === 'future'
  return (
    <>
      <p className="insight">{future ? <><mark>375 דירות במקום 100</mark>, בחמישה נפחים סביב גינה אחת.</> : <><mark>שישה בנייני שיכון של שלוש קומות</mark>, 100 דירות, בלי מעלית.</>}</p>
      <div className="stats">
        {future
          ? <><div><b>375</b>דירות</div><div><b>99 מ'</b>הגובה המרבי</div><div><b>3.8</b>דונם שצ"פ</div><div><b>29</b>עצים נשמרים</div></>
          : <><div><b>100</b>דירות</div><div><b>9.5 מ'</b>גובה מדוד</div><div><b>{oldBuildings.filter((x) => x.h > 8).length}</b>בניינים</div><div><b>{trees.length}</b>עצים</div></>}
      </div>
      {b ? (
        <div className="card">
          <h3>{b.name}</h3>
          <dl>
            <dt>גובה</dt><dd>{n1(b.h)} מ'</dd>
            <dt>קומות מעל הכניסה</dt><dd>{b.floors}</dd>
            {lot?.rights && <><dt>יחידות דיור</dt><dd>{lot.rights.units || 'אין'}</dd><dt>שטח המגרש</dt><dd>{Math.round(lot.area).toLocaleString('he')} מ"ר</dd><dt>שטח עיקרי</dt><dd>{lot.rights.main.toLocaleString('he')} מ"ר</dd><dt>קומות מרתף</dt><dd>{lot.rights.basements || 'אין'}</dd></>}
            <dt>צל בצהרי 21 בדצמבר</dt><dd>{Math.round(b.h / Math.tan((34.66 * Math.PI) / 180))} מ'</dd>
          </dl>
        </div>
      ) : <p className="hint">לחיצה על בניין במודל מציגה את הנתונים שלו.</p>}
      {future && (
        <table className="mini">
          <thead><tr><th>תא שטח</th><th>קומות</th><th>גובה</th><th>יח"ד</th></tr></thead>
          <tbody>{towers.map((t) => <tr key={t.id} className={s.selected === t.id ? 'on' : ''} onClick={() => s.set({ selected: t.id })}><td><b>{t.lot}</b></td><td>{t.floors}</td><td>{t.h} מ'</td><td>{lots.find((l) => l.num === t.lot)!.rights!.units || ''}</td></tr>)}</tbody>
        </table>
      )}
      <h4>שכבות</h4>
      <div className="checks">
        <Check id="l-sat" label="תצלום לוויין" on={s.sat} flip={() => s.set({ sat: !s.sat })} />
        <Check id="l-lots" label="ייעודי קרקע" on={s.lots} flip={() => s.set({ lots: !s.lots })} />
        <Check id="l-trees" label="עצים" on={s.trees} flip={() => s.set({ trees: !s.trees })} />
      </div>
      <p className="note"><b>הערכה:</b> כל מגדל מוצג כמעטפת המרבית שבתוך קו הבניין. תוכניות הבניינים יחליפו אותה בנפח האמיתי.</p>
      <a className="link" href="/tasrit.html" target="_blank" rel="noreferrer">התסריט המלא</a>
    </>
  )
}

function SunTab() {
  const s = useStore()
  const sun = sunAt(s.day, s.hour)
  const [park, setPark] = useState<{ day: number; ex: number; fu: number } | null>(null)
  useEffect(() => {
    setPark(null)
    const id = setTimeout(() => setPark({ day: s.day, ex: parkSunHours('existing', s.day), fu: parkSunHours('future', s.day) }), 60)
    return () => clearTimeout(id)
  }, [s.day])
  const dirs = ['צפון', 'צפון־מזרח', 'מזרח', 'דרום־מזרח', 'דרום', 'דרום־מערב', 'מערב', 'צפון־מערב']
  return (
    <>
      <p className="insight"><mark>בחורף הצל יוצא מגבולות המתחם.</mark> מגדל של 99 מ' מטיל בצהרי 21 בדצמבר צל של 143 מ'.</p>
      <div className="stats">
        <div><b>{sun.altitude > 0 ? `${sun.altitude.toFixed(0)}°` : 'לילה'}</b>גובה השמש</div>
        <div><b>{sun.altitude > 0 ? dirs[Math.round(sun.bearing / 45) % 8] : ''}</b>כיוון השמש</div>
        <div><b>{sun.altitude > 1 ? `${Math.round(99 / sun.tan).toLocaleString('he')} מ'` : ''}</b>צל של 99 מ'</div>
        <div><b>{hourLabel(s.hour)}</b>{dateLabel(s.day)}</div>
      </div>
      <h4>שמש ישירה בגינה, תא שטח 501</h4>
      {park ? (
        <div className="bars">
          <div><span>מצב קיים</span><i style={{ width: `${(park.ex / 14) * 100}%` }} className="ok" /><b>{n1(park.ex)} שעות</b></div>
          <div><span>מצב עתידי</span><i style={{ width: `${(park.fu / 14) * 100}%` }} className="bad" /><b>{n1(park.fu)} שעות</b></div>
          <p className="note">ממוצע על שטח הגינה ב־{dateLabel(park.day)}. {park.ex > 0 && <>הבנייה מורידה <b>{Math.round((1 - park.fu / park.ex) * 100)}%</b> משעות השמש.</>}</p>
        </div>
      ) : <p className="hint">מחשב שעות שמש בגינה.</p>}
      <h4>מפת שעות שמש על הקרקע</h4>
      <div className="checks"><Check id="l-heat" label="הצג מפת שעות שמש" on={s.heat} flip={() => s.set({ heat: !s.heat })} /></div>
      {s.heat && <div className="ramp"><span>צל כל היום</span><i /><span>שמש כל היום</span></div>}
      <p className="note"><b>עובדה:</b> זוויות השמש מחושבות לפי שעון ישראל, כולל שעון קיץ. <b>הערכה:</b> הצל מחושב מול המעטפת המרבית, ולכן הוא רחב מהצל של הבניין האמיתי.</p>
    </>
  )
}

function WindTab() {
  const s = useStore()
  const b = byId(s.selected) ?? (s.mode === 'future' ? towers.find((t) => t.lot === '103')! : oldBuildings[0])
  const w = WINDS[s.wind]
  return (
    <>
      <p className="insight"><mark>הבריזה מגיעה מצפון־מערב.</mark> חזית צפון־מערב פונה אליה ישר, וחזית דרום־מערב מקבלת אותה מהצד.</p>
      <div className="seg wide" role="group" aria-label="רוח">
        {(Object.keys(WINDS) as WindKey[]).map((k) => <button key={k} type="button" aria-pressed={s.wind === k} onClick={() => s.set({ wind: k })}>{WINDS[k].name}</button>)}
      </div>
      <p>{w.text}</p>
      <h4>חשיפת החזיתות: {b.name}</h4>
      <table className="mini">
        <thead><tr><th>חזית</th><th>כיוון</th><th>מול הרוח</th></tr></thead>
        <tbody>{facadesOf(b).map((f) => { const e = exposure(f, w.from); return <tr key={f.key}><td><b>{f.name}</b></td><td>{Math.round(f.bearing)}°</td><td className={e > 0.5 ? 'hi' : ''}>{exposureWord(e)}</td></tr> })}</tbody>
      </table>
      <p className="hint">לחיצה על בניין אחר במודל מחליפה את הטבלה.</p>
      <p className="note"><b>הערכה:</b> כיווני הרוח הם הידע האקלימי המקובל לשפלת החוף, ולא מדידה. התוכנית עצמה דורשת בדיקת השפעת רוחות לפני היתר (סעיף 6.1.4), ומעברים מוגנים בין המגדלים (סעיף 6.10).</p>
    </>
  )
}

const SCORE = {
  street: { title: 'מיקום', opts: [[0.9, 'פונה לשני רחובות סואנים'], [0.95, 'פונה לרחוב ראשי אחד'], [1, 'עורפית, לחצר פנימית'], [1.05, 'פונה לגינה הציבורית']] },
  floor: { title: 'קומה', opts: [[1, 'קרקע או קומה א'], [0.98, 'קומה ב']] },
  air: { title: 'כיווני אוויר', opts: [[1, 'פינתית, שלושה כיוונים'], [0.95, 'כלואה, שני כיוונים']] },
  state: { title: 'מצב פיזי', opts: [[1, 'ראויה למגורים'], [0.85, 'אינה ראויה למגורים']] },
} as const

function Home() {
  const s = useStore()
  const apt = s.apt[s.mode], b = byId(apt?.id ?? null)
  const list = (s.mode === 'future' ? towers.filter((t) => t.lot !== '401') : oldBuildings.filter((x) => x.h > 8))
  const report = useMemo(() => (apt && b ? aptReport(s.mode, b, apt.floor, apt.facade) : null), [s.mode, apt, b])
  const all = useMemo(() => {
    if (!apt || !b) return []
    return facadesOf(b).map((f) => { const r = aptReport(s.mode, b, apt.floor, f.key); return { f, winter: r.days[0].r.hours, summer: r.days[2].r.hours } }).sort((x, y) => y.winter - x.winter)
  }, [s.mode, apt, b])
  const total = s.score.street * s.score.floor * s.score.air * s.score.state
  const blockers = (m: Map<number, number>) => [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 2).map(([id, h]) => `${byId(id)?.name ?? 'בנייני השכנים'} (${n1(h)} ש')`).join(', ')
  return (
    <>
      <p className="insight">{s.mode === 'existing' ? <><mark>הניקוד של הדירה הקיימת קובע את התור</mark> לבחירת הדירה החדשה.</> : <><mark>החזית קובעת את השמש.</mark> בוחרים בניין, קומה וחזית, ומשווים.</>}</p>
      <div className="pick">
        <label htmlFor="apt-b">בניין</label>
        <select id="apt-b" value={apt?.id ?? ''} onChange={(e) => { const nb = byId(Number(e.target.value)); if (nb) s.setApt({ id: nb.id, floor: Math.min(apt?.floor ?? Math.ceil(nb.floors / 2), nb.floors), facade: facadesOf(nb)[0].key }) }}>
          <option value="" disabled>בחירה, או לחיצה במודל</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {apt && b && <>
          <label htmlFor="apt-f">קומה <b>{apt.floor}</b> מתוך {b.floors}</label>
          <input id="apt-f" type="range" min={1} max={b.floors} value={apt.floor} onChange={(e) => s.setApt({ ...apt, floor: Number(e.target.value) })} />
          <span className="lab">חזית</span>
          <div className="seg wide" role="group" aria-label="חזית">
            {facadesOf(b).map((f) => <button key={f.key} type="button" aria-pressed={apt.facade === f.key} onClick={() => s.setApt({ ...apt, facade: f.key })}>{f.name}</button>)}
          </div>
        </>}
      </div>
      {report && apt && b ? (
        <>
          <h4>מצפן הדירה: פונה ל{report.facade.name}, {Math.round(report.facade.bearing)}°, בגובה {n1(report.z)} מ'</h4>
          <table className="mini">
            <thead><tr><th>עונה</th><th>שמש ישירה</th><th>מתי</th><th>מי מצל</th></tr></thead>
            <tbody>{report.days.map((d) => (
              <tr key={d.name}><td><b>{d.name}</b></td><td className={d.r.hours >= 3 ? 'hi' : ''}>{n1(d.r.hours)} שעות</td>
                <td>{d.r.first !== null ? `${hourLabel(d.r.first)} עד ${hourLabel(d.r.last!)}` : 'אין'}</td><td>{blockers(d.r.blocked) || 'אין'}</td></tr>
            ))}</tbody>
          </table>
          <h4>כל החזיתות בקומה {apt.floor}, לפי שמש בחורף</h4>
          <div className="bars">
            {all.map((x) => <div key={x.f.key} className={x.f.key === apt.facade ? 'sel' : ''} onClick={() => s.setApt({ ...apt, facade: x.f.key })}><span>{x.f.name}</span><i style={{ width: `${(x.winter / 10) * 100}%` }} className="sun" /><b>{n1(x.winter)} חורף, {n1(x.summer)} קיץ</b></div>)}
          </div>
          <h4>רוח</h4>
          <p>{(Object.keys(WINDS) as WindKey[]).map((k) => `${WINDS[k].name}: ${exposureWord(exposure(report.facade, WINDS[k].from))}`).join(' · ')}</p>
          <button type="button" className="act" onClick={() => s.look('window')}>מבט מהחלון</button>
        </>
      ) : <p className="hint">בוחרים בניין ברשימה, או לוחצים עליו במודל. {s.mode === 'existing' ? 'במצב קיים בוחרים את הדירה של היום.' : 'במצב עתידי בוחנים דירה חדשה.'}</p>}
      {s.mode === 'existing' && (
        <>
          <h4>ניקוד הדירה הקיימת, לפי מסמך העקרונות של השמאי</h4>
          <div className="score">
            {(Object.keys(SCORE) as (keyof typeof SCORE)[]).map((k) => (
              <label key={k} htmlFor={`sc-${k}`}><span>{SCORE[k].title}</span>
                <select id={`sc-${k}`} value={s.score[k]} onChange={(e) => s.set({ score: { ...s.score, [k]: Number(e.target.value) } })}>
                  {SCORE[k].opts.map(([val, text]) => <option key={text} value={val}>{text}: {val.toFixed(2)}</option>)}
                </select></label>
            ))}
            <label htmlFor="sc-area"><span>שטח מדוד, מ"ר</span><input id="sc-area" type="number" min={0} max={300} value={s.score.area || ''} placeholder="למשל 62" onChange={(e) => s.set({ score: { ...s.score, area: Number(e.target.value) } })} /></label>
          </div>
          <div className="stats two"><div><b>{total.toFixed(3)}</b>מכפלת המקדמים</div><div><b>{s.score.area ? n1(total * s.score.area) : ''}</b>ניקוד: מקדמים כפול שטח</div></div>
          <p className="note"><b>עובדה:</b> המקדמים והנוסחה מתוך מסמך העקרונות מיום 8 ביולי 2026. <b>הנחה:</b> המסמך עצמו אינו טבלת הניקוד, והמשקלים הסופיים עשויים להשתנות.</p>
        </>
      )}
      {s.mode === 'future' && <p className="note"><b>הערכה:</b> גובה הקומה מחושב מחלוקה שווה של גובה הבניין, והשמש נבדקת באמצע החזית. תוכניות הבניינים ידייקו את מיקום הדירה.</p>}
    </>
  )
}

export default function Panel() {
  const tab = useStore((s) => s.tab)
  void KEY_DAYS
  return <aside className="panel">{tab === 'site' ? <Site /> : tab === 'sun' ? <SunTab /> : tab === 'wind' ? <WindTab /> : <Home />}</aside>
}
