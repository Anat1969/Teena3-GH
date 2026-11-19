import { useEffect, useMemo, useState } from 'react'
import { type Owner, type WindKey, WINDS, useStore } from '../store.ts'
import { byId, facadesOf, lots, myApt, oldBuildings, towers, trees } from '../lib/site.ts'
import { KEY_DAYS, dateLabel, hourLabel, sunAt } from '../lib/sun.ts'
import rawQ from '../../data/quantities.json'
import { LEGEND, type Paint, paintKey } from '../lib/claim.ts'
import { aptReport, exposure, exposureWord, parkSunHours, rankTmura, unitReport } from '../lib/analysis.ts'

const n1 = (x: number) => x.toLocaleString('he', { maximumFractionDigits: 1 })
const Check = ({ id, label, on, flip }: { id: string; label: string; on: boolean; flip: () => void }) => (
  <button id={id} type="button" className="check" aria-pressed={on} onClick={flip}><i>{on ? '✓' : ''}</i>{label}</button>
)

const quantities = rawQ as unknown as Record<string, { storeys: number; walls: number; concrete_m3: number; block_m3: number; slab_m2: number; balcony_m2: number; glazing_m2: number; windows: number; railing_m: number }>
const big = (x: number) => Math.round(x).toLocaleString('he')

const PAINTS: [Paint, string][] = [['none', 'בלי'], ['four', 'ארבע הדירות שלנו'], ['owners', 'בעלים מול יזם'], ['types', 'סוגי דירות הבעלים']]
/** בורר צביעת הדירות, עם מקרא וספירה לכל קבוצה. */
function PaintPicker() {
  const s = useStore()
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    if (s.paint !== 'none') for (const b of towers) for (const f of b.real?.floors ?? []) for (const u of f.apts) { const k = paintKey(s.paint, b.lot!, u.type, f.floor, u.tmura); if (k) m.set(k, (m.get(k) ?? 0) + 1) }
    return m
  }, [s.paint])
  return (
    <>
      <h4>צביעת דירות</h4>
      <div className="seg wide paints" role="group" aria-label="צביעת דירות">
        {PAINTS.map(([k, name]) => <button key={k} type="button" aria-pressed={s.paint === k} onClick={() => s.set({ paint: k, mode: 'future' })}>{name}</button>)}
      </div>
      {s.paint !== 'none' && <ul className="legend">{LEGEND[s.paint].map((l) => <li key={l.key}><i style={{ background: l.color }} />{l.name}<b>{counts.get(l.key) ?? 0}</b></li>)}</ul>}
      {s.paint !== 'none' && <p className="note">כל דירה מסומנת בלוח צבע על החזיתות שהיא פונה אליהן. <b>עובדה:</b> השיוך לבעלים לפי טבלת הדירות המוצעות. <b>הערכה:</b> דופלקס נספר בשתי קומות, ולכן הסכום אינו בדיוק 100.</p>}
    </>
  )
}

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
          ? <><div><b>375</b>דירות</div><div><b>94 מ'</b>ראש המעקה</div><div><b>3.8</b>דונם שצ"פ</div><div><b>29</b>עצים נשמרים</div></>
          : <><div><b>100</b>דירות</div><div><b>9.5 מ'</b>גובה מדוד</div><div><b>{oldBuildings.filter((x) => x.h > 8).length}</b>בניינים</div><div><b>{trees.length}</b>עצים</div></>}
      </div>
      {b ? (
        <div className="card">
          <h3>{b.name}</h3>
          <dl>
            <dt>גובה</dt><dd>{n1(b.h)} מ'</dd>
            <dt>קומות מעל הכניסה</dt><dd>{b.floors}</dd>
            {b.real && <><dt>שטח קומה טיפוסית</dt><dd>{Math.round(b.real.floorArea).toLocaleString('he')} מ"ר</dd><dt>דירות בקומה טיפוסית</dt><dd>{b.real.floors[Math.floor(b.real.floors.length / 2)].apts.length}</dd></>}
            {lot?.rights && <><dt>יחידות דיור</dt><dd>{lot.rights.units || 'אין'}</dd><dt>שטח המגרש</dt><dd>{Math.round(lot.area).toLocaleString('he')} מ"ר</dd><dt>שטח עיקרי</dt><dd>{lot.rights.main.toLocaleString('he')} מ"ר</dd><dt>קומות מרתף</dt><dd>{lot.rights.basements || 'אין'}</dd></>}
            <dt>צל בצהרי 21 בדצמבר</dt><dd>{Math.round(b.h / Math.tan((34.66 * Math.PI) / 180))} מ'</dd>
          </dl>
        </div>
      ) : <p className="hint">לחיצה על בניין במודל מציגה את הנתונים והכמויות שלו.</p>}
      {b?.lot && quantities[b.lot] && (() => { const q = quantities[b.lot!]; return (
        <div className="card">
          <h3>כמויות מהמודל: {b.name}</h3>
          <dl>
            <dt>קומות במודל</dt><dd>{q.storeys}</dd>
            <dt>אלמנטי קיר</dt><dd>{big(q.walls)}</dd>
            <dt>קירות בטון</dt><dd>{big(q.concrete_m3)} מ"ק</dd>
            <dt>קירות בלוק</dt><dd>{big(q.block_m3)} מ"ק</dd>
            <dt>תקרות</dt><dd>{big(q.slab_m2)} מ"ר</dd>
            <dt>מרפסות</dt><dd>{big(q.balcony_m2)} מ"ר</dd>
            <dt>חלונות וויטרינות</dt><dd>{big(q.windows)}, {big(q.glazing_m2)} מ"ר זיגוג</dd>
            <dt>מעקות</dt><dd>{big(q.railing_m)} מ' אורך</dd>
          </dl>
          <a className="link" href={`/ifc/${b.lot}.ifc`} download>הורדת קובץ IFC לפתיחה ב־Revit</a>
          <p className="note"><b>הערכה:</b> הכמויות נמדדות מהאלמנטים שבמודל, מעל הקרקע בלבד, בלי מרתפים, עמודים, קורות ומדרגות. הן סדר גודל, לא כתב כמויות.</p>
        </div>
      ) })()}
      {future && (
        <table className="mini">
          <thead><tr><th>תא שטח</th><th>קומות</th><th>גובה</th><th>יח"ד</th></tr></thead>
          <tbody>{towers.map((t) => <tr key={t.id} className={s.selected === t.id ? 'on' : ''} onClick={() => s.set({ selected: t.id })}><td><b>{t.lot}</b></td><td>{t.floors}</td><td>{t.h} מ'</td><td>{lots.find((l) => l.num === t.lot)!.rights!.units || ''}</td></tr>)}</tbody>
        </table>
      )}
      <PaintPicker />
      <h4>שכבות</h4>
      <div className="checks">
        <Check id="l-sat" label="תצלום לוויין" on={s.sat} flip={() => s.set({ sat: !s.sat })} />
        <Check id="l-lots" label="ייעודי קרקע" on={s.lots} flip={() => s.set({ lots: !s.lots })} />
        <Check id="l-trees" label="עצים" on={s.trees} flip={() => s.set({ trees: !s.trees })} />
        <Check id="l-bim" label="מודל BIM: אלמנטים לכל קומה" on={s.bim} flip={() => s.set({ bim: !s.bim })} />
        <Check id="l-fac" label="גימור בצבעי האדריכל" on={s.facades} flip={() => s.set({ facades: !s.facades })} />
        <Check id="l-det" label="מרפסות ופתחים בתלת־ממד" on={s.detail} flip={() => s.set({ detail: !s.detail })} />
      </div>
      <p className="note"><b>עובדה:</b> קו המתאר מתוכניות הבניינים, והגבהים ומפלסי הקומות מהחתכים שבגיליונות ההיתר. בניין 103 ממוקם לפי תוכנית ההעמדה. החזיתות הן שרטוטי החזית מגיליונות ההיתר, מולבשים על הבניין בהיטל ישר. במודל ה־BIM כל קומה בנויה מהתוכנית שלה: תקרה, קירות בטון ובלוק, חלונות, מרפסות ומעקות, כולל קומת הקרקע והגלריה. <b>הערכה:</b> גובה האדן והמשקוף של החלונות אחיד ומשוער, כי החזיתות בהיתר הן סריקה ולא מדידה. הגימור הוא שכבת חיפוי שעוטפת את הקירות, בארבעה גוונים: לבן, אפור פחם, אפור בהיר וכתום. צבע כל קטע בכל קומה נדגם מחזיתות ההיתר, ולכן ייתכנו קטעים בודדים בגוון שגוי.</p>
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
      <p className="insight"><mark>בחורף הצל יוצא מגבולות המתחם.</mark> מגדל של 94 מ' מטיל בצהרי 21 בדצמבר צל של 136 מ'.</p>
      <div className="stats">
        <div><b>{sun.altitude > 0 ? `${sun.altitude.toFixed(0)}°` : 'לילה'}</b>גובה השמש</div>
        <div><b>{sun.altitude > 0 ? dirs[Math.round(sun.bearing / 45) % 8] : ''}</b>כיוון השמש</div>
        <div><b>{sun.altitude > 1 ? `${Math.round(94.09 / sun.tan).toLocaleString('he')} מ'` : ''}</b>צל של 94 מ'</div>
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
      <p className="note"><b>עובדה:</b> זוויות השמש מחושבות לפי שעון ישראל, כולל שעון קיץ. הצל מחושב מול קו המתאר של הקומה הטיפוסית, עד לגובה המרבי שבתוכנית.</p>
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

function HomeOld() {
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

/** רשימת בעלים פרטית: נשמרת רק בדפדפן הזה, ולא עולה לשרת או למאגר הקוד. */
function parseOwners(text: string): Owner[] {
  const out: Owner[] = []
  for (const line of text.split('\n')) {
    const c = line.split(/[|\t;]/).map((x) => x.trim())
    if (c.length < 4 || !c[0]) continue
    const lot = c[1].replace(/\D/g, ''), floor = Number(c[2].replace(/[^\d]/g, ''))
    if (!towers.some((t) => t.lot === lot && t.real) || Number.isNaN(floor)) continue
    out.push({ name: c[0], lot, floor, unit: c[3] })
  }
  return out
}
const plain = (x: string) => x.replace(/["'׳״\-־+().,]/g, ' ').replace(/\s+/g, ' ').trim()

function Owners() {
  const s = useStore()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const words = plain(q).split(' ').filter(Boolean)
  const hits = words.length ? s.owners.filter((o) => words.every((w) => plain(o.name).includes(w))) : []
  const go = (o: Owner) => {
    const b = towers.find((t) => t.lot === o.lot)
    const f = b?.real?.floors.find((x) => x.floor === o.floor)
    if (!b || !f) return
    const u = f.apts.find((x) => x.key === o.unit) ?? f.apts.find((x) => x.type === o.unit) ?? f.apts[0]
    s.set({ mode: 'future', tab: 'home', apt: { ...s.apt, future: { id: b.id, floor: f.floor, facade: 'ne', unit: u.key } } })
  }
  return (
    <div className="owners">
      <h4>חיפוש דירה לפי שם בעלים</h4>
      {s.owners.length ? (
        <>
          <input id="own-q" type="search" value={q} placeholder="שם, או חלק ממנו" onChange={(e) => setQ(e.target.value)} />
          {words.length > 0 && (hits.length ? (
            <table className="mini"><tbody>{hits.map((o) => (
              <tr key={o.name + o.lot + o.floor + o.unit} className="row" onClick={() => go(o)}><td><b>{o.name}</b></td><td>בניין {o.lot}</td><td>קומה {o.floor}</td><td>{o.unit}</td></tr>
            ))}</tbody></table>
          ) : <p className="hint">לא נמצא שם כזה ברשימה.</p>)}
        </>
      ) : <p className="hint">הרשימה ריקה. מדביקים אותה פעם אחת, והיא נשמרת רק בדפדפן הזה.</p>}
      <button id="own-edit" type="button" className="check" aria-pressed={edit} onClick={() => { setText(s.owners.map((o) => [o.name, o.lot, o.floor, o.unit].join(' | ')).join('\n')); setEdit(!edit) }}><i>{edit ? '✓' : ''}</i>עריכת רשימת הבעלים ({s.owners.length})</button>
      {edit && (
        <>
          <textarea id="own-text" rows={7} dir="rtl" value={text} placeholder={'שורה לכל בעלים:\nשם | בניין | קומה | דירה\nלדוגמה: ישראל ישראלי | 101 | 9 | B5-3T'} onChange={(e) => setText(e.target.value)} />
          <div className="checks">
            <button id="own-save" type="button" className="act" onClick={() => { s.set({ owners: parseOwners(text) }); setEdit(false) }}>שמירה: {parseOwners(text).length} שורות תקינות</button>
            <button id="own-clear" type="button" onClick={() => { s.set({ owners: [] }); setText('') }}>מחיקת הרשימה</button>
          </div>
        </>
      )}
      <p className="note"><b>פרטיות:</b> השמות נשמרים רק בדפדפן הזה. הם לא נשלחים לשרת, ולא נמצאים באתר או בקוד.</p>
    </div>
  )
}

const DIR8 = ['צפון', 'צפון־מזרח', 'מזרח', 'דרום־מזרח', 'דרום', 'דרום־מערב', 'מערב', 'צפון־מערב']
const dir8 = (b: number) => DIR8[Math.round(b / 45) % 8]

/** תעודת הדירה של ענת: הפרטים כפי שנקראו מהתוכנית, לאימות. */
function MyApt() {
  const s = useStore()
  const on = s.plan
  return (
    <div className="card mine">
      <h3>הדירה שלי, לפי התוכנית</h3>
      <dl>
        <dt>בניין</dt><dd>103, תא שטח 103</dd>
        <dt>קומה</dt><dd>5, במפלס {myApt.level.toFixed(2)}+ מ'</dd>
        <dt>טיפוס</dt><dd>{myApt.type}, דירת תמורה</dd>
        <dt>שטח שמודפס בתוכנית</dt><dd>{myApt.plan_area} מ"ר</dd>
        <dt>שטח מכר בטבלה</dt><dd>102.2 מ"ר</dd>
        <dt>מרפסת</dt><dd>12 מ"ר, פונה ל{dir8(myApt.bearings.balcony)}</dd>
        <dt>חלון הסלון</dt><dd>פונה ל{dir8(myApt.bearings.living)}</dd>
        <dt>דלת הכניסה</dt><dd>בצד {dir8(myApt.bearings.entry)}, מהמבואה</dd>
      </dl>
      <table className="mini">
        <thead><tr><th>חלל</th><th>שטח, מ"ר</th><th>מקור</th></tr></thead>
        <tbody>{myApt.rooms.map((r) => <tr key={r.name}><td><b>{r.name}</b></td><td>{r.area}</td><td>{r.source}</td></tr>)}</tbody>
      </table>
      <div className="checks">
        <button id="apt-plan" type="button" className="act" onClick={() => { const b = towers.find((t) => t.lot === myApt.lot)!; s.set({ plan: true, mode: 'future', apt: { ...s.apt, future: { id: b.id, floor: myApt.floor, facade: 'ne', unit: myApt.type } } }); s.look('plan') }}>הדירה שלי בחתך הקומה</button>
        {on && <button id="apt-plan-off" type="button" onClick={() => { s.set({ plan: false }); s.look('bird') }}>חזרה לבניין השלם</button>}
      </div>
      <p className="note"><b>אימות הכיוון, בשלושה מקורות:</b> 1. שתי טבלאות הדירות רושמות לדירה "צפון מערב". 2. בתוכנית קומה 5 שבהיתר של בניין 103, הדירה A4-2T משורטטת בצד שמאל. 3. בתוכנית קומת הקרקע באותו היתר, בצד שמאל עוברת דרך 609, רחוב ציפורה טוב, ולמטה רחוב האצ"ל. לכן המרפסת פונה לצפון־מערב, והסלון לדרום־מערב. <b>מקור הסתירה:</b> הקובץ "Building A" משורטט לפי בניין 102, שבו אותה דירה פונה לדרום־מזרח. בניין 103 הוא תמונת ראי שלו.</p>
      <p className="note"><b>עובדה:</b> הקירות, החדרים והמידות מתוכנית קומה 5 של בניין A. <b>הערכה:</b> בניין 103 הוא תמונת ראי של התוכנית הזו, ולכן הדירה משוקפת. החתך עובר 1.25 מ' מעל הרצפה, כמו בתוכנית, ולכן הצל שבתוכו מראה כיוון ולא חדירת שמש אמיתית דרך החלונות. <b>לבדיקה:</b> בתוכנית ספרתי שלושה חדרים (סלון ושני חדרי שינה), אף שהטיפוס נקרא A4.</p>
    </div>
  )
}

function HomeNew() {
  const s = useStore()
  const apt = s.apt.future, b = byId(apt?.id ?? null)
  const list = towers.filter((t) => t.real)
  const fl = b?.real?.floors.find((f) => f.floor === apt?.floor) ?? null
  const unit = fl?.apts.find((u) => u.key === apt?.unit) ?? null
  const report = useMemo(() => (b && apt && unit ? unitReport(b, apt.floor, unit) : null), [b, apt, unit])
  const [rank, setRank] = useState<ReturnType<typeof rankTmura> | null>(null)
  useEffect(() => {
    setRank(null)
    if (!b) return
    const id = setTimeout(() => setRank(rankTmura(b)), 40)
    return () => clearTimeout(id)
  }, [b])
  const pick = (id: number, floor?: number, type?: string) => {
    const nb = byId(id)
    if (!nb?.real) return
    const f = nb.real.floors.find((x) => x.floor === floor) ?? nb.real.floors[Math.floor(nb.real.floors.length / 2)]
    s.setApt({ id: nb.id, floor: f.floor, facade: 'ne', unit: f.apts.find((u) => u.key === type)?.key ?? f.apts[0].key })
  }
  const blockers = (m: Map<number, number>) => [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 2).map(([id, h]) => `${byId(id)?.name ?? 'בנייני השכנים'} (${n1(h)} ש')`).join(', ')
  return (
    <>
      <p className="insight"><mark>הדירות כאן הן מתוכניות הבניינים.</mark> בוחרים בניין, קומה ודירה, ורואים את השמש שלה.</p>
      <MyApt />
      <div className="pick">
        <label htmlFor="apt-b">בניין</label>
        <select id="apt-b" value={b?.real ? b.id : ''} onChange={(e) => pick(Number(e.target.value))}>
          <option value="" disabled>בחירה, או לחיצה במודל</option>
          {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        {b?.real && apt && fl && <>
          <label htmlFor="apt-f">קומה <b>{apt.floor}</b> מתוך {b.real.top}</label>
          <input id="apt-f" type="range" min={b.real.floors[0].floor} max={b.real.top} value={apt.floor} onChange={(e) => pick(b.id, Number(e.target.value), apt.unit)} />
          <span className="lab">דירה בקומה</span>
          <div className="seg wide units" role="group" aria-label="דירה">
            {fl.apts.map((u) => <button key={u.key} type="button" aria-pressed={apt.unit === u.key} onClick={() => pick(b.id, apt.floor, u.key)}>{u.key}{u.tmura && <em>תמורה</em>}</button>)}
          </div>
        </>}
      </div>
      {report && unit && apt && b ? (
        <>
          <h4>דירה {unit.type}, קומה {apt.floor}: פונה ל{report.faces.map((f) => f.name).join(' ול')}</h4>
          <div className="stats">
            <div><b>{unit.area ? n1(unit.area) : ''}</b>מ"ר, שטח מכר</div>
            <div><b>{/^[A-Z](\d(?:\.\d)?)/.exec(unit.type)?.[1] ?? ''}</b>חדרים</div>
            <div><b>{n1(report.z)} מ'</b>גובה מהקרקע</div>
            <div><b>{unit.tmura ? 'כן' : 'לא'}</b>דירת תמורה</div>
          </div>
          <table className="mini">
            <thead><tr><th>עונה</th><th>שמש ישירה</th><th>מתי</th><th>מי מצל</th></tr></thead>
            <tbody>{report.days.map((d) => (
              <tr key={d.name}><td><b>{d.name}</b></td><td className={d.r.hours >= 3 ? 'hi' : ''}>{n1(d.r.hours)} שעות</td>
                <td>{d.r.first !== null ? `${hourLabel(d.r.first)} עד ${hourLabel(d.r.last!)}` : 'אין'}</td><td>{blockers(d.r.blocked) || 'אין'}</td></tr>
            ))}</tbody>
          </table>
          <p>{report.faces.map((f, i) => `${f.name}: ${n1(report.days[0].r.perFace[i])} שעות בחורף, ${n1(report.days[2].r.perFace[i])} בקיץ`).join(' · ')}</p>
          <h4>רוח</h4>
          <p>{(Object.keys(WINDS) as WindKey[]).map((k) => `${WINDS[k].name}: ${exposureWord(Math.max(...report.faces.map((f) => exposure(f, WINDS[k].from))))}`).join(' · ')}</p>
          <div className="checks">
            <button id="apt-cut" type="button" className="act" aria-pressed={s.plan} onClick={() => { s.set({ plan: !s.plan }); s.look(s.plan ? 'bird' : 'plan') }}>{s.plan ? 'חזרה לבניין השלם' : 'חתך בקומה'}</button>
            <button type="button" onClick={() => { s.set({ plan: false }); s.look('window') }}>מבט מהחלון</button>
          </div>
          <h4>דירות התמורה ב{b.name}, לפי שמש בחורף</h4>
          {rank ? (rank.length ? (
            <table className="mini rank">
              <thead><tr><th>קומה</th><th>דירה</th><th>פונה ל</th><th>חורף</th><th>קיץ</th></tr></thead>
              <tbody>{rank.map((r) => (
                <tr key={`${r.floor}${r.unit.key}`} className={r.floor === apt.floor && r.unit.key === apt.unit ? 'on' : 'row'} onClick={() => pick(b.id, r.floor, r.unit.key)}>
                  <td><b>{r.floor}</b></td><td>{r.unit.type}</td><td>{r.faces}</td><td className={r.winter >= 3 ? 'hi' : ''}>{n1(r.winter)}</td><td>{n1(r.summer)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="hint">בבניין הזה לא סומנו דירות תמורה בתוכניות.</p>) : <p className="hint">מדרג את דירות התמורה.</p>}
          <p className="note"><b>עובדה:</b> קו המתאר, מיקום הדירות והטיפוסים מתוכניות הבניינים, ושטח המכר מטבלת הדירות המוצעות. <b>הערכה:</b> דירות התמורה סומנו לפי טבלת הדירות המוצעות: האות T בשם הטיפוס, והדירות שרשומות בה לבעלי הקרקע. השמש נבדקת בנקודה אחת בכל חזית, בגובה 1.5 מ' מעל רצפת הקומה שבחתך.</p>
        </>
      ) : <p className="hint">בוחרים בניין ברשימה, או לוחצים עליו במודל.</p>}
    </>
  )
}

function Home() {
  const mode = useStore((s) => s.mode)
  return <><Owners />{mode === 'future' ? <HomeNew /> : <HomeOld />}</>
}

export default function Panel() {
  const tab = useStore((s) => s.tab)
  void KEY_DAYS
  return <aside className="panel">{tab === 'site' ? <Site /> : tab === 'sun' ? <SunTab /> : tab === 'wind' ? <WindTab /> : <Home />}</aside>
}
