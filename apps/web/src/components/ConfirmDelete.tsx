import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiResult } from '../api'
import { useAuth } from '../auth/context'
import { errorMessage } from '../library'
import Icon from './Icon'

type Props = {
  /** What the button says, such as "Delete" */
  label: string
  /** In a list, the name of what this button deletes, added to its spoken name ("Delete Makkah") */
  hiddenName?: string
  /** The question, such as "Delete Makkah? This can't be undone." */
  question: string
  /** Deletes, and says how it went; on success the page moves on by itself */
  onDelete: () => Promise<ApiResult>
  onDeleted: () => void
}

/**
 * A Delete button that asks first. The question and the answer appear in place, so nothing is deleted by one slip
 * of the finger. If the API refuses (say, the record is still in use), it says why.
 */
export default function ConfirmDelete({ label, hiddenName, question, onDelete, onDeleted }: Props) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setDeleting(true)
    setError(null)
    const result = await onDelete()
    setDeleting(false)
    if (result.ok || result.status === 404) onDeleted()
    else if (result.status === 401) void refresh()
    else setError(errorMessage(t, i18n.language, result.code, result.details))
  }

  if (!asking) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        aria-label={hiddenName ? `${label} ${hiddenName}` : undefined}
        onClick={() => setAsking(true)}
      >
        <Icon name="trash" className="size-4" />
        {label}
      </button>
    )
  }

  return (
    <div className="mt-2 w-full basis-full rounded-xl border border-danger-line bg-danger-soft p-5">
      <p>{question}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-danger" disabled={deleting} onClick={() => void confirm()}>
          {t('common.deleteYes')}
        </button>
        <button type="button" className="btn" onClick={() => setAsking(false)}>
          {t('common.cancel')}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
