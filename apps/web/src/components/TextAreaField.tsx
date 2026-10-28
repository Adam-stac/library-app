import { useTranslation } from 'react-i18next'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  maxLength: number
  /** Words for the library, such as a biography: typed in the font they will be shown in */
  book?: boolean
  rows?: number
}

/** A labelled box for several lines of text, such as a biography. Follows the direction of what's typed. */
export default function TextAreaField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  maxLength,
  book = false,
  rows = 8,
}: Props) {
  const { t } = useTranslation()
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        dir="auto"
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`field py-2 ${book ? 'font-book text-reading leading-relaxed' : ''}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}
    </div>
  )
}
