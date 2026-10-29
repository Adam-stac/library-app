import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiResult } from '../api'
import { useAuth } from '../auth/context'
import { errorMessage } from '../library'
import Icon from './Icon'

type Props = {
  label: string
  /** In a list, the name of what this button deletes, added to its spoken name ("Delete benefit from 3 May") */
  hiddenName?: string
  onDelete: () => Promise<ApiResult>
  /** Deleted: the page moves on, and offers Undo */
  onDeleted: () => void
}

/**
 * Delete at once, for things that go to the bin (ADR 0009): no question first, since Undo and the bin put it
 * right. The button says it is working while the request is on its way, and why, if the API refuses.
 */
export default function DeleteButton({ label, hiddenName, onDelete, onDeleted }: Props) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setDeleting(true)
    setError(null)
    const result = await onDelete()
    setDeleting(false)
    if (result.ok || result.status === 404) onDeleted()
    else if (result.status === 401) void refresh()
    else setError(errorMessage(t, i18n.language, result.code))
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost"
        aria-label={hiddenName ? `${label} ${hiddenName}` : undefined}
        aria-busy={deleting || undefined}
        disabled={deleting}
        onClick={() => void remove()}
      >
        {!deleting && <Icon name="trash" className="size-4" />}
        {label}
      </button>
      {error && (
        <p role="alert" className="basis-full text-sm text-danger">
          {error}
        </p>
      )}
    </>
  )
}
