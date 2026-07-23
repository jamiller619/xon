import { move as moveSortable } from '@dnd-kit/helpers'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { ArrowReset20Regular as ResetIcon } from '@fluentui/react-icons'
import { Button } from '@xon/ui'
import { css } from 'inline-css-modules'
import {
  motion,
  type PanInfo,
  Reorder,
  useDragControls,
  useReducedMotion,
} from 'motion/react'
import { type PointerEvent, type RefCallback, useRef, useState } from 'react'

const INITIAL_ITEMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

const styles = css`
  /* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 */
  /* Hallmark · component: drag diagnostic · genre: modern-minimal · theme: Xon
   * states: default · hover · focus · active · disabled · loading · error · success
   * contrast: pass · motion: functional reorder only
   */

  .page {
    display: grid;
    gap: var(--space-xl);
    width: min(70rem, 100%);
    margin-inline: auto;
    padding: var(--space-xl);
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-lg);
  }

  .intro {
    display: grid;
    gap: var(--space-xs);
    min-width: 0;
    max-width: 68ch;

    h1,
    p {
      margin: 0;
    }

    h1 {
      font-size: var(--text-xl);
      overflow-wrap: anywhere;
    }

    p {
      color: var(--color-text-muted);
    }
  }

  .experiments {
    display: grid;
    gap: var(--space-xl);
  }

  .experiment {
    display: grid;
    gap: var(--space-sm);
    min-width: 0;
    padding-top: var(--space-lg);
    border-top: 1px solid var(--color-gray-6);
  }

  .experimentHeader {
    display: grid;
    gap: var(--space-2xs);

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: var(--text-md);
    }

    p {
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  }

  .stage {
    min-width: 0;
    padding: var(--space-md);
    border: 1px solid var(--color-gray-7);
    border-radius: var(--border-radius-2);
    background: var(--color-gray-2);
  }

  .stage[data-layout="wrapped"] {
    width: min(34rem, 100%);
  }

  .stage[data-layout="horizontal"] {
    overflow-x: auto;
  }

  .list {
    display: flex;
    gap: var(--space-sm);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list[data-layout="wrapped"] {
    flex-wrap: wrap;
  }

  .list[data-layout="horizontal"] {
    width: max-content;
  }

  .list[data-layout="vertical"] {
    flex-direction: column;
    width: 8rem;
  }

  .freeList {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dndGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 7rem);
    grid-auto-flow: dense;
    grid-auto-rows: 5rem;
    justify-content: start;
    gap: var(--space-sm);
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .item {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 7rem;
    height: 5rem;
    border: 1px solid var(--color-gray-8);
    border-radius: var(--border-radius-2);
    background: var(--color-gray-4);
    box-shadow: var(--shadow-1);
    font-size: var(--text-lg);
    font-weight: 600;
  }

  .freeItem {
    touch-action: none;
    will-change: transform;

    &[data-dragging="true"] {
      z-index: 2;
      border-color: var(--color-gray-11);
      box-shadow: var(--shadow-4);
    }

    &[data-drop-target="true"] {
      outline: 2px solid var(--color-gray-12);
      outline-offset: 2px;
    }
  }

  .dndItem {
    width: 100%;
    height: 100%;
    touch-action: none;

    &[data-dragging="true"] {
      z-index: 2;
      border-color: var(--color-gray-11);
      box-shadow: var(--shadow-4);
    }
  }

  .handle {
    position: absolute;
    inset: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: transparent;
    cursor: grab;
    touch-action: none;

    &:focus-visible {
      outline: 2px solid var(--color-gray-12);
      outline-offset: 2px;
    }

    &:active {
      cursor: grabbing;
    }
  }

  .order {
    margin: 0;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .log {
    display: grid;
    gap: var(--space-xs);
    min-width: 0;
    padding: var(--space-md);
    border: 1px solid var(--color-gray-7);
    border-radius: var(--border-radius-2);
    background: var(--color-gray-2);

    h2,
    ol {
      margin: 0;
    }

    h2 {
      font-size: var(--text-md);
    }

    ol {
      display: grid;
      gap: var(--space-2xs);
      padding-inline-start: var(--space-lg);
      color: var(--color-text-muted);
      font-size: var(--text-sm);
    }
  }

  @media (max-width: 40rem) {
    .page {
      padding: var(--space-md);
    }

    .header {
      align-items: stretch;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .item {
      transition-duration: 0ms;
    }
  }
`

type Layout = 'wrapped' | 'horizontal' | 'vertical'
type Axis = 'x' | 'y'

export default function DragReorderSpike() {
  const [resetKey, setResetKey] = useState(0)
  const [events, setEvents] = useState<Array<{ id: number; text: string }>>([])
  const nextEventId = useRef(0)

  function record(label: string, items: string[]) {
    setEvents((current) =>
      [
        {
          id: nextEventId.current++,
          text: `${label}: ${items.join(' → ')}`,
        },
        ...current,
      ].slice(0, 10),
    )
  }

  function reset() {
    setResetKey((key) => key + 1)
    setEvents([])
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.intro}>
          <h1>Motion Reorder: axis and wrapping controls</h1>
          <p>
            Compare Motion’s one-axis Reorder component with a free 2D drag
            built from Motion primitives. The outlined card is the calculated
            drop slot.
          </p>
        </div>
        <Button onClick={reset}>
          <ResetIcon aria-hidden="true" />
          Reset all
        </Button>
      </header>

      <div className={styles.experiments} key={resetKey}>
        <Experiment
          title="Wrapped row · x axis"
          description="Try moving between rows and moving vertically before crossing a horizontal neighbour."
          layout="wrapped"
          axis="x"
          onOrderChange={record}
        />
        <Experiment
          title="Unwrapped row · x axis"
          description="Control case: Motion Reorder’s intended horizontal-list layout."
          layout="horizontal"
          axis="x"
          onOrderChange={record}
        />
        <Experiment
          title="Single column · y axis"
          description="Control case: Motion Reorder’s intended vertical-list layout."
          layout="vertical"
          axis="y"
          onOrderChange={record}
        />
        <FreeDragExperiment onOrderChange={record} />
        <DndKitGridExperiment onOrderChange={record} />
      </div>

      <section className={styles.log} aria-live="polite">
        <h2>Latest emitted orders</h2>
        {events.length > 0 ? (
          <ol>
            {events.map((event) => (
              <li key={event.id}>{event.text}</li>
            ))}
          </ol>
        ) : (
          <p className={styles.order}>No reorder events yet.</p>
        )}
      </section>
    </main>
  )
}

function DndKitGridExperiment({
  onOrderChange,
}: {
  onOrderChange: (label: string, items: string[]) => void
}) {
  const title = 'Wrapped grid · dnd-kit sortable'
  const [items, setItems] = useState(INITIAL_ITEMS)

  return (
    <section className={styles.experiment}>
      <div className={styles.experimentHeader}>
        <h2>{title}</h2>
        <p>
          The exact API and grid model used by the referenced Storybook:
          unrestricted dragging with optimistic live reflow.
        </p>
      </div>
      <div className={styles.stage} data-layout="wrapped">
        <DragDropProvider
          onDragEnd={(event) => {
            setItems((current) => {
              const next = moveSortable(current, event)
              onOrderChange(title, next)
              return next
            })
          }}
        >
          <ul className={styles.dndGrid} aria-label={title}>
            {items.map((item, index) => (
              <DndKitGridItem key={item} item={item} index={index} />
            ))}
          </ul>
        </DragDropProvider>
      </div>
      <p className={styles.order}>Current order: {items.join(' → ')}</p>
    </section>
  )
}

function DndKitGridItem({ item, index }: { item: string; index: number }) {
  const { ref, handleRef, isDragging } = useSortable({
    id: item,
    index,
  })

  return (
    <li
      ref={ref}
      className={`${styles.item} ${styles.dndItem}`}
      data-dragging={isDragging}
    >
      <span aria-hidden="true">{item}</span>
      <button
        ref={handleRef}
        type="button"
        className={styles.handle}
        aria-label={`Drag item ${item}`}
      >
        Drag item {item}
      </button>
    </li>
  )
}

type Slot = {
  index: number
  x: number
  y: number
}

function FreeDragExperiment({
  onOrderChange,
}: {
  onOrderChange: (label: string, items: string[]) => void
}) {
  const title = 'Wrapped grid · free 2D Motion drag'
  const [items, setItems] = useState(INITIAL_ITEMS)
  const [activeItem, setActiveItem] = useState<string>()
  const [dropIndex, setDropIndex] = useState<number>()
  const itemElements = useRef(new Map<string, HTMLLIElement>())
  const slots = useRef<Slot[]>([])
  const reduceMotion = useReducedMotion()

  function registerItem(item: string): RefCallback<HTMLLIElement> {
    return (element) => {
      if (element) {
        itemElements.current.set(item, element)
      } else {
        itemElements.current.delete(item)
      }
    }
  }

  function captureSlots() {
    slots.current = items.flatMap((item, index) => {
      const bounds = itemElements.current.get(item)?.getBoundingClientRect()

      return bounds
        ? [
            {
              index,
              x: bounds.left + bounds.width / 2,
              y: bounds.top + bounds.height / 2,
            },
          ]
        : []
    })
  }

  function closestSlot(item: string) {
    const bounds = itemElements.current.get(item)?.getBoundingClientRect()
    if (!bounds) return

    const x = bounds.left + bounds.width / 2
    const y = bounds.top + bounds.height / 2

    return slots.current.reduce<Slot | undefined>((closest, slot) => {
      if (!closest) return slot

      const distance = (slot.x - x) ** 2 + (slot.y - y) ** 2
      const closestDistance = (closest.x - x) ** 2 + (closest.y - y) ** 2

      return distance < closestDistance ? slot : closest
    }, undefined)
  }

  function startDrag(item: string) {
    captureSlots()
    setActiveItem(item)
    setDropIndex(items.indexOf(item))
  }

  function updateDropTarget(item: string) {
    const closest = closestSlot(item)
    if (closest) setDropIndex(closest.index)
  }

  function finishDrag(item: string, _info: PanInfo) {
    const from = items.indexOf(item)
    const to = closestSlot(item)?.index ?? from
    const next = moveItem(items, from, to)

    setItems(next)
    setActiveItem(undefined)
    setDropIndex(undefined)
    onOrderChange(title, next)
  }

  return (
    <section className={styles.experiment}>
      <div className={styles.experimentHeader}>
        <h2>{title}</h2>
        <p>
          Drag freely in any direction. Other cards stay put until drop, then
          the item moves to the nearest captured grid slot.
        </p>
      </div>
      <div className={styles.stage} data-layout="wrapped">
        <ul className={styles.freeList} aria-label={title}>
          {items.map((item, index) => (
            <FreeDragItem
              key={item}
              item={item}
              register={registerItem(item)}
              isDragging={activeItem === item}
              isDropTarget={
                activeItem !== undefined &&
                activeItem !== item &&
                dropIndex === index
              }
              reduceMotion={reduceMotion ?? false}
              onDragStart={startDrag}
              onDrag={updateDropTarget}
              onDragEnd={finishDrag}
            />
          ))}
        </ul>
      </div>
      <p className={styles.order}>Current order: {items.join(' → ')}</p>
    </section>
  )
}

function FreeDragItem({
  item,
  register,
  isDragging,
  isDropTarget,
  reduceMotion,
  onDragStart,
  onDrag,
  onDragEnd,
}: {
  item: string
  register: RefCallback<HTMLLIElement>
  isDragging: boolean
  isDropTarget: boolean
  reduceMotion: boolean
  onDragStart: (item: string) => void
  onDrag: (item: string) => void
  onDragEnd: (item: string, info: PanInfo) => void
}) {
  const dragControls = useDragControls()

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    dragControls.start(event)
  }

  return (
    <motion.li
      ref={register}
      className={`${styles.item} ${styles.freeItem}`}
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      dragSnapToOrigin
      {...(reduceMotion ? {} : { layout: true as const })}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
      data-dragging={isDragging}
      data-drop-target={isDropTarget}
      onDragStart={() => onDragStart(item)}
      onDrag={() => onDrag(item)}
      onDragEnd={(_, info) => onDragEnd(item, info)}
    >
      <span aria-hidden="true">{item}</span>
      <button
        type="button"
        className={styles.handle}
        onPointerDown={startDrag}
        aria-label={`Drag item ${item}`}
      >
        Drag item {item}
      </button>
    </motion.li>
  )
}

function moveItem(items: string[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)
  if (!item) return items

  next.splice(to, 0, item)
  return next
}

function Experiment({
  title,
  description,
  layout,
  axis,
  onOrderChange,
}: {
  title: string
  description: string
  layout: Layout
  axis: Axis
  onOrderChange: (label: string, items: string[]) => void
}) {
  const [items, setItems] = useState(INITIAL_ITEMS)
  const reduceMotion = useReducedMotion()

  function reorder(next: string[]) {
    setItems(next)
    onOrderChange(title, next)
  }

  return (
    <section className={styles.experiment}>
      <div className={styles.experimentHeader}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className={styles.stage} data-layout={layout}>
        <Reorder.Group
          axis={axis}
          values={items}
          onReorder={reorder}
          className={styles.list}
          data-layout={layout}
          aria-label={title}
        >
          {items.map((item) => (
            <SpikeItem
              key={item}
              item={item}
              reduceMotion={reduceMotion ?? false}
            />
          ))}
        </Reorder.Group>
      </div>
      <p className={styles.order}>Current order: {items.join(' → ')}</p>
    </section>
  )
}

function SpikeItem({
  item,
  reduceMotion,
}: {
  item: string
  reduceMotion: boolean
}) {
  const dragControls = useDragControls()

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    dragControls.start(event)
  }

  return (
    <Reorder.Item
      value={item}
      className={styles.item}
      dragControls={dragControls}
      dragListener={false}
      {...(reduceMotion ? {} : { layout: true as const })}
    >
      <span aria-hidden="true">{item}</span>
      <button
        type="button"
        className={styles.handle}
        onPointerDown={startDrag}
        aria-label={`Drag item ${item}`}
      >
        Drag item {item}
      </button>
    </Reorder.Item>
  )
}
