import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  type?: 'text' | 'password'
  autoComplete?: string
  inputRef?: Ref<HTMLInputElement>
  maxLength?: number
  mono?: boolean
}

/** A labelled text input with an optional hint and its error, wired up for screen readers. */
export default function FormField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  autoComplete,
  inputRef,
  maxLength = 1024,
  mono = false,
}: Props) {
  const { t } = useTranslation()
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type={type}
        dir="ltr"
        autoComplete={autoComplete}
        spellCheck={false}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`min-h-11 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700 ${mono ? 'font-mono tracking-widest' : ''}`}
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
