// בדיקת טענת בעלי הדירות המורחבות: מה אומר ההסכם, מה אומר המכתב, ומה מראים נתוני המודל.
import { useEffect, useState } from 'react'
import { type Row, med, tmuraRows } from '../lib/claim.ts'

const nis = (x: number) => Math.round(x).toLocaleString('he')
const n1 = (x: number) => x.toLocaleString('he', { maximumFractionDigits: 1 })
const Num = ({ id, label, value, set, step = 1, unit }: { id: string; label: string; value: number; set: (v: number) => void; step?: number; unit: string }) => (
  <label htmlFor={id} className="num"><span>{label}</span><input id={id} type="number" step={step} value={value} onChange={(e) => set(Number(e.target.value))} /><em>{unit}</em></label>
)
type V = 'yes' | 'part' | 'no'
const VERDICT: Record<V, string> = { yes: 'נתמך בנתונים', part: 'נתמך חלקית', no: 'לא נתמך' }

export default function Claim() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { const id = setTimeout(() => setRows(tmuraRows()), 30); return () => clearTimeout(id) }, [])
  const [value, setValue] = useState(2740000), [perFloor, setPerFloor] = useState(0.75), [target, setTarget] = useState(14)
  if (!rows) return <div className="value"><p className="hint">מחשב את נתוני דירות התמורה.</p></div>
  const tw = rows.filter((r) => r.expanded && (r.lot === '102' || r.lot === '103'))
  const b101 = rows.filter((r) => r.expanded && r.lot === '101'), b104 = rows.filter((r) => r.expanded && r.lot === '104')
  const reg = rows.filter((r) => !r.expanded), regTw = reg.filter((r) => r.lot === '102' || r.lot === '103')
  const groups: [string, Row[]][] = [['מורחבות במגדלים 102 ו־103', tw], ['מורחבות בבניין 101', b101], ['מורחבות בבניין 104', b104], ['רגילות, 3 חדרים, בכל הבניינים', reg]]
  const floorMed = med(tw.map((r) => r.floor)), gain = (target - floorMed) * (perFloor / 100) * value
  const above = regTw.filter((r) => r.floor > Math.max(...tw.map((x) => x.floor))).length
  const claims: { claim: string; fact: string; v: V }[] = [
    { claim: 'קיבלנו את הקומות הנמוכות ביותר, 4 עד 6', v: 'yes', fact: `ארבע הדירות בקומות ${tw.map((r) => r.floor).sort((a, b) => a - b).join(', ')}, מתוך ${tw[0]?.top}. הקומה הנמוכה ביותר שההסכם מתיר במגדל היא 4.` },
    { claim: 'שובצנו בבניינים הצפופים ביותר', v: 'yes', fact: `133 דירות בכל מגדל, מול 73 בבניין 101 ו־36 בבניין 104.` },
    { claim: 'דירות מורחבות אחרות קיבלו קומות גבוהות יותר', v: 'yes', fact: `בבניין 101 המורחבות בקומות ${Math.min(...b101.map((r) => r.floor))} עד ${Math.max(...b101.map((r) => r.floor))}, חציון ${n1(med(b101.map((r) => r.floor)))}. בגובה יחסי: ${Math.round(med(b101.map((r) => r.rel)) * 100)}% מגובה הבניין, מול ${Math.round(med(tw.map((r) => r.rel)) * 100)}% אצל הארבע.` },
    { claim: 'בעלי דירות לא מורחבות קיבלו קומות 20 עד 23', v: 'yes', fact: `דירות התמורה הרגילות מגיעות עד קומה ${Math.max(...reg.map((r) => r.floor))}. במגדלים, ${above} מתוך ${regTw.length} מהן גבוהות מכל ארבע המורחבות.` },
    { claim: 'הדירות פונות לכביש הראשי ולא לגינה', v: tw.some((r) => r.park) ? 'part' : 'yes', fact: `אף אחת מהארבע אינה פונה לגינה הציבורית. הכיוונים: ${[...new Set(tw.map((r) => r.faces))].join('; ')}. גם המורחבות ב־101 אינן פונות לגינה.` },
    { claim: 'הכיוונים הם הפחות אטרקטיביים', v: 'part', fact: `בשמש זה לא נכון: חציון ${n1(med(tw.map((r) => r.winter)))} שעות שמש בחורף אצל הארבע, מול ${n1(med(reg.map((r) => r.winter)))} בדירות הרגילות. ברעש ובנוף זה כנראה נכון, אבל המודל לא מודד רעש.` },
    { claim: 'לא ניתנה לנו אפשרות בחירה', v: 'part', fact: 'לשתיים מהארבע טיפוס ייחודי: A4-2T ו־A4-4T מופיעים פעם אחת בכל מגדל. לשתיים האחרות טיפוס A4, שמתחת לקומה 21 קיים רק עד קומה 4. כשיש דירה אחת בקבוצה, אין ממה לבחור. האם הוצעו חלופות, המודל לא יודע.' },
  ]
  return (
    <div className="value claim">
      <header>
        <div>
          <div className="eyebrow">בדיקת טענת הדירות המורחבות · ההסכם, מכתב הדרישה ונתוני המודל · אינו ייעוץ משפטי</div>
          <h1>הטענה <b>נתמכת בנתונים</b>, אבל לא מצאתי <b>הפרה מפורשת</b> של ההסכם</h1>
        </div>
        <p className="lede">ארבע הדירות המורחבות שבמגדלים נמצאות ב־<b>{Math.round(med(tw.map((r) => r.rel)) * 100)}% מגובה הבניין</b>. המורחבות ב־101 נמצאות ב־<b>{Math.round(med(b101.map((r) => r.rel)) * 100)}%</b>, והרגילות ב־<b>{Math.round(med(reg.map((r) => r.rel)) * 100)}%</b>.<br /><mark>הבסיס החזק הוא יחס שונה לבעלים מאותה קבוצה, ולא סעיף שהופר.</mark></p>
      </header>

      <section className="pair">
        {groups.map(([name, g]) => (
          <div key={name} className="bar-row"><span>{name}</span><i style={{ width: `${med(g.map((r) => r.rel)) * 100}%` }} className={g === tw ? 'bad' : 'old'} /><b>קומה {n1(med(g.map((r) => r.floor)))}, {Math.round(med(g.map((r) => r.rel)) * 100)}% מהגובה</b></div>
        ))}
      </section>

      <section className="cols">
        <div>
          <h2>1. טענות המכתב מול הנתונים</h2>
          <div className="tw"><table className="mini crit">
            <thead><tr><th>הטענה במכתב</th><th>מה מראה המודל</th><th>הערכה</th></tr></thead>
            <tbody>{claims.map((c) => <tr key={c.claim}><td><b>{c.claim}</b></td><td>{c.fact}</td><td className={c.v === 'yes' ? 'hi' : c.v === 'no' ? 'lo' : ''}>{VERDICT[c.v]}</td></tr>)}</tbody>
          </table></div>

          <h2>2. מה אומר ההסכם</h2>
          <div className="tw"><table className="mini crit">
            <thead><tr><th>סעיף</th><th>מה נקבע</th><th>האם היזם עומד בו</th></tr></thead>
            <tbody>
              <tr><td><b>9.1, שטח</b></td><td>שטח הדירה הקיימת לפי היתר, ועוד 30 מ"ר. לדירה מורחבת מתווסף שטח ההרחבה. השטח כולל ממ"ד ומסתור כביסה.</td><td className="hi">עומד. 76 ועוד 30 הם 106, והדירה 106.2 מ"ר.</td></tr>
              <tr><td><b>9.2 עד 9.4</b></td><td>מרפסת שמש 12 מ"ר, מחסן אחד, חניה רגילה אחת.</td><td>מרפסת: עומד, 12 מ"ר בתוכנית. מחסן וחניה: לא נבדקו.</td></tr>
              <tr><td><b>10.1, מיקום</b></td><td>דירות התמורה ימוקמו החל מהקומה הרביעית במגדלים, ומהשנייה בבניין הנמוך.</td><td className="hi">עומד, לפי הלשון. קומות 4 עד 6 מותרות.</td></tr>
              <tr><td><b>10.1, תמהיל</b></td><td>"החברה תפעל, ככל הניתן, לייצר תמהיל דירות כך שחלק מהדירות יפנה לעורף וחלק לחזית."</td><td>התחייבות מאמץ, לא תוצאה. קשה להוכיח הפרה.</td></tr>
              <tr><td><b>10.5 עד 10.8, בחירה</b></td><td>השמאי מחלק את הבעלים לקבוצות לפי שטח הזכאות. כל בעלים בוחר רק מתוך הטיפוס של הקבוצה שלו, לפי סדר הניקוד.</td><td className="lo">כאן הפער. ההסכם מניח בחירה, אבל קבוצה של דירה אחת מרוקנת אותה מתוכן.</td></tr>
              <tr><td><b>10.4</b></td><td>טבלת סדר הבחירה סופית, ואין זכות לערער עליה או על הפרמטרים השמאיים.</td><td>מגביל טענות נגד הניקוד. אינו חל על השיבוץ עצמו.</td></tr>
              <tr><td><b>סוף סעיף 3, איסור העדפה</b></td><td>היזם אינו רשאי להעדיף בעלים או לתת תמורה שאינה בהסכם, כולל שדרוגים ופיצוי, בלי אישור הנציגות מראש ובכתב או הסדר פשרה.</td><td className="lo">הסעיף החשוב ביותר, לשני הכיוונים. ראי סעיף 3 בדף.</td></tr>
              <tr><td><b>20.1, שדרוג</b></td><td>לפני תחילת השיווק, בעלים רשאי להחליף את דירת התמורה באחת מדירות היזם, בתשלום.</td><td>זה המסלול שהמכתב מבקש לקבל בלי תשלום עד קומה מסוימת.</td></tr>
            </tbody>
          </table></div>

          <h2>3. איפה יש בסיס, ואיפה אין</h2>
          <ol className="verdict">
            <li><b>אין הפרה מפורשת בשטח ובקומה.</b> ההסכם מתיר קומה 4, והשטח תואם. מי שמחפש סעיף שהופר בנקודות האלה לא ימצא.</li>
            <li><b>יש בסיס בעניין הבחירה.</b> מנגנון סעיף 10 בנוי על בחירה בתוך קבוצה. אם לארבע הוכתבה דירה אחת, ולמורחבות אחרות הוצעו כמה, זו החלה שונה של אותו מנגנון על בעלים מאותו סוג.</li>
            <li><b>סעיף איסור ההעדפה פועל לטובת הטענה.</b> אם בעלים אחרים קיבלו דירה מסוימת בהסכמה מיוחדת, כפי שהמכתב טוען, צריך לבדוק שהדבר אושר בכתב על ידי הנציגות או בהסדר. אם לא, זו העדפה שההסכם אוסר.</li>
            <li><b>אותו סעיף גם מגביל את הפתרון.</b> פיצוי לארבע מחייב אישור הנציגות מראש ובכתב, או הסדר פשרה. לכן המכתב צודק כשהוא מציע פשרה.</li>
            <li><b>הטענה על כיוונים חלשה בשמש וחזקה בסביבה.</b> הדירות מקבלות יותר שמש מהממוצע, אבל פונות לרחוב ולא לגינה.</li>
          </ol>
        </div>

        <div className="calc">
          <h2>4. כמה שווה התיקון שהמכתב מבקש</h2>
          <p>המכתב מבקש שדרוג בלי תשלום עד קומה 14 במגדל, או עד קומה 9 בבניין 101.</p>
          <Num id="c-v" label="שווי הדירה היום, בקומה הנוכחית" value={value} set={setValue} step={10000} unit='ש"ח' />
          <Num id="c-p" label="תוספת שווי לכל קומה" value={perFloor} set={setPerFloor} step={0.25} unit="%" />
          <Num id="c-t" label="הקומה המבוקשת" value={target} set={setTarget} unit="קומה" />
          <p className="res">{n1(target - floorMed)} קומות × {perFloor}% × {nis(value)} = <b>{nis(gain)} ש"ח</b> לדירה</p>
          <table className="mini rates">
            <thead><tr><th>תוספת לקומה</th><th>שווי התיקון לדירה</th><th>לארבע הדירות</th></tr></thead>
            <tbody>{[0.5, 0.75, 1, 1.5].map((p) => { const g = (target - floorMed) * (p / 100) * value; return <tr key={p} className={p === perFloor ? 'on' : 'row'} onClick={() => setPerFloor(p)}><td><b>{p}%</b></td><td>{nis(g)}</td><td>{nis(g * 4)}</td></tr> })}</tbody>
          </table>
          <p className="note"><b>הערכה:</b> התוספת לקומה היא הנחה. הנתון המדויק הוא מחירון היזם, שבו רשום ההפרש בין קומות. בעסקאות בשכונה לא נמצאה תוספת מדידה לקומה.</p>

          <h2>5. מה חסר כדי להכריע</h2>
          <ol className="verdict">
            <li><b>נספח ג', טבלת שטחי דירות הבעלים,</b> וטבלת השיבוץ הסופית. מהן רואים אם לארבע הוקצתה קבוצה של דירה אחת.</li>
            <li><b>טבלת הניקוד של השמאי.</b> המכתב טוען שלפי הניקוד הגיעה להן קומה 9 בבניין 101.</li>
            <li><b>פרוטוקול מפגש הבחירה,</b> לפי סעיף 10.9: מה הוצע לכל בעלים.</li>
            <li><b>אישורי הנציגות</b> לשיבוצים המיוחדים של בעלים אחרים, אם היו.</li>
            <li><b>מחירון היזם,</b> להפרש המחיר בין הקומות.</li>
          </ol>
        </div>
      </section>

      <section className="trust">
        <div className="fact"><h3>עובדה</h3>
          <p>לשון הסעיפים: מתוך ההסכם שבידך. קומות, טיפוסים ומספר הדירות בכל בניין: מתוכניות הבניינים ומטבלת הדירות המוצעות.</p></div>
        <div className="est"><h3>הערכה</h3>
          <p>הפרשנות של הסעיפים, המסקנה שיש יחס שונה לבעלים מאותה קבוצה, ושווי התיקון. כיווני הדירות ושעות השמש מחושבים במודל.</p></div>
        <div className="asm"><h3>מגבלה</h3>
          <p>זה אינו ייעוץ משפטי, ואני לא עורך דין. קראתי את גוף ההסכם בלי הנספחים. את העובדות שהמכתב מתאר על בעלים אחרים לא יכולתי לאמת. לפני פנייה ליזם כדאי להתייעץ עם עורך דין שמתמחה בהתחדשות עירונית.</p></div>
      </section>
    </div>
  )
}
