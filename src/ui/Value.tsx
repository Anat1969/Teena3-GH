// דוח שווי ותמורה: הדירה הקיימת מול דירת התמורה. כל הנחה ניתנת לשינוי, והחישוב גלוי.
import { useMemo, useState } from 'react'
import raw from '../../data/comps.json'
import { myApt, towers } from '../lib/site.ts'
import { unitReport } from '../lib/analysis.ts'

interface Deal { group: 'new' | 'tower' | 'firsthand' | 'old'; street: string; no: string; rooms: number; area: number; floor: number | null; price: number; ppm: number; date: string }
const data = raw as unknown as { source: string; url: string; read: string; city: { median4: number; change: number; source: string }; deals: Deal[] }
const nis = (x: number) => Math.round(x).toLocaleString('he')
const mil = (x: number) => `${(x / 1e6).toLocaleString('he', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} מיליון`
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0 }
const dmy = (d: string) => d.split('-').reverse().join('.')
const RATES: [string, number][] = [['בלי היוון: היזם משלם דמי שכירות', 0], ['תשואת שכירות ברחובות', 2.45], ['ההנחה ההתחלתית', 3], ['ריבית משכנתא צמודה, בקירוב', 4], ['תשואה עם סיכון עיכוב', 6]]
const GROUPS: Record<Deal['group'], string> = { new: 'בניין חדש מקבלן: דרך יבנה 67', tower: 'מגדל צמוד למתחם: ציפורה טוב 3', firsthand: 'קומות גבוהות, כתובת לא דווחה', old: 'בניינים ותיקים בשכונה' }

// הבסיס לדירת התמורה: בניינים חדשים וגבוהים, 4 חדרים ומעלה, מנובמבר 2025.
const newBase = data.deals.filter((d) => (d.group === 'new' || d.group === 'tower') && d.rooms >= 4 && d.date >= '2025-11')
// הבסיס לדירה הקיימת: דירות ותיקות בגודל דומה, 66 עד 81 מ"ר.
const oldBase = data.deals.filter((d) => d.group === 'old' && d.area >= 66 && d.area <= 81)

function Table({ group, mark }: { group: Deal['group']; mark: Deal[] }) {
  const rows = data.deals.filter((d) => d.group === group).sort((a, b) => b.date.localeCompare(a.date))
  return (
    <div className="tw">
      <table className="mini">
        <caption>{GROUPS[group]}</caption>
        <thead><tr><th>תאריך</th><th>כתובת</th><th>חדרים</th><th>מ"ר</th><th>קומה</th><th>מחיר, ש"ח</th><th>למ"ר</th></tr></thead>
        <tbody>{rows.map((d, i) => (
          <tr key={i} className={mark.includes(d) ? 'on' : ''}><td>{dmy(d.date)}</td><td>{d.street} {d.no}</td><td>{d.rooms}</td><td>{d.area}</td><td>{d.floor ?? ''}</td><td>{nis(d.price)}</td><td><b>{nis(d.ppm)}</b></td></tr>
        ))}</tbody>
      </table>
    </div>
  )
}

const Num = ({ id, label, value, set, step = 1, unit }: { id: string; label: string; value: number; set: (v: number) => void; step?: number; unit: string }) => (
  <label htmlFor={id} className="num"><span>{label}</span><input id={id} type="number" step={step} value={value} onChange={(e) => set(Number(e.target.value))} /><em>{unit}</em></label>
)

export default function Value() {
  const [oldArea, setOldArea] = useState(76)
  const [oldPpm, setOldPpm] = useState(Math.round(median(oldBase.map((d) => d.ppm)) / 100) * 100)
  const [newArea, setNewArea] = useState(102.2)
  const [newPpm, setNewPpm] = useState(Math.round(median(newBase.map((d) => d.ppm)) / 100) * 100)
  const [pNew, setPNew] = useState(5), [pFloor, setPFloor] = useState(-3), [pDir, setPDir] = useState(1)
  const [years, setYears] = useState(4), [rate, setRate] = useState(0), [rent, setRent] = useState(0)
  const sun = useMemo(() => {
    const b = towers.find((t) => t.lot === myApt.lot), u = b?.real?.floors.find((f) => f.floor === myApt.floor)?.apts.find((x) => x.type === myApt.type)
    return b && u ? unitReport(b, myApt.floor, u) : null
  }, [])
  const adj = 1 + (pNew + pFloor + pDir) / 100
  const r = rate / 100
  // דמי שכירות מהיזם בתקופת הבנייה, בערך של היום
  const rentNow = rent * 12 * (r > 0 ? (1 - (1 + r) ** -years) / r : years)
  const vOld = oldArea * oldPpm, vNew = newArea * newPpm * adj, vNewNow = vNew / (1 + r) ** years + rentNow
  const gap = vNew - vOld, gapNow = vNewNow - vOld
  const hi = Math.max(vOld, vNew)
  return (
    <div className="value">
      <header>
        <div>
          <div className="eyebrow">דוח שווי ותמורה · התאנה 3 מול בניין 103, קומה 5 · נכון ל־{dmy(data.read)}</div>
          <h1>הדירות <b>אינן שוות ערך</b>: התמורה שווה יותר</h1>
        </div>
        <p className="lede">דירת התמורה מוערכת ב־<b>{mil(vNew)} ש"ח</b>, והדירה הקיימת ב־<b>{mil(vOld)} ש"ח</b>.<br /><mark>הפער: {mil(gap)} ש"ח, תוספת של {Math.round((gap / vOld) * 100)}%.</mark> בכסף של היום, אחרי {years} שנות המתנה{rent > 0 ? ' ועם דמי השכירות' : ''}, הפער הוא {mil(gapNow)}.</p>
      </header>

      <section className="pair">
        <div className="bar-row"><span>הדירה הקיימת</span><i style={{ width: `${(vOld / hi) * 100}%` }} className="old" /><b>{mil(vOld)}</b></div>
        <div className="bar-row"><span>הדירה החדשה, בכסף של היום</span><i style={{ width: `${(vNewNow / hi) * 100}%` }} className="now" /><b>{mil(vNewNow)}</b></div>
        <div className="bar-row"><span>הדירה החדשה, אילו נמסרה היום</span><i style={{ width: `${(vNew / hi) * 100}%` }} className="new" /><b>{mil(vNew)}</b></div>
      </section>

      <section className="cols">
        <div>
          <h2>1. הקריטריונים, דירה מול דירה</h2>
          <div className="tw"><table className="mini crit">
            <thead><tr><th>קריטריון</th><th>הקיימת, התאנה 3</th><th>התמורה, בניין 103</th><th>יתרון</th></tr></thead>
            <tbody>
              <tr><td><b>שטח</b></td><td>{oldArea} מ"ר</td><td>{newArea} מ"ר שטח מכר, 106.2 בתוכנית</td><td className="hi">תמורה, {Math.round((newArea / oldArea - 1) * 100)}%+</td></tr>
              <tr><td><b>מרפסת</b></td><td>לא ידוע</td><td>12 מ"ר, ועוד מרפסת שירות 4 מ"ר</td><td className="hi">תמורה</td></tr>
              <tr><td><b>גיל הבניין</b></td><td>ישן, שיכון של שלוש קומות</td><td>חדש</td><td className="hi">תמורה</td></tr>
              <tr><td><b>מעלית</b></td><td>אין</td><td>יש, והדירה צמודה לגרעין</td><td className="hi">תמורה</td></tr>
              <tr><td><b>ממ"ד</b></td><td>אין, בהנחה</td><td>יש, 9.1 מ"ר</td><td className="hi">תמורה</td></tr>
              <tr><td><b>קומה</b></td><td>לא ידוע, עד קומה 3</td><td>5 מתוך 27, נמוכה למגדל</td><td>שקול</td></tr>
              <tr><td><b>כיוונים</b></td><td>לא ידוע</td><td>צפון־מערב ודרום־מערב</td><td>לבדיקה</td></tr>
              <tr><td><b>שמש, לפי המודל</b></td><td>לא נבדק</td><td>{sun ? `${sun.days[0].r.hours} שעות בחורף, ${sun.days[2].r.hours} בקיץ, בלי בניין מצל` : ''}</td><td>לבדיקה</td></tr>
              <tr><td><b>צפיפות</b></td><td>100 דירות במתחם</td><td>375 דירות, 133 בבניין</td><td className="lo">קיימת</td></tr>
              <tr><td><b>הוצאות שוטפות</b></td><td>ועד בית נמוך</td><td>ועד בית של מגדל, וארנונה על שטח גדול יותר</td><td className="lo">קיימת</td></tr>
              <tr><td><b>חניה ומחסן</b></td><td>לא ידוע</td><td>לא נבדק מול ההסכם</td><td>לבדיקה</td></tr>
            </tbody>
          </table></div>

          <h2>2. עסקאות ההשוואה</h2>
          <p className="note">{data.source}. השורות המסומנות הן אלה שמהן נגזר מחיר הבסיס.</p>
          <div className="grid2">
            <div><Table group="old" mark={oldBase} /></div>
            <div><Table group="new" mark={newBase} /><Table group="tower" mark={newBase} /><Table group="firsthand" mark={[]} /></div>
          </div>
        </div>

        <div className="calc">
          <h2>3. החישוב, עם ההנחות שלך</h2>
          <h3>הדירה הקיימת</h3>
          <Num id="v-oa" label="שטח" value={oldArea} set={setOldArea} unit='מ"ר' />
          <Num id="v-op" label={`מחיר בסיס: חציון ${oldBase.length} דירות ותיקות בגודל דומה`} value={oldPpm} set={setOldPpm} step={100} unit='ש"ח למ"ר' />
          <p className="res">{oldArea} × {nis(oldPpm)} = <b>{nis(vOld)} ש"ח</b></p>
          <h3>דירת התמורה</h3>
          <Num id="v-na" label="שטח מכר" value={newArea} set={setNewArea} step={0.1} unit='מ"ר' />
          <Num id="v-np" label={`מחיר בסיס: חציון ${newBase.length} עסקאות בבניינים חדשים וגבוהים`} value={newPpm} set={setNewPpm} step={100} unit='ש"ח למ"ר' />
          <Num id="v-pn" label="תוספת לבניין חדש לגמרי" value={pNew} set={setPNew} unit="%" />
          <Num id="v-pf" label="קומה 5 מתוך 27" value={pFloor} set={setPFloor} unit="%" />
          <Num id="v-pd" label="כיוונים ושמש" value={pDir} set={setPDir} unit="%" />
          <p className="res">{newArea} × {nis(newPpm)} × {adj.toFixed(2)} = <b>{nis(vNew)} ש"ח</b>, כלומר {nis(newPpm * adj)} למ"ר</p>
          <h3>זמן</h3>
          <Num id="v-y" label="שנים עד המסירה" value={years} set={setYears} unit="שנים" />
          <Num id="v-r" label="שיעור היוון שנתי" value={rate} set={setRate} step={0.5} unit="%" />
          <Num id="v-rent" label="דמי שכירות חודשיים מהיזם" value={rent} set={setRent} step={500} unit='ש"ח' />
          <p className="res">הדירה החדשה בכסף של היום: {nis(vNew)} ÷ {(1 + r).toFixed(3)}<sup>{years}</sup>{rent > 0 ? <> + {nis(rentNow)} שכירות</> : null} = <b>{nis(vNewNow)} ש"ח</b></p>
          <table className="mini rates">
            <thead><tr><th>איזו ריבית</th><th>%</th><th>שווי היום</th><th>פער</th></tr></thead>
            <tbody>{RATES.map(([name, v]) => { const now = vNew / (1 + v / 100) ** years + rent * 12 * (v > 0 ? (1 - (1 + v / 100) ** -years) / (v / 100) : years); return (
              <tr key={name} className={rate === v ? 'on' : 'row'} onClick={() => setRate(v)}><td><b>{name}</b></td><td>{v}</td><td>{mil(now)}</td><td>{mil(now - vOld)}</td></tr>
            ) })}</tbody>
          </table>
          <p className="note">לחיצה על שורה בוחרת את הריבית. <b>עובדה:</b> תשואת השכירות ברחובות, 2.45%, מאתר הנדל"ן הממשלתי. <b>עובדה:</b> לפי ההסכם היזם משלם דמי שכירות בתקופת הבנייה, ולכן ברירת המחדל היא בלי היוון. <b>הערכה:</b> שאר הריביות הן סדרי גודל.</p>

          <h2>4. המסקנה</h2>
          <ol className="verdict">
            <li><b>בשווי:</b> התמורה גבוהה ב־{mil(gap)} ש"ח, ובכסף של היום ב־{mil(gapNow)}.</li>
            <li><b>בשטח:</b> {(newArea - oldArea).toFixed(1)} מ"ר נוספים, ועוד מרפסת של 12 מ"ר.</li>
            <li><b>במחיר למ"ר:</b> {nis(oldPpm)} בקיימת מול {nis(newPpm * adj)} בתמורה.</li>
            <li><b>מה לא נמדד בכסף:</b> שנות הבנייה מחוץ לבית, צפיפות, והוצאות שוטפות גבוהות יותר.</li>
          </ol>
        </div>
      </section>

      <section className="trust">
        <div className="fact"><h3>עובדה</h3>
          <p>מחירי העסקאות, השטחים והתאריכים: עסקאות מכר רשומות. שטח התמורה והחדרים: תוכנית הקומה וטבלת הדירות.</p>
          <p>רקע עירוני, לפי {data.city.source}: חציון דירת 4 חדרים {mil(data.city.median4)} ש"ח, ושינוי של {data.city.change}% בשנה האחרונה.</p></div>
        <div className="est"><h3>הערכה</h3>
          <p>מחירי הבסיס הם חציונים של מעט עסקאות. ההתאמות לבניין חדש, לקומה ולכיוונים הן שיקול דעת, וכך גם שיעור ההיוון ומועד המסירה.</p>
          <p>מחירי הדירות הוותיקות בשכונה כבר מגלמים, כנראה, ציפייה להתחדשות. לכן שווי הדירה הקיימת בלי הפרויקט נמוך יותר, והפער האמיתי גדול יותר.</p></div>
        <div className="asm"><h3>הנחה ומגבלה</h3>
          <p>זו אינה שומה, ולא נערכה בידי שמאי מקרקעין. לא נבדקו הקומה והכיוון של הדירה הקיימת, חניה, מחסן, דמי שכירות בתקופת הבנייה ומיסוי.</p>
          <p>גיל הבניינים אומת רק לדרך יבנה 67. לפני החלטה כספית דרושה שומה מקצועית.</p></div>
      </section>
      <footer>מקור העסקאות: <a href={data.url} target="_blank" rel="noreferrer">עסקאות רשומות בנווה יהודה</a>. לאימות עצמאי: <a href="https://www.nadlan.gov.il/?view=settlement&id=8400&page=deals" target="_blank" rel="noreferrer">אתר הנדל"ן הממשלתי</a>.</footer>
    </div>
  )
}
