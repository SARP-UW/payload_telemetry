import type { ReactNode } from 'react'
import type { Tone } from '../health'

interface ChipProps {
  tone: Tone
  children: ReactNode
  title?: string
}

/** Small coloured status label. Colour always comes with text, never alone. */
function Chip({ tone, children, title }: ChipProps) {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {children}
    </span>
  )
}

export default Chip
