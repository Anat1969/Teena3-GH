import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type Building, type Pt, boundary, byId, context, facadesOf, geo, lots, myApt, oldBuildings, streets, towers, trees } from '../lib/site.ts'
import { sunAt } from '../lib/sun.ts'
import { groundSunHours } from '../lib/shade.ts'
import { aptSpot, heightMapFor } from '../lib/analysis.ts'
import { WINDS, useStore } from '../store.ts'
import rawFacades from '../../data/facades.json'

const INK = '#2E2E2B'
const APT = '#D7263D'
const USE: Record<number, string> = { 1250: '#E0B77A', 400: '#B98A5E', 670: '#9CCB7A', 820: '#D9D5CB', 830: '#C9C4B8' }

/** מטרים מקומיים (x מזרחה, y צפונה, z מעלה) לצירי הסצנה. */
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, z, -y)

function prism(pts: Pt[], h: number, base = 0): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: h, bevelEnabled: false })
  g.rotateX(-Math.PI / 2)
  if (base) g.translate(0, base, 0)
  return g
}
function flat(pts: Pt[], y: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([x, yy]) => new THREE.Vector2(x, yy))))
  g.rotateX(-Math.PI / 2)
  g.translate(0, y, 0)
  return g
}

// ---------- קרקע: תצלום לוויין ----------
const Z = 18
const toLocal = (lon: number, lat: number): Pt => {
  const dl = lon - geo.lon0, dp = lat - geo.lat0
  return [geo.a * dl + geo.b * dp, geo.c * dl + geo.d * dp]
}
const toGeo = (x: number, y: number) => {
  const det = geo.a * geo.d - geo.b * geo.c
  return { lon: geo.lon0 + (geo.d * x - geo.b * y) / det, lat: geo.lat0 + (-geo.c * x + geo.a * y) / det }
}
const tileX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** Z)
const tileY = (lat: number) => Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** Z)
const tileLon = (x: number) => (x / 2 ** Z) * 360 - 180
const tileLat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** Z))) * 180) / Math.PI

function Satellite({ half = 520 }: { half?: number }) {
  const tiles = useMemo(() => {
    const nw = toGeo(-half, half), se = toGeo(half, -half), out = []
    for (let x = tileX(nw.lon); x <= tileX(se.lon); x++)
      for (let y = tileY(nw.lat); y <= tileY(se.lat); y++) {
        const c = [toLocal(tileLon(x), tileLat(y)), toLocal(tileLon(x + 1), tileLat(y)), toLocal(tileLon(x), tileLat(y + 1)), toLocal(tileLon(x + 1), tileLat(y + 1))]
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(c.flatMap(([px, py]) => [px, 0, -py]), 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2))
        g.setIndex([0, 2, 1, 1, 2, 3])
        g.computeVertexNormals()
        out.push({ key: `${x}/${y}`, g, url: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${y}/${x}` })
      }
    return out
  }, [half])
  return <>{tiles.map((t) => <Tile key={t.key} g={t.g} url={t.url} />)}</>
}
function Tile({ g, url }: { g: THREE.BufferGeometry; url: string }) {
  const [map, setMap] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    let live = true
    new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      if (live) setMap(t)
    }, undefined, () => {})
    return () => { live = false }
  }, [url])
  if (!map) return null
  return <mesh geometry={g} receiveShadow><meshLambertMaterial map={map} /></mesh>
}

// ---------- חזיתות מההיתר ----------
type Side = 'right' | 'left' | 'top' | 'bottom'
const SIDES: Side[] = ['right', 'left', 'top', 'bottom']
const SIDE_N: Record<Side, [number, number]> = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] }
const facades = rawFacades as unknown as Record<string, { hmax: number; sides: Record<Side, { img: string; left: [number, number]; width: number }>; lots: Record<string, number[][]> }>
const texCache = new Map<string, THREE.Texture>()
function facadeTex(url: string) {
  if (!texCache.has(url)) { const x = new THREE.TextureLoader().load(url); x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; texCache.set(url, x) }
  return texCache.get(url)!
}
/** קירות הבניין עם החזיתות מההיתר. חזית היא היטל ישר, ולכן כל קיר מקבל את החזית שמולו, בהיטל ישר. */
function facadeGeometry(b: Building, top: number, foot: Pt[] = b.pts) {
  const f = facades[b.real!.plan], M = f.lots[b.lot!]
  const det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
  const sheet = ([x, y]: Pt): Pt => { const dx = x - M[2][0], dy = y - M[2][1]; return [(dx * M[1][1] - dy * M[1][0]) / det, (dy * M[0][0] - dx * M[0][1]) / det] }
  const mpp = Math.hypot(M[0][0], M[0][1])
  const sp = foot.map(sheet)
  const cx = (Math.min(...sp.map((p) => p[0])) + Math.max(...sp.map((p) => p[0]))) / 2, cy = (Math.min(...sp.map((p) => p[1])) + Math.max(...sp.map((p) => p[1]))) / 2
  const mid: Pt = [sp.reduce((s, p) => s + p[0], 0) / sp.length, sp.reduce((s, p) => s + p[1], 0) / sp.length]
  const pos: number[][] = [[], [], [], []], uv: number[][] = [[], [], [], []]
  for (let i = 0; i < sp.length; i++) {
    const j = (i + 1) % sp.length, e: Pt = [sp[j][0] - sp[i][0], sp[j][1] - sp[i][1]]
    let n: Pt = [e[1], -e[0]]
    const m: Pt = [(sp[i][0] + sp[j][0]) / 2 - mid[0], (sp[i][1] + sp[j][1]) / 2 - mid[1]]
    if (n[0] * m[0] + n[1] * m[1] < 0) n = [-n[0], -n[1]] // הנורמל פונה החוצה
    const k = SIDES.reduce((best, s, idx) => (n[0] * SIDE_N[s][0] + n[1] * SIDE_N[s][1] > n[0] * SIDE_N[SIDES[best]][0] + n[1] * SIDE_N[SIDES[best]][1] ? idx : best), 0)
    const side = f.sides[SIDES[k]]
    const u = (p: Pt) => 0.5 - (((p[0] - cx) * side.left[0] + (p[1] - cy) * side.left[1]) * mpp) / side.width
    const a = foot[i], c = foot[j], v1 = top / f.hmax
    pos[k].push(a[0], 0, -a[1], c[0], 0, -c[1], c[0], top, -c[1], a[0], 0, -a[1], c[0], top, -c[1], a[0], top, -a[1])
    uv[k].push(u(sp[i]), 0, u(sp[j]), 0, u(sp[j]), v1, u(sp[i]), 0, u(sp[j]), v1, u(sp[i]), v1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flat(), 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv.flat(), 2))
  let start = 0
  pos.forEach((p, k) => { g.addGroup(start, p.length / 3, k); start += p.length / 3 })
  g.computeVertexNormals()
  return { g, mats: SIDES.map((s) => new THREE.MeshLambertMaterial({ map: facadeTex(f.sides[s].img), side: THREE.DoubleSide })) }
}

// ---------- פרטי חזית בתלת־ממד ----------
const GLASS = new THREE.MeshPhongMaterial({ color: '#3F556E', specular: '#BFD4EA', shininess: 90, side: THREE.DoubleSide })
const RAIL = new THREE.MeshPhongMaterial({ color: '#BFD8E6', transparent: true, opacity: 0.38, specular: '#FFFFFF', shininess: 100, side: THREE.DoubleSide, depthWrite: false })
const SLAB = new THREE.MeshLambertMaterial({ color: '#F4F2EC' })
/** גוף הבניין עם החזית, מרפסות בולטות עם מעקה זכוכית, ופתחי זכוכית בכל קומה. הכול מתוכניות הקומות. */
function FacadeDetail({ b, top }: { b: Building; top: number }) {
  const [file, setFile] = useState<FloorFile | null>(null)
  useEffect(() => { let live = true; loadFloors(b.real!.plan).then((f) => live && setFile(f)); return () => { live = false } }, [b])
  const built = useMemo(() => {
    if (!file) return null
    const M = file.lots[b.lot!], mpp = Math.hypot(M[0][0], M[0][1])
    const to = ([x, y]: Pt): Pt => [x * M[0][0] + y * M[1][0] + M[2][0], x * M[0][1] + y * M[1][1] + M[2][1]]
    const pages = Object.values(file.pages)
    const typical = pages.reduce((m, p) => (p.floors.length > m.floors.length ? p : m))
    const foot = typical.body.map(to)
    const mid: Pt = [foot.reduce((s, p) => s + p[0], 0) / foot.length, foot.reduce((s, p) => s + p[1], 0) / foot.length]
    const skin = facadeGeometry(b, top, foot)
    const glass: number[] = [], slabs: THREE.Matrix4[] = [], rails: number[] = []
    const quad = (arr: number[], a: Pt, c: Pt, y0: number, y1: number) => arr.push(a[0], y0, -a[1], c[0], y0, -c[1], c[0], y1, -c[1], a[0], y0, -a[1], c[0], y1, -c[1], a[0], y1, -a[1])
    const rotY = Math.atan2(M[0][1], M[0][0])
    for (const pg of pages) for (const fl of pg.floors) {
      const y = b.real!.levels[String(fl)]
      if (y === undefined || y + 1 > top) continue
      for (const o of pg.openings) {
        let a = to([o[0], o[1]]), c = to([o[2], o[3]])
        const len = Math.hypot(c[0] - a[0], c[1] - a[1])
        if (len < 0.6) continue
        // הזכוכית יושבת מעט לפני הקיר, כלפי חוץ
        let n: Pt = [(c[1] - a[1]) / len, -(c[0] - a[0]) / len]
        if (n[0] * ((a[0] + c[0]) / 2 - mid[0]) + n[1] * ((a[1] + c[1]) / 2 - mid[1]) < 0) n = [-n[0], -n[1]]
        a = [a[0] + n[0] * 0.08, a[1] + n[1] * 0.08]; c = [c[0] + n[0] * 0.08, c[1] + n[1] * 0.08]
        const door = len > 2.2 // פתח רחב הוא ויטרינה אל מרפסת, פתח צר הוא חלון עם אדן
        quad(glass, a, c, y + (door ? 0.1 : 1.0), y + 2.35)
      }
      for (const r of pg.balconies) {
        const c0 = to([(r[0] + r[2]) / 2, (r[1] + r[3]) / 2]), w = (r[2] - r[0]) * mpp, d = (r[3] - r[1]) * mpp
        slabs.push(new THREE.Matrix4().compose(new THREE.Vector3(c0[0], y - 0.1, -c0[1]), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, 0)), new THREE.Vector3(w, 0.2, d)))
        const cs: Pt[] = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map((q) => to(q as Pt))
        cs.forEach((q, i) => quad(rails, q, cs[(i + 1) % 4], y, y + 1.05))
      }
    }
    const mk = (arr: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g }
    const roof = new THREE.ShapeGeometry(new THREE.Shape(foot.map(([x, y]) => new THREE.Vector2(x, y)))); roof.rotateX(-Math.PI / 2); roof.translate(0, top, 0)
    return { skin, glass: mk(glass), rails: mk(rails), slabs, roof }
  }, [file, b, top])
  const slabRef = useRef<THREE.InstancedMesh>(null)
  useEffect(() => { if (built && slabRef.current) { built.slabs.forEach((m, i) => slabRef.current!.setMatrixAt(i, m)); slabRef.current.instanceMatrix.needsUpdate = true } }, [built])
  if (!built) return null
  return (
    <group>
      <mesh geometry={built.skin.g} material={built.skin.mats} receiveShadow />
      <mesh geometry={built.roof} receiveShadow><meshLambertMaterial color="#E9E6DD" /></mesh>
      <mesh geometry={built.glass} material={GLASS} />
      <instancedMesh key={built.slabs.length} ref={slabRef} args={[undefined, undefined, built.slabs.length]} material={SLAB} castShadow receiveShadow><boxGeometry args={[1, 1, 1]} /></instancedMesh>
      <mesh geometry={built.rails} material={RAIL} />
    </group>
  )
}

// ---------- מודל BIM: אלמנטים אמיתיים לכל קומה ----------
const M_CONC = new THREE.MeshLambertMaterial({ color: '#E9E6DF' })
const M_BLOCK = new THREE.MeshLambertMaterial({ color: '#F5F3EE' })
const M_INFILL = new THREE.MeshLambertMaterial({ color: '#D9D5CC' })
const M_SLAB = new THREE.MeshLambertMaterial({ color: '#C9C5BB' })
const SLAB_T = 0.2
/** אינסטנסים של גיאומטריה אחת בכמה קומות. scaleY מותח את הקירות לגובה הקומה. */
function Storeys({ g, mat, at, cast }: { g: THREE.BufferGeometry; mat: THREE.Material; at: { y: number; s: number }[]; cast?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = new THREE.Matrix4()
    at.forEach((a, i) => { m.compose(new THREE.Vector3(0, a.y, 0), new THREE.Quaternion(), new THREE.Vector3(1, a.s, 1)); ref.current!.setMatrixAt(i, m) })
    ref.current!.instanceMatrix.needsUpdate = true
  }, [at])
  if (!at.length) return null
  return <instancedMesh key={at.length} ref={ref} args={[g, mat, at.length]} castShadow={cast} receiveShadow frustumCulled={false} />
}
/** הבניין כאוסף אלמנטים: בכל קומה תקרה, קירות בטון ובלוק, מילוי מתחת ומעל לפתחים, זיגוג ומעקות. הכול מתוכנית אותה קומה. */
function BimModel({ b, top }: { b: Building; top: number }) {
  const [file, setFile] = useState<FloorFile | null>(null)
  useEffect(() => { let live = true; loadFloors(b.real!.plan).then((f) => live && setFile(f)); return () => { live = false } }, [b])
  const parts = useMemo(() => {
    if (!file) return null
    const M = file.lots[b.lot!]
    const to = ([x, y]: Pt): Pt => [x * M[0][0] + y * M[1][0] + M[2][0], x * M[0][1] + y * M[1][1] + M[2][1]]
    const ex = (shapes: THREE.Shape[], depth: number) => { const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g }
    const boxes = (segs: { a: Pt; c: Pt; y0: number; y1: number; t: number }[]) => {
      // קופסה דקה לאורך קטע: קיר מילוי או זיגוג
      const pos: number[] = []
      for (const s of segs) {
        const len = Math.hypot(s.c[0] - s.a[0], s.c[1] - s.a[1]), nx = ((s.c[1] - s.a[1]) / len) * s.t / 2, ny = (-(s.c[0] - s.a[0]) / len) * s.t / 2
        const P = [[s.a[0] + nx, s.a[1] + ny], [s.c[0] + nx, s.c[1] + ny], [s.c[0] - nx, s.c[1] - ny], [s.a[0] - nx, s.a[1] - ny]]
        const v = (i: number, y: number) => [P[i][0], y, -P[i][1]]
        const q = (i: number, j: number, k: number, l: number, ya: number, yb: number, yc: number, yd: number) => pos.push(...v(i, ya), ...v(j, yb), ...v(k, yc), ...v(i, ya), ...v(k, yc), ...v(l, yd))
        for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; pos.push(...v(i, s.y0), ...v(j, s.y0), ...v(j, s.y1), ...v(i, s.y0), ...v(j, s.y1), ...v(i, s.y1)) }
        q(0, 1, 2, 3, s.y1, s.y1, s.y1, s.y1); q(3, 2, 1, 0, s.y0, s.y0, s.y0, s.y0)
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g
    }
    return Object.values(file.pages).map((pg) => {
      const shape = (w: Poly) => shapeOf(w.pts.map(to), w.holes.map((h) => h.map(to)))
      const mid = pg.body.map(to).reduce((s, q, _, arr) => [s[0] + q[0] / arr.length, s[1] + q[1] / arr.length] as Pt, [0, 0] as Pt)
      const op = pg.openings.map((o) => ({ a: to([o[0], o[1]]), c: to([o[2], o[3]]) })).filter((o) => Math.hypot(o.c[0] - o.a[0], o.c[1] - o.a[1]) > 0.6)
      const wide = (o: { a: Pt; c: Pt }) => Math.hypot(o.c[0] - o.a[0], o.c[1] - o.a[1]) > 2.2
      // בגובה יחסי 0 עד 1 מגובה הקיר: אדן עד 0.34 בחלון, זיגוג עד 0.8, ומעליו משקוף
      const infill = boxes(op.flatMap((o) => [...(wide(o) ? [] : [{ ...o, y0: 0, y1: 0.34, t: 0.2 }]), { ...o, y0: 0.8, y1: 1, t: 0.2 }]))
      const glass = boxes(op.map((o) => ({ ...o, y0: wide(o) ? 0.02 : 0.34, y1: 0.8, t: 0.05 })))
      const slabShapes = [shapeOf(pg.floor.map(to)), ...pg.balconies.map((r) => shapeOf(([[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] as Pt[]).map(to)))]
      const rails = boxes(pg.balconies.flatMap((r) => {
        const cs = ([[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]] as Pt[]).map(to)
        // מעקה רק בצלעות שפונות החוצה מגוף הבניין
        return cs.map((q, i) => ({ a: q, c: cs[(i + 1) % 4] })).filter((s) => { const mx = (s.a[0] + s.c[0]) / 2, my = (s.a[1] + s.c[1]) / 2, cx = cs.reduce((u, q) => u + q[0], 0) / 4, cy = cs.reduce((u, q) => u + q[1], 0) / 4; return (mx - cx) * (cx - mid[0]) + (my - cy) * (cy - mid[1]) > 0 }).map((s) => ({ ...s, y0: 0, y1: 1.05, t: 0.04 }))
      }))
      const slab = ex(slabShapes, SLAB_T); slab.translate(0, -SLAB_T, 0)
      const lv = pg.floors.map((f) => file.levels[String(f)]).filter((l) => l && l[0] + 1 <= top)
      return { key: pg.floors.join(','), concrete: ex(pg.walls.concrete.map(shape), 1), block: ex(pg.walls.block.map(shape), 1), infill, glass, rails, slab,
        walls: lv.map((l) => ({ y: l[0], s: l[1] - SLAB_T })), flat: lv.map((l) => ({ y: l[0], s: 1 })) }
    })
  }, [file, b, top])
  const roof = useMemo(() => {
    if (!file || top < file.roof) return null
    const M = file.lots[b.lot!], to = ([x, y]: Pt): Pt => [x * M[0][0] + y * M[1][0] + M[2][0], x * M[0][1] + y * M[1][1] + M[2][1]]
    const typical = Object.values(file.pages).reduce((m, p2) => (p2.floors.length > m.floors.length ? p2 : m))
    const outer = typical.floor.map(to), cx = outer.reduce((s, q) => s + q[0], 0) / outer.length, cy = outer.reduce((s, q) => s + q[1], 0) / outer.length
    const inner = outer.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy); return [x - ((x - cx) / d) * 0.25, y - ((y - cy) / d) * 0.25] as Pt })
    const slab = new THREE.ExtrudeGeometry(shapeOf(outer), { depth: SLAB_T, bevelEnabled: false }); slab.rotateX(-Math.PI / 2); slab.translate(0, file.roof - SLAB_T, 0)
    const par = new THREE.ExtrudeGeometry(shapeOf(outer, [inner]), { depth: file.parapet - file.roof, bevelEnabled: false }); par.rotateX(-Math.PI / 2); par.translate(0, file.roof, 0)
    return { slab, par }
  }, [file, b, top])
  if (!parts) return null
  return (
    <group>
      {parts.map((p2) => (
        <group key={p2.key}>
          <Storeys g={p2.slab} mat={M_SLAB} at={p2.flat} />
          <Storeys g={p2.concrete} mat={M_CONC} at={p2.walls} />
          <Storeys g={p2.block} mat={M_BLOCK} at={p2.walls} />
          <Storeys g={p2.infill} mat={M_INFILL} at={p2.walls} />
          <Storeys g={p2.glass} mat={GLASS} at={p2.walls} />
          <Storeys g={p2.rails} mat={RAIL} at={p2.flat} />
        </group>
      ))}
      {roof && <mesh geometry={roof.slab} material={M_SLAB} receiveShadow />}
      {roof && <mesh geometry={roof.par} material={M_CONC} receiveShadow />}
    </group>
  )
}

// ---------- בניינים ----------
function Context() {
  const g = useMemo(() => mergeGeometries(context.map((b) => prism(b.pts, b.h)))!, [])
  return <mesh geometry={g} castShadow receiveShadow><meshLambertMaterial color="#F1EEE7" /></mesh>
}

function Block({ b }: { b: Building }) {
  const mode = useStore((s) => s.mode), tab = useStore((s) => s.tab), selected = useStore((s) => s.selected), apt = useStore((s) => s.apt[s.mode])
  const set = useStore((s) => s.set), setApt = useStore((s) => s.setApt)
  const [hover, setHover] = useState(false)
  const plan = useStore((s) => s.plan), showFacades = useStore((s) => s.facades), detail = useStore((s) => s.detail), bim = useStore((s) => s.bim)
  const cut = plan && tab === 'home' && mode === 'future' && !!b.real && apt?.id === b.id
  const top = cut ? b.real!.levels[String(apt!.floor)] : b.h
  const g = useMemo(() => prism(b.pts, top), [b, top])
  const useBim = !!b.real && bim
  const skin = useMemo(() => (b.real && !useBim && showFacades && !detail ? facadeGeometry(b, top) : null), [b, top, showFacades, detail, useBim])
  const deep = !!b.real && !useBim && showFacades && detail
  const roof = useMemo(() => (skin ? flat(b.pts, top) : null), [b, top, skin])
  const lines = useMemo(() => {
    const pos: number[] = []
    const ys = b.real ? [...Object.values(b.real.levels), b.real.roof, b.h].filter((y) => y <= top) : Array.from({ length: b.floors }, (_, i) => ((i + 1) * b.h) / b.floors)
    for (const y of ys) {
      b.pts.forEach((p, i) => { const q = b.pts[(i + 1) % b.pts.length]; pos.push(p[0], y, -p[1], q[0], y, -q[1]) })
    }
    b.pts.forEach((p) => pos.push(p[0], 0, -p[1], p[0], top, -p[1]))
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return lg
  }, [b, top])
  // הקומות שמעל החתך: קווי מתאר חיוורים, כדי שיהיה ברור שהבניין ממשיך למעלה
  const ghost = useMemo(() => {
    const pos: number[] = []
    if (b.real) for (const y of [...Object.values(b.real.levels), b.real.roof, b.h].filter((v) => v > top)) b.pts.forEach((p, i) => { const q = b.pts[(i + 1) % b.pts.length]; pos.push(p[0], y, -p[1], q[0], y, -q[1]) })
    b.pts.forEach((p, i) => { if (i % 6 === 0) pos.push(p[0], top, -p[1], p[0], b.h, -p[1]) })
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return lg
  }, [b, top])
  const mine = tab === 'home' ? apt?.id === b.id : selected === b.id
  const color = cut ? '#F3F1EA' : mine ? '#FFE9A8' : hover ? '#FFF6DA' : b.kind === 'tower' ? '#FBFAF6' : '#E9D9BF'
  void mode
  return (
    <group>
      <mesh geometry={g} castShadow receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
        onClick={(e) => {
          e.stopPropagation()
          if (tab === 'home') { if (b.h > 8 && apt?.id !== b.id) { const fl = b.real ? b.real.floors[Math.floor(b.real.floors.length / 2)] : null; setApt({ id: b.id, floor: fl ? fl.floor : Math.ceil(b.floors / 2), facade: facadesOf(b)[0].key, unit: fl?.apts[0]?.key }) } }
          else set({ selected: b.id })
        }}>
        <meshLambertMaterial color={color} transparent={!!skin || deep || useBim} opacity={skin || deep || useBim ? 0 : 1} depthWrite={!(skin || deep || useBim)} />
      </mesh>
      {useBim && <BimModel b={b} top={top} />}
      {deep && <FacadeDetail b={b} top={top} />}
      {skin && <mesh geometry={skin.g} material={skin.mats} receiveShadow />}
      {skin && roof && <mesh geometry={roof} receiveShadow><meshLambertMaterial color={mine && !cut ? '#FFE9A8' : '#E9E6DD'} /></mesh>}
      {!skin && !deep && !useBim && <lineSegments geometry={lines}><lineBasicMaterial color={INK} transparent opacity={b.kind === 'tower' ? 0.28 : 0.4} /></lineSegments>}
      {cut && <lineSegments geometry={ghost}><lineBasicMaterial color={INK} transparent opacity={0.1} /></lineSegments>}
      {b.kind === 'tower' && !cut && (
        <Html position={[b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length, b.h + 6, -b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag"><b>{b.lot}</b> {Math.round(b.h)} מ'</div>
        </Html>
      )}
    </group>
  )
}

function Lots() {
  const meshes = useMemo(() => lots.map((l) => ({ key: l.num, g: flat(l.rings[0], 0.2), color: USE[l.code] })), [])
  return <>{meshes.map((m) => <mesh key={m.key} geometry={m.g} receiveShadow><meshLambertMaterial color={m.color} transparent opacity={0.78} depthWrite={false} /></mesh>)}</>
}

function BlueLine() {
  const g = useMemo(() => new THREE.BufferGeometry().setFromPoints([...boundary, boundary[0]].map(([x, y]) => v(x, y, 0.6))), [])
  return <primitive object={useMemo(() => new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#1F5FBF' })), [g])} />
}

function Trees() {
  const mode = useStore((s) => s.mode)
  const list = useMemo(() => trees.filter((t) => mode === 'existing' || t.kind !== 'uproot'), [mode])
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const m = new THREE.Matrix4()
    list.forEach((t, i) => {
      const s = 2.6 + ((i * 37) % 10) / 6
      m.compose(v(t.at[0], t.at[1], s + 1.5), new THREE.Quaternion(), new THREE.Vector3(s, s * 1.15, s))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
  }, [list])
  return (
    <instancedMesh key={list.length} ref={ref} args={[undefined, undefined, list.length]} castShadow receiveShadow>
      <icosahedronGeometry args={[1, 1]} />
      <meshLambertMaterial color="#5E8C4A" />
    </instancedMesh>
  )
}

// ---------- שמש ----------
function SunRig() {
  const day = useStore((s) => s.day), hour = useStore((s) => s.hour)
  const light = useRef<THREE.DirectionalLight>(null)
  const sun = sunAt(day, hour)
  const up = sun.altitude > 0
  const a = (Math.max(sun.altitude, 0.5) * Math.PI) / 180
  const dir = new THREE.Vector3(Math.cos(a) * sun.ex, Math.sin(a), -Math.cos(a) * sun.ey)
  const path = useMemo(() => {
    const pts: THREE.Vector3[] = []
    for (let h = 4; h <= 20.5; h += 0.25) {
      const s = sunAt(day, h)
      if (s.altitude < 0) continue
      const el = (s.altitude * Math.PI) / 180
      pts.push(new THREE.Vector3(Math.cos(el) * s.ex, Math.sin(el), -Math.cos(el) * s.ey).multiplyScalar(430))
    }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: '#E0A100', dashSize: 8, gapSize: 6 })).computeLineDistances()
  }, [day])
  useEffect(() => {
    const c = light.current!.shadow.camera
    Object.assign(c, { left: -430, right: 430, top: 430, bottom: -430, near: 50, far: 1700 })
    c.updateProjectionMatrix()
  }, [])
  const warm = Math.min(1, Math.max(0, sun.altitude / 25))
  return (
    <>
      <hemisphereLight args={['#DDE8F5', '#8A8578', up ? 0.7 : 0.35]} />
      <directionalLight ref={light} position={dir.clone().multiplyScalar(850)} intensity={up ? 1.7 + warm * 1.6 : 0} color={new THREE.Color().lerpColors(new THREE.Color('#FFC27A'), new THREE.Color('#FFFFFF'), warm)}
        castShadow shadow-mapSize={[4096, 4096]} shadow-bias={-0.0004} shadow-normalBias={0.6} />
      <primitive object={path} />
      {up && <mesh position={dir.clone().multiplyScalar(430)}><sphereGeometry args={[11, 24, 24]} /><meshBasicMaterial color="#FFC400" /></mesh>}
    </>
  )
}

function Compass() {
  const marks: [string, number, number][] = [['צפון', 0, 1], ['מזרח', 1, 0], ['דרום', 0, -1], ['מערב', -1, 0]]
  const ring = useMemo(() => {
    const pts = Array.from({ length: 129 }, (_, i) => v(Math.cos((i / 128) * 2 * Math.PI) * 330, Math.sin((i / 128) * 2 * Math.PI) * 330, 0.5))
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.55 }))
  }, [])
  return (
    <>
      <primitive object={ring} />
      {marks.map(([t, x, y]) => (
        <Html key={t} position={v(x * 350, y * 350, 1)} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}><div className={`dir${t === 'צפון' ? ' n' : ''}`}>{t}</div></Html>
      ))}
    </>
  )
}

function Streets() {
  return <>{streets.map((s) => <Html key={s.name} position={v(s.at[0], s.at[1], 1)} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}><div className="street">{s.name}</div></Html>)}</>
}

// ---------- מפת שעות שמש ----------
const RAMP: [number, [number, number, number]][] = [[0, [38, 52, 96]], [0.35, [92, 110, 150]], [0.7, [226, 214, 170]], [1, [250, 196, 40]]]
function ramp(t: number): [number, number, number] {
  for (let i = 1; i < RAMP.length; i++)
    if (t <= RAMP[i][0]) {
      const [t0, c0] = RAMP[i - 1], [t1, c1] = RAMP[i], k = (t - t0) / (t1 - t0)
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k]
    }
  return RAMP[RAMP.length - 1][1]
}
function Heat() {
  const mode = useStore((s) => s.mode), day = useStore((s) => s.day)
  const [tex, setTex] = useState<{ t: THREE.CanvasTexture; half: number } | null>(null)
  useEffect(() => {
    setTex(null)
    const id = setTimeout(() => {
      const r = groundSunHours(heightMapFor(mode), day)
      const c = document.createElement('canvas')
      c.width = c.height = r.n
      const ctx = c.getContext('2d')!, img = ctx.createImageData(r.n, r.n)
      for (let j = 0; j < r.n; j++)
        for (let i = 0; i < r.n; i++) {
          const hrs = r.hours[j * r.n + i], k = ((r.n - 1 - j) * r.n + i) * 4
          if (hrs < 0) continue
          const [R, G, B] = ramp(hrs / r.max)
          img.data[k] = R; img.data[k + 1] = G; img.data[k + 2] = B; img.data[k + 3] = 205
        }
      ctx.putImageData(img, 0, 0)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      setTex({ t, half: r.half })
    }, 30)
    return () => clearTimeout(id)
  }, [mode, day])
  if (!tex) return <Html center position={[0, 60, 0]}><div className="tag busy">מחשב שעות שמש</div></Html>
  return <mesh rotation-x={-Math.PI / 2} position-y={0.35}><planeGeometry args={[tex.half * 2, tex.half * 2]} /><meshBasicMaterial map={tex.t} transparent depthWrite={false} /></mesh>
}

// ---------- רוח ----------
function Wind() {
  const wind = useStore((s) => s.wind)
  const ref = useRef<THREE.InstancedMesh>(null)
  const seeds = useMemo(() => Array.from({ length: 120 }, (_, i) => ({ a: ((i * 97) % 700) - 350, b: ((i * 211) % 700) - 350, z: 12 + ((i * 53) % 90), sp: 18 + ((i * 31) % 14) })), [])
  const from = (WINDS[wind].from * Math.PI) / 180
  const dx = -Math.sin(from), dy = -Math.cos(from) // הכיוון שאליו הרוח נושבת
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v(dx, dy).normalize()), [dx, dy])
  useFrame(({ clock }) => {
    const m = new THREE.Matrix4(), t = clock.elapsedTime
    seeds.forEach((s, i) => {
      const along = ((s.a + t * s.sp + 350) % 700) - 350
      m.compose(v(dx * along - dy * s.b, dy * along + dx * s.b, s.z), q, new THREE.Vector3(1, 1, 1))
      ref.current!.setMatrixAt(i, m)
    })
    ref.current!.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, seeds.length]}>
      <coneGeometry args={[2.4, 26, 6]} />
      <meshBasicMaterial color="#2F6FA8" transparent opacity={0.7} />
    </instancedMesh>
  )
}

// ---------- הדירה ----------
function AptMarker() {
  const apt = useStore((s) => s.apt[s.mode])
  const b = byId(apt?.id ?? null)
  const spot = aptSpot(apt, b)
  if (!apt || !b || !spot) return null
  const f = spot.face, z = spot.z, fh = b.real ? 3.15 : b.h / b.floors
  const rotY = Math.atan2(f.nx, -f.ny) + Math.PI
  return (
    <group position={v(f.at[0] + f.nx * 0.4, f.at[1] + f.ny * 0.4, z)} rotation-y={rotY}>
      <mesh><boxGeometry args={[Math.min(8, Math.max(4, f.length * 0.4)), fh * 0.9, 0.9]} /><meshBasicMaterial color={APT} /></mesh>
      <Html position={[0, fh, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}><div className="tag mine">הדירה שלי</div></Html>
    </group>
  )
}

// ---------- חתך בקומה ----------
type Poly = { pts: Pt[]; holes: Pt[][] }
interface FloorPage { body: Pt[]; balconies: number[][]; openings: number[][]; floors: number[]; bbox: [number, number, number, number]; floor: Pt[]; walls: { concrete: Poly[]; block: Poly[] }; core: { name: string; at: Pt }[] }
interface FloorFile { levels: Record<string, [number, number]>; roof: number; parapet: number; pages: Record<string, FloorPage>; lots: Record<string, number[][]> }
const floorCache = new Map<string, Promise<FloorFile>>()
const loadFloors = (plan: string) => {
  if (!floorCache.has(plan)) floorCache.set(plan, fetch(`/floors/${plan}.json`).then((r) => r.json()))
  return floorCache.get(plan)!
}
function shapeOf(pts: Pt[], holes: Pt[][] = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  holes.forEach((h) => s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y)))))
  return s
}
const CUT_H = 1.25 // גובה החתך מעל הרצפה, כמקובל בתוכנית
const CORE_NAME: Record<string, string> = { מבואה: 'מבואה קומתית', מדרגות: 'חדר מדרגות', מעלית: 'מעליות' }

/** הקומה שנבחרה, בתוך הבניין החתוך: רצפה עם שרטוט התוכנית, קירות חתוכים, גרעין ודירות. */
function FloorCut({ b, floor, unitKey }: { b: Building; floor: number; unitKey?: string }) {
  const [file, setFile] = useState<FloorFile | null>(null)
  const [tex, setTex] = useState<THREE.Texture | null>(null)
  useEffect(() => { let live = true; loadFloors(b.real!.plan).then((f) => live && setFile(f)); return () => { live = false } }, [b])
  const entry = file ? Object.entries(file.pages).find(([, p]) => p.floors.includes(floor)) : undefined
  const pg = entry?.[0], page = entry?.[1], M = file?.lots[b.lot!]
  useEffect(() => {
    if (!pg) return
    let live = true
    setTex(null)
    new THREE.TextureLoader().load(`/floors/${b.real!.plan}-${pg}.jpg`, (x) => { x.colorSpace = THREE.SRGBColorSpace; x.anisotropy = 8; if (live) setTex(x) })
    return () => { live = false }
  }, [b, pg])
  const built = useMemo(() => {
    if (!page || !M) return null
    const to = ([x, y]: Pt): Pt => [x * M[0][0] + y * M[1][0] + M[2][0], x * M[0][1] + y * M[1][1] + M[2][1]]
    const ex = (ps: Poly[]) => {
      const g = new THREE.ExtrudeGeometry(ps.map((w) => shapeOf(w.pts.map(to), w.holes.map((h) => h.map(to)))), { depth: CUT_H, bevelEnabled: false })
      g.rotateX(-Math.PI / 2)
      return g
    }
    // הרצפה: צורת הקומה במתחם, והשרטוט מוצמד אליה לפי מיקום כל נקודה בגיליון
    const [x0, y0, x1, y1] = page.bbox
    const sheet = page.floor, site = sheet.map(to)
    const fg = new THREE.ShapeGeometry(shapeOf(site))
    const pos = fg.getAttribute('position'), uv = fg.getAttribute('uv')
    const det = M[0][0] * M[1][1] - M[0][1] * M[1][0]
    for (let i = 0; i < pos.count; i++) {
      const dx = pos.getX(i) - M[2][0], dy = pos.getY(i) - M[2][1]
      const sx = (dx * M[1][1] - dy * M[1][0]) / det, sy = (dy * M[0][0] - dx * M[0][1]) / det
      uv.setXY(i, (sx - x0) / (x1 - x0), 1 - (sy - y0) / (y1 - y0))
    }
    fg.rotateX(-Math.PI / 2)
    return { concrete: ex(page.walls.concrete), block: ex(page.walls.block), floor: fg, core: page.core.filter((c) => CORE_NAME[c.name]).map((c) => ({ name: CORE_NAME[c.name], at: to(c.at) })) }
  }, [page, M])
  const mats = useMemo(() => ({
    concrete: [new THREE.MeshLambertMaterial({ color: '#2E2E2B' }), new THREE.MeshLambertMaterial({ color: '#CFCBC1' })],
    block: [new THREE.MeshLambertMaterial({ color: '#77746C' }), new THREE.MeshLambertMaterial({ color: '#ECE9E1' })],
  }), [])
  const mine = b.lot === myApt.lot && floor === myApt.floor && unitKey === myApt.type
  const tint = useMemo(() => { const g = new THREE.ShapeGeometry(shapeOf(myApt.outline)); g.rotateX(-Math.PI / 2); return g }, [])
  const edge = useMemo(() => new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(myApt.outline.map(([x, y]) => new THREE.Vector3(x, CUT_H + 0.05, -y))), new THREE.LineBasicMaterial({ color: APT })), [])
  if (!built) return <Html center position={[b.pts[0][0], b.real!.levels[String(floor)] + 3, -b.pts[0][1]]}><div className="tag busy">טוען את תוכנית הקומה</div></Html>
  const units = b.real!.floors.find((f) => f.floor === floor)?.apts ?? []
  return (
    <group position-y={b.real!.levels[String(floor)]}>
      <mesh geometry={built.floor} position-y={0.02} receiveShadow><meshLambertMaterial key={tex ? tex.uuid : "none"} color="#FFFFFF" map={tex} /></mesh>
      <mesh geometry={built.concrete} material={mats.concrete} castShadow receiveShadow />
      <mesh geometry={built.block} material={mats.block} castShadow receiveShadow />
      {mine && <mesh geometry={tint} position-y={0.06}><meshBasicMaterial color="#FFD23F" transparent opacity={0.3} depthWrite={false} /></mesh>}
      {mine && <primitive object={edge} />}
      {built.core.map((c, i) => <Html key={i} position={[c.at[0], CUT_H + 0.4, -c.at[1]]} center zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}><div className="room core">{c.name}</div></Html>)}
      {units.map((u) => {
        const sel = u.key === unitKey
        if (sel && mine) return null
        return <Html key={u.key} position={[u.at[0], CUT_H + 0.4, -u.at[1]]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}><div className={`room${sel ? ' sel' : ''}`}><b>{u.key}</b>{sel ? 'הדירה שנבחרה' : u.area ? `${u.area} מ"ר` : ''}</div></Html>
      })}
      {mine && myApt.rooms.map((r) => <Html key={r.name} position={[r.at[0], CUT_H + 0.4, -r.at[1]]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}><div className="room sel"><b>{r.name}</b>{r.area} מ"ר</div></Html>)}
    </group>
  )
}

// ---------- מצלמה ----------
function Rig() {
  const cam = useStore((s) => s.cam)
  const { camera } = useThree()
  const ctl = useRef<any>(null)
  useEffect(() => {
    const s = useStore.getState(), apt = s.apt[s.mode], b = byId(apt?.id ?? null)
    if (cam.view === 'window' && apt && b) {
      const spot = aptSpot(apt, b)!, f = spot.face, z = spot.z
      camera.position.copy(v(f.at[0] + f.nx * 3, f.at[1] + f.ny * 3, z + 0.4))
      ctl.current.target.copy(v(f.at[0] + f.nx * 160, f.at[1] + f.ny * 160, Math.max(2, z - 25)))
    } else if (cam.view === 'plan' && apt && b) {
      const spot = aptSpot(apt, b)!, at = spot.unit?.at ?? spot.face.at
      const cx = b.pts.reduce((s2, p) => s2 + p[0], 0) / b.pts.length, cy = b.pts.reduce((s2, p) => s2 + p[1], 0) / b.pts.length
      // מבט מלמעלה ומעט מדרום, אל נקודה שבין מרכז הקומה לדירה: רואים את הדירה ואת הדרך אליה מהגרעין
      const tx = (cx + at[0] * 2) / 3, ty = (cy + at[1] * 2) / 3
      camera.position.copy(v(tx - 4, ty - 24, spot.z + 58))
      ctl.current.target.copy(v(tx, ty, spot.z - 1.5))
    } else if (cam.view === 'top') {
      camera.position.set(0, 720, 0.01)
      ctl.current.target.set(0, 0, 0)
    } else {
      camera.position.set(-250, 240, 330)
      ctl.current.target.set(0, 25, -20)
    }
    ctl.current.update()
  }, [cam, camera])
  return <OrbitControls ref={ctl} makeDefault maxPolarAngle={Math.PI / 2 - 0.02} minDistance={8} maxDistance={1400} />
}

export default function Scene() {
  const mode = useStore((s) => s.mode), tab = useStore((s) => s.tab)
  const plan = useStore((s) => s.plan), apt = useStore((s) => s.apt[s.mode])
  const aptB = byId(apt?.id ?? null), cutOn = tab === 'home' && plan && mode === 'future' && !!aptB?.real && !!apt
  const sat = useStore((s) => s.sat), showLots = useStore((s) => s.lots), showTrees = useStore((s) => s.trees), heat = useStore((s) => s.heat)
  const set = useStore((s) => s.set)
  return (
    <Canvas shadows={{ type: THREE.PCFSoftShadowMap }} camera={{ position: [-250, 240, 330], fov: 38, near: 2, far: 4000 }} dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }}
      onPointerMissed={() => tab !== 'home' && set({ selected: null })}>
      <color attach="background" args={['#E9EEF3']} />
      <SunRig />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.3} receiveShadow><planeGeometry args={[2400, 2400]} /><meshLambertMaterial color="#DAD6CC" /></mesh>
      {sat && <Satellite />}
      {showLots && <Lots />}
      <BlueLine />
      <Context />
      {(mode === 'future' ? towers : oldBuildings).map((b) => <Block key={b.id} b={b} />)}
      {showTrees && <Trees />}
      {heat && tab === 'sun' && <Heat />}
      {tab === 'wind' && <Wind />}
      {tab === 'home' && !cutOn && <AptMarker />}
      {cutOn && <FloorCut b={aptB!} floor={apt!.floor} unitKey={apt!.unit} />}
      <Compass />
      <Streets />
      <Rig />
    </Canvas>
  )
}
