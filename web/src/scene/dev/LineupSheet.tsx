import { PerspectiveCamera, View } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'
import { getFamily } from '../../blocks/families'
import { Recipe, variantBlocks, variantColors } from '../../blocks/recipe'
import { SceneEnvironment } from '../Lighting'
import { palette } from '../palette'
import { RecipeMesh } from '../RecipeMesh'

type Size = { width: number; height: number; depth: number; source?: string }
type Column = { label: string; recipe: unknown }
type Row = {
  id: string
  name: string
  store: string
  category: string
  url: string
  photo?: string
  variant: string
  optionNames: string[]
  optionValues: string[]
  size: Size
  heldOut: boolean
  columns: Column[]
}

const ROWS_PER_PAGE = 6

/** The environment's strength in the room (RoomScene sets the same). */
function RoomExposure() {
  const get = useThree((state) => state.get)
  useEffect(() => {
    get().scene.environmentIntensity = 0.35
  }, [get])
  return null
}

function ModelView({ recipe, size, optionNames, optionValues }: { recipe: Recipe; size: Size; optionNames: string[]; optionValues: string[] }) {
  const shown = useMemo(() => {
    const blocks = variantBlocks(recipe, optionNames, optionValues)
    return blocks ? { ...recipe, blocks } : recipe
  }, [recipe, optionNames, optionValues])
  const colors = useMemo(() => variantColors(recipe, optionNames, optionValues), [recipe, optionNames, optionValues])
  const flat = size.height < 0.05
  const radius = 0.5 * Math.hypot(size.width, size.height, size.depth)
  const distance = (radius / Math.sin((22 * Math.PI) / 180)) * 1.05
  const direction = flat ? [0.45, 1.3, 0.9] : [0.75, 0.55, 1.25]
  const length = Math.hypot(direction[0]!, direction[1]!, direction[2]!)
  const target: [number, number, number] = [0, size.height / 2, 0]
  const position: [number, number, number] = [
    (direction[0]! / length) * distance,
    size.height / 2 + (direction[1]! / length) * distance,
    (direction[2]! / length) * distance,
  ]
  return (
    <>
      <PerspectiveCamera makeDefault fov={40} position={position} near={0.02} far={100} onUpdate={(camera) => camera.lookAt(...target)} />
      <RoomExposure />
      <SceneEnvironment />
      <hemisphereLight args={[palette.lightSky, palette.lightGround, 0.75]} />
      <directionalLight position={[2.5, 4, 3]} color={palette.lightKey} intensity={2.6} />
      <color attach="background" args={[palette.background]} />
      <RecipeMesh recipe={shown} dimensions={size} colors={colors} />
    </>
  )
}

function Chips({ recipe, optionNames, optionValues }: { recipe: Recipe; optionNames: string[]; optionValues: string[] }) {
  const family = getFamily(recipe.family)
  const colors = { ...Object.fromEntries(Object.entries(family?.slots ?? {}).map(([slot, spec]) => [slot, spec.color])), ...variantColors(recipe, optionNames, optionValues) }
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(colors).map(([slot, hex]) => (
        <span key={slot} className="flex items-center gap-0.5 text-[9px] text-muted" title={`${slot} ${hex}`}>
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-black/10" style={{ background: hex }} />
          {slot}
        </span>
      ))}
    </div>
  )
}

/**
 * Dev-only QA sheet for M3: each pilot product's store photo beside the model
 * each tier built for it, same variant, room lighting, plus the raw part
 * colors. ?lineup=<page>. Data: `npx tsx scripts/recipes.ts --lineup`.
 */
export function LineupSheet({ page }: { page: number }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}dev/lineup.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((data: { rows: Row[] }) => setRows(data.rows))
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  if (error) return <p className="p-6 text-sm">Lineup data missing ({error}). Run `npx tsx scripts/recipes.ts --lineup`.</p>
  if (!rows) return <p className="p-6 text-sm">Loading…</p>
  const pages = Math.ceil(rows.length / ROWS_PER_PAGE)
  const shown = rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
  const labels = rows[0]?.columns.map((column) => column.label) ?? []

  return (
    <div ref={container} className="relative min-h-full w-full overflow-auto bg-[var(--color-bg,#f0ece4)] p-3 text-[var(--color-text,#2b2622)]">
      <header className="mb-2 flex items-baseline gap-3 text-xs">
        <strong>Lineup · page {page} of {pages}</strong>
        <span className="text-muted">store photo vs. our model, same variant, room lighting · chips = raw part colors</span>
      </header>
      <div className="grid gap-2" style={{ gridTemplateColumns: `170px repeat(${labels.length}, 210px)` }}>
        <div className="text-[10px] font-semibold uppercase text-muted">Store photo</div>
        {labels.map((label) => (
          <div key={label} className="text-[10px] font-semibold uppercase text-muted">
            {label}
          </div>
        ))}
        {shown.map((row, index) => (
          <Row key={row.id} row={row} number={(page - 1) * ROWS_PER_PAGE + index + 1} />
        ))}
      </div>
      <Canvas
        eventSource={container as React.RefObject<HTMLElement>}
        className="!fixed inset-0 !pointer-events-none"
        dpr={[1, 2]}
        onCreated={({ gl }) => {
          gl.toneMapping = NeutralToneMapping
        }}
      >
        <View.Port />
      </Canvas>
    </div>
  )
}

function Row({ row, number }: { row: Row; number: number }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        {row.photo ? <img src={`${row.photo}${row.photo.includes('?') ? '&' : '?'}width=300`} alt={row.name} className="h-[130px] w-[170px] rounded bg-white object-contain" /> : <div className="h-[130px] w-[170px] rounded bg-black/5" />}
        <div className="text-[10px] leading-tight">
          <strong>
            {number}. {row.name}
          </strong>{' '}
          {row.heldOut ? <span className="rounded bg-black/10 px-1">held out</span> : null}
          <div className="text-muted">
            {row.store} · {row.category} · {row.variant}
          </div>
        </div>
      </div>
      {row.columns.map((column) => {
        const parsed = column.recipe ? Recipe.safeParse(column.recipe) : null
        return (
          <div key={column.label} className="flex flex-col gap-1">
            {parsed?.success ? (
              <>
                <View className="h-[150px] w-[210px] overflow-hidden rounded">
                  <ModelView recipe={parsed.data} size={row.size} optionNames={row.optionNames} optionValues={row.optionValues} />
                </View>
                <Chips recipe={parsed.data} optionNames={row.optionNames} optionValues={row.optionValues} />
                <div className="text-[9px] text-muted">
                  {parsed.data.evidence ? `colors: ${parsed.data.evidence.colors} · shape: ${parsed.data.evidence.shape}` : ''}
                  {parsed.data.unmatched?.length ? ` · can't show: ${parsed.data.unmatched.slice(0, 3).join(', ')}` : ''}
                </div>
              </>
            ) : (
              <div className="grid h-[150px] w-[210px] place-items-center rounded bg-black/5 text-[10px] text-muted">no recipe</div>
            )}
          </div>
        )
      })}
    </>
  )
}
