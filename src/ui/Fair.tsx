// הוגנות התמורה: שני בעלים מאותו בניין ישן, דירה קטנה ודירה גדולה. כמה מקבל כל אחד לכל מ"ר ישן.
import { useState } from 'react'
import raw from '../../data/comps.json'
import { towers } from '../lib/site.ts'

interface Deal { group: string; rooms: number; area: number; floor: number | null; ppm: number; date: string }
const deals = (raw as unknown as { deals: Deal[] }).deals
const nis = (x: number) => Math.round(x).toLocaleString('he')
const mil = (x: number) => `${(x / 1e6).toLocaleString('he', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} מיליון`
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0 }

// מה העסקאות אומרות: במגדל הצמוד, ציפורה טוב 3, דירות 3 חדרים מול 4 חדרים
const tower = deals.filter((d) => d.group === 'tower')
const ppm3 = median(tower.filter((d) => d.rooms === 3).map((d) => d.ppm)), ppm4 = median(tower.filter((d) => d.rooms === 4).map((d) => d.ppm))
const sizeFromData = Math.round((ppm3 / ppm4 - 1) * 100)
const four = tower.filter((d) => d.rooms === 4 && d.floor !== null)
const low = median(four.filter((d) => d.floor! <= 5).map((d) => d.ppm)), high = median(four.filter((d) => d.floor! >= 8).map((d) => d.ppm))

// איפה נמצאות דירות התמורה בפועל, לפי התוכניות והטבלה
const alloc = (() => {
  const m = new Map<string, { type: string; area: number | null; lots: Set<string>; floors: number[] }>()
  for (const t of towers) for (const f of t.real?.floors ?? []) for (const u of f.apts) if (u.tmura) {
    const k = u.type
    if (!m.has(k)) m.set(k, { type: u.type, area: u.area, lots: new Set(), floors: [] })
    m.get(k)!.lots.add(t.lot!); m.get(k)!.floors.push(f.floor)
  }
  return [...m.values()].sort((a, b) => (a.area ?? 999) - (b.area ?? 999))
})()

const Num = ({ id, label, value, set, step = 1, unit }: { id: string; label: string; value: number; set: (v: number) => void; step?: number; unit: string }) => (
  <label htmlFor={id} className="num"><span>{label}</span><input id={id} type="number" step={step} value={value} onChange={(e) => set(Number(e.target.value))} /><em>{unit}</em></label>
)

export default function Fair() {
  const [oldPpm, setOldPpm] = useState(23600)
  const [aOld, setAOld] = useState(50), [aNew, setANew] = useState(80), [aFloor, setAFloor] = useState(20)
  const [bOld, setBOld] = useState(80), [bNew, setBNew] = useState(102.2), [bFloor, setBFloor] = useState(5)
  const [base, setBase] = useState(26000), [perFloor, setPerFloor] = useState(0.5), [small, setSmall] = useState(sizeFromData)
  // שווי דירה חדשה: מחיר בסיס בקומה 5, תוספת לכל קומה מעליה, ותוספת למ"ר בדירה קטנה (עד 85 מ"ר)
  const value = (area: number, floor: number) => area * base * (1 + (perFloor * (floor - 5)) / 100) * (area <= 85 ? 1 + small / 100 : 1)
  const A = { old: aOld * oldPpm, nw: value(aNew, aFloor) }, B = { old: bOld * oldPpm, nw: value(bNew, bFloor) }
  const perA = A.nw / aOld, perB = B.nw / bOld, ratioA = A.nw / A.old, ratioB = B.nw / B.old
  const gapPct = Math.round((perA / perB - 1) * 100)
  // פירוק היתרון של א לשלושה גורמים
  const fArea = (aNew / aOld) / (bNew / bOld), fSize = (aNew <= 85 ? 1 + small / 100 : 1) / (bNew <= 85 ? 1 + small / 100 : 1), fFloor = (1 + (perFloor * (aFloor - 5)) / 100) / (1 + (perFloor * (bFloor - 5)) / 100)
  const main = fArea >= fFloor && fArea >= fSize ? 'תוספת השטח, לא הקומה' : fFloor >= fSize ? 'הקומה' : 'המחיר הגבוה למ"ר של דירה קטנה'
  const hi = Math.max(perA, perB)
  // השטח שהיה משווה את התמורה למ"ר ישן
  const fairB = (perA * bOld) / (B.nw / bNew)
  return (
    <div className="value fair">
      <header>
        <div>
          <div className="eyebrow">הוגנות התמורה · שני בעלים מאותו בניין ישן · מודל עם הנחות שאפשר לשנות</div>
          <h1>{gapPct > 3 ? <>בעל הדירה הקטנה מקבל <b>{gapPct}% יותר</b> לכל מ"ר ישן</> : gapPct < -3 ? <>בעל הדירה הגדולה מקבל <b>{-gapPct}% יותר</b> לכל מ"ר ישן</> : <>התמורה לכל מ"ר ישן <b>כמעט שווה</b></>}</h1>
        </div>
        <p className="lede">שתי הדירות הישנות שוות אותו מחיר למ"ר. אחרי ההתחדשות, בעל <b>{aOld} מ"ר</b> מחזיק <b>{nis(perA)} ש"ח</b> לכל מ"ר ישן, ובעל <b>{bOld} מ"ר</b> מחזיק <b>{nis(perB)} ש"ח</b>.<br /><mark>{gapPct > 3 ? `הטענה נכונה בכיוון. הגורם העיקרי הוא ${main}.` : 'בהנחות האלה הטענה אינה מתקיימת.'}</mark></p>
      </header>

      <section className="pair">
        <div className="bar-row"><span>בעלים א: {aOld} מ"ר ישן</span><i style={{ width: `${(perA / hi) * 100}%` }} className="new" /><b>{nis(perA)} למ"ר ישן</b></div>
        <div className="bar-row"><span>בעלים ב: {bOld} מ"ר ישן</span><i style={{ width: `${(perB / hi) * 100}%` }} className="old" /><b>{nis(perB)} למ"ר ישן</b></div>
      </section>

      <section className="cols">
        <div>
          <h2>1. החישוב, שלב אחרי שלב</h2>
          <div className="tw"><table className="mini crit">
            <thead><tr><th>שלב</th><th>בעלים א, דירה קטנה</th><th>בעלים ב, דירה גדולה</th></tr></thead>
            <tbody>
              <tr><td><b>דירה ישנה</b></td><td>{aOld} מ"ר × {nis(oldPpm)} = {mil(A.old)}</td><td>{bOld} מ"ר × {nis(oldPpm)} = {mil(B.old)}</td></tr>
              <tr><td><b>דירה חדשה</b></td><td>{aNew} מ"ר, קומה {aFloor}</td><td>{bNew} מ"ר, קומה {bFloor}</td></tr>
              <tr><td><b>מחיר למ"ר חדש</b></td><td>{nis(A.nw / aNew)}</td><td>{nis(B.nw / bNew)}</td></tr>
              <tr><td><b>שווי הדירה החדשה</b></td><td>{mil(A.nw)}</td><td>{mil(B.nw)}</td></tr>
              <tr><td><b>יחס ההחלפה</b>, חדש חלקי ישן</td><td className={ratioA > ratioB ? 'hi' : ''}>פי {ratioA.toFixed(2)}</td><td className={ratioB > ratioA ? 'hi' : ''}>פי {ratioB.toFixed(2)}</td></tr>
              <tr><td><b>תמורה לכל מ"ר ישן</b></td><td className={perA > perB ? 'hi' : ''}>{nis(perA)} ש"ח</td><td className={perB > perA ? 'hi' : ''}>{nis(perB)} ש"ח</td></tr>
              <tr><td><b>תוספת שווי</b></td><td>{mil(A.nw - A.old)}</td><td>{mil(B.nw - B.old)}</td></tr>
            </tbody>
          </table></div>

          <h2>2. מאיפה בא היתרון של בעלים א</h2>
          <div className="tw"><table className="mini crit">
            <thead><tr><th>גורם</th><th>השפעה</th><th>הסבר</th></tr></thead>
            <tbody>
              <tr><td><b>תוספת שטח</b></td><td className="hi">{Math.round((fArea - 1) * 100)}%</td><td>א מקבל פי {(aNew / aOld).toFixed(2)} מהשטח הישן, ו־ב פי {(bNew / bOld).toFixed(2)}. דירה חדשה אינה יכולה להיות קטנה מדירת 3 חדרים עם ממ"ד.</td></tr>
              <tr><td><b>דירה קטנה יקרה יותר למ"ר</b></td><td className="hi">{Math.round((fSize - 1) * 100)}%</td><td>בעסקאות במגדל הצמוד: {nis(ppm3)} ש"ח למ"ר ב־3 חדרים, מול {nis(ppm4)} ב־4 חדרים.</td></tr>
              <tr><td><b>קומה גבוהה</b></td><td className="hi">{Math.round((fFloor - 1) * 100)}%</td><td>{perFloor}% לכל קומה, כפול {aFloor - bFloor} קומות. זו הנחה, ראי סעיף 4.</td></tr>
              <tr><td><b>סך הכול</b></td><td><b>{gapPct}%</b></td><td>שלושת הגורמים מוכפלים זה בזה.</td></tr>
            </tbody>
          </table></div>
          <p className="res">כדי שהתמורה למ"ר ישן תהיה שווה, בעלים ב היה צריך לקבל <b>{fairB.toFixed(0)} מ"ר</b> באותה קומה, במקום {bNew}.</p>

          <h2>3. איפה נמצאות דירות התמורה בפועל</h2>
          <div className="tw"><table className="mini">
            <thead><tr><th>טיפוס</th><th>שטח מכר, מ"ר</th><th>בניינים</th><th>כמה דירות</th><th>קומות</th></tr></thead>
            <tbody>{alloc.map((r) => (
              <tr key={r.type}><td><b>{r.type}</b></td><td>{r.area ?? 'לא נקרא'}</td><td>{[...r.lots].join(', ')}</td><td>{r.floors.length}</td><td className={Math.max(...r.floors) >= 15 ? 'hi' : ''}>{Math.min(...r.floors)} עד {Math.max(...r.floors)}</td></tr>
            ))}</tbody>
          </table></div>
          <p className="note"><b>עובדה:</b> דירות התמורה הקטנות, 80 מ"ר, מגיעות עד קומה 23. דירות התמורה הגדולות, מ־100 מ"ר ומעלה, נמצאות כולן בקומות 2 עד 14. זה תואם לתיאור שלך.</p>
        </div>

        <div className="calc">
          <h2>ההנחות, לשינוי</h2>
          <h3>הבניין הישן</h3>
          <Num id="f-op" label="מחיר למ״ר, זהה לשתי הדירות" value={oldPpm} set={setOldPpm} step={100} unit='ש"ח' />
          <h3>בעלים א</h3>
          <Num id="f-ao" label="שטח הדירה הישנה" value={aOld} set={setAOld} unit='מ"ר' />
          <Num id="f-an" label="שטח הדירה החדשה" value={aNew} set={setANew} unit='מ"ר' />
          <Num id="f-af" label="קומה בבניין החדש" value={aFloor} set={setAFloor} unit="קומה" />
          <h3>בעלים ב</h3>
          <Num id="f-bo" label="שטח הדירה הישנה" value={bOld} set={setBOld} unit='מ"ר' />
          <Num id="f-bn" label="שטח הדירה החדשה" value={bNew} set={setBNew} step={0.1} unit='מ"ר' />
          <Num id="f-bf" label="קומה בבניין החדש" value={bFloor} set={setBFloor} unit="קומה" />
          <h3>הבניין החדש</h3>
          <Num id="f-b" label="מחיר בסיס למ״ר, בקומה 5" value={base} set={setBase} step={100} unit='ש"ח' />
          <Num id="f-pf" label="תוספת לכל קומה" value={perFloor} set={setPerFloor} step={0.1} unit="%" />
          <Num id="f-s" label="תוספת למ״ר בדירה עד 85 מ״ר" value={small} set={setSmall} unit="%" />

          <h2>4. מה העסקאות אומרות על קומה</h2>
          <p>בציפורה טוב 3, דירות 4 חדרים: חציון <b>{nis(low)}</b> ש"ח למ"ר בקומות 1 עד 5, מול <b>{nis(high)}</b> בקומות 8 עד 15.</p>
          <p className="note"><b>ממצא:</b> בנתונים האלה אין תוספת לקומה גבוהה. הקומות הגבוהות נמכרו אפילו בפחות, כי הן נמכרו מאוחר יותר, בשוק יורד. המדגם קטן, {four.length} עסקאות, ולכן אי אפשר לבודד את השפעת הקומה. התוספת של {perFloor}% לקומה היא הנחה מקובלת, לא נתון.</p>
        </div>
      </section>

      <section className="trust">
        <div className="fact"><h3>מה נכון בטענה</h3>
          <p>שתי דירות באותו מחיר למ"ר יוצאות מההתחדשות עם תמורה שונה לכל מ"ר ישן. בעל הדירה הקטנה מרוויח יותר, יחסית לנכס שמסר.</p></div>
        <div className="est"><h3>מה צריך לדייק</h3>
          <p>זה לא מוכיח שהדירה הקטנה "הייתה" יקרה יותר למ"ר בבניין הישן. המחיר הישן היה זהה. מה שהשתנה הוא <b>יחס ההחלפה</b>: הפרויקט מחלק את הערך החדש שלא ביחס ישר לשטח הישן.</p>
          <p>הגורם הראשי הוא גודל מינימלי לדירה חדשה, ואחריו הקומה והמחיר הגבוה למ"ר של דירות קטנות.</p></div>
        <div className="asm"><h3>מה לא ידוע</h3>
          <p>שטחי הדירות הישנות של שאר הבעלים, ולכן אי אפשר לחשב את יחס ההחלפה האמיתי של כל אחד. הדוגמה כאן היא מודל, לא נתוני הפרויקט.</p>
          <p>לפי מסמך השמאי, הניקוד קובע רק את סדר בחירת הדירות. איך נקבע השטח שכל בעלים מקבל, לא מופיע במסמכים שקראתי.</p></div>
      </section>
    </div>
  )
}
