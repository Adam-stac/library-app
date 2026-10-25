import { useTranslation } from 'react-i18next'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  maxLength: number
}

/** A labelled box for several lines of text, such as a biography. Follows the direction of what's typed. */
export default function TextAreaField({ id, label, value, onChange, error, hint, maxLength }: Props) {
  const { t } = useTranslation()
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        name={id}
        dir="auto"
        rows={8}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className="rounded-lg border border-stone-400 bg-white px-3 py-2 aria-invalid:border-red-700"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-stone-700">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-800">
          {t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}
    </div>
  )
}
