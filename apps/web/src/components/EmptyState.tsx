import type { ReactNode } from 'react'

/** What a list shows when it has nothing in it yet: what that means, and the way to add the first one. */
export default function EmptyState({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="mt-10 flex flex-col items-start gap-4 rounded-xl border border-dashed border-line-strong/60 px-6 py-8">
      <p className="text-muted">{text}</p>
      {children}
    </div>
  )
}
