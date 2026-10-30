import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import Icon from './Icon'

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
  /** Passwords and codes are always left-to-right; names follow what's typed. */
  dir?: 'ltr' | 'auto'
  /** Words for the library, such as names: typed in the font they will be shown in */
  book?: boolean
  /** A filled-in value's "may be incorrect, please check" note, shown with ⓘ until the value is edited (ADR 0010) */
  note?: string
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
  dir = 'ltr',
  book = false,
  note,
}: Props) {
  const { t } = useTranslation()
  const describedBy = [
    hint ? `${id}-hint` : undefined,
    note ? `${id}-note` : undefined,
    error ? `${id}-error` : undefined,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type={type}
        dir={dir}
        autoComplete={autoComplete}
        spellCheck={false}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`field ${mono ? 'font-mono tracking-widest' : ''} ${book ? 'font-book' : ''}`}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {note && <CheckNote id={`${id}-note`} text={note} />}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}
    </div>
  )
}

/** The ⓘ note beside a value filled in for the reader: what to do, and where it came from. */
export function CheckNote({ id, text }: { id: string; text: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm text-muted">
      <Icon name="info" className="mt-0.5 size-4 shrink-0 text-accent" />
      <span>{text}</span>
    </p>
  )
}
