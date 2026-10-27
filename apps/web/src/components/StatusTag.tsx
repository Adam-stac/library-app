import { useTranslation } from 'react-i18next'
import { statusText } from '../books'
import type { Status } from '../library'

/** A small label after a book's names: only for books being read or finished. */
export default function StatusTag({ status }: { status: Status }) {
  const { t } = useTranslation()
  if (status === 'not_started') return null
  return (
    <span
      className={`self-center rounded-full px-2 py-0.5 text-xs font-medium ${
        status === 'reading' ? 'bg-accent-soft text-accent' : 'bg-hover text-muted'
      }`}
    >
      {statusText(status, t)}
    </span>
  )
}
