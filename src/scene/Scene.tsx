import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { type Building, type Pt, boundary, byId, context, facadesOf, floorZ, geo, lots, oldBuildings, streets, towers, trees } from '../lib/site.ts'
import { sunAt } from '../lib/sun.ts'
import { groundSunHours } from '../lib/shade.ts'
import { heightMapFor } from '../lib/analysis.ts'
import { WINDS, useStore } from '../store.ts'

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

// ---------- בניינים ----------
function Context() {
  const g = useMemo(() => mergeGeometries(context.map((b) => prism(b.pts, b.h)))!, [])
  return <mesh geometry={g} castShadow receiveShadow><meshLambertMaterial color="#F1EEE7" /></mesh>
}

function Block({ b }: { b: Building }) {
  const mode = useStore((s) => s.mode), tab = useStore((s) => s.tab), selected = useStore((s) => s.selected), apt = useStore((s) => s.apt[s.mode])
  const set = useStore((s) => s.set), setApt = useStore((s) => s.setApt)
  const [hover, setHover] = useState(false)
  const g = useMemo(() => prism(b.pts, b.h), [b])
  const lines = useMemo(() => {
    const pos: number[] = []
    for (let f = 1; f <= b.floors; f++) {
      const y = (f * b.h) / b.floors
      b.pts.forEach((p, i) => { const q = b.pts[(i + 1) % b.pts.length]; pos.push(p[0], y, -p[1], q[0], y, -q[1]) })
    }
    b.pts.forEach((p) => pos.push(p[0], 0, -p[1], p[0], b.h, -p[1]))
    const lg = new THREE.BufferGeometry()
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    return lg
  }, [b])
  const mine = tab === 'home' ? apt?.id === b.id : selected === b.id
  const color = mine ? '#FFE9A8' : hover ? '#FFF6DA' : b.kind === 'tower' ? '#FBFAF6' : '#E9D9BF'
  void mode
  return (
    <group>
      <mesh geometry={g} castShadow receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
        onClick={(e) => {
          e.stopPropagation()
          if (tab === 'home') { if (b.h > 8) setApt({ id: b.id, floor: apt?.id === b.id ? apt.floor : Math.ceil(b.floors / 2), facade: apt?.id === b.id ? apt.facade : facadesOf(b)[0].key }) }
          else set({ selected: b.id })
        }}>
        <meshLambertMaterial color={color} />
      </mesh>
      <lineSegments geometry={lines}><lineBasicMaterial color={INK} transparent opacity={b.kind === 'tower' ? 0.28 : 0.4} /></lineSegments>
      {b.kind === 'tower' && (
        <Html position={[b.pts.reduce((s, p) => s + p[0], 0) / b.pts.length, b.h + 6, -b.pts.reduce((s, p) => s + p[1], 0) / b.pts.length]} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
          <div className="tag"><b>{b.lot}</b> {b.h} מ'</div>
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
  if (!apt || !b) return null
  const f = facadesOf(b).find((x) => x.key === apt.facade) ?? facadesOf(b)[0]
  const z = floorZ(b, apt.floor), fh = b.h / b.floors
  const rotY = Math.atan2(f.nx, -f.ny) + Math.PI
  return (
    <group position={v(f.at[0] + f.nx * 0.4, f.at[1] + f.ny * 0.4, z)} rotation-y={rotY}>
      <mesh><boxGeometry args={[Math.min(9, f.length * 0.5), fh * 0.9, 0.9]} /><meshBasicMaterial color={APT} /></mesh>
      <Html position={[0, fh, 0]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}><div className="tag mine">הדירה שלי</div></Html>
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
      const f = facadesOf(b).find((x) => x.key === apt.facade) ?? facadesOf(b)[0], z = floorZ(b, apt.floor)
      camera.position.copy(v(f.at[0] + f.nx * 3, f.at[1] + f.ny * 3, z + 0.4))
      ctl.current.target.copy(v(f.at[0] + f.nx * 160, f.at[1] + f.ny * 160, Math.max(2, z - 25)))
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
      {tab === 'home' && <AptMarker />}
      <Compass />
      <Streets />
      <Rig />
    </Canvas>
  )
}
