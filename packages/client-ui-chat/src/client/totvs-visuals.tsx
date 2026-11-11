import { useState } from 'react'

const ACTIVITY_PATH = 'M3.173 0.584C6.937 3.809 11.24 3.809 15.005 0.584c.118-.098.289-.098.4.014.112.112.112.282.014.4-3.226 3.764-3.226 8.066 0 11.83l-12.246-12.244Zm12.456 13.249a12.2 12.2 0 0 0-1.4-1.209c-3.574-2.594-7.548-2.39-11.056.618a.28.28 0 0 1-.4-.013.28.28 0 0 1-.013-.4C5.768 9.322 5.972 5.348 3.377 1.775A12.2 12.2 0 0 0 2.168.374C1.367-.427 0 .144 0 1.274v13.458C0 15.435.572 16 1.268 16h13.46c1.13 0 1.696-1.366.901-2.167Z'

function ActivityArtwork({ size, className }: { size: number; className: string }) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ACTIVITY_PATH} />
    </svg>
  )
}

function FloatingPlus({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** TOTVS hero mark using the supplied activity symbol and plus hover particles. */
export function TotvsHeroMark({ size }: { size: number }) {
  const [hovering, setHovering] = useState(false)
  return (
    <span
      className="totvs-chat-hero"
      aria-hidden="true"
      data-hovered={hovering ? 'true' : 'false'}
      onPointerEnter={(event) => { setHovering(event.pointerType !== 'touch') }}
      onPointerLeave={() => { setHovering(false) }}
      onPointerCancel={() => { setHovering(false) }}
    >
      <ActivityArtwork size={Math.max(52, size)} className="totvs-chat-hero-artwork" />
      <span className="totvs-chat-floating-pluses">
        <FloatingPlus className="totvs-chat-floating-plus totvs-chat-floating-plus-1" />
        <FloatingPlus className="totvs-chat-floating-plus totvs-chat-floating-plus-2" />
        <FloatingPlus className="totvs-chat-floating-plus totvs-chat-floating-plus-3" />
      </span>
    </span>
  )
}

/** TOTVS sidebar mark using the supplied activity symbol. */
export function TotvsSidebarMark({ size }: { size: number }) {
  return <ActivityArtwork size={size} className="totvs-chat-sidebar-mark" />
}

/** TOTVS Engineering V&D Code wordmark. */
export function TotvsBrandName() {
  return (
    <span className="totvs-chat-brand-name" aria-label="TOTVS ENG V&D CODE">
      <span className="totvs-chat-wordmark-primary">TOTVS ENG V&amp;D</span>
      <span className="totvs-chat-wordmark-badge">CODE</span>
    </span>
  )
}

/** Running indicator retaining the original heartbeat timing. */
export function TotvsRunningMark() {
  return (
    <span className="totvs-chat-running" aria-hidden="true">
      <ActivityArtwork size={16} className="totvs-chat-running-symbol" />
    </span>
  )
}
