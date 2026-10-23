import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import { passwordLength } from '../password'

type Props = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  visible: boolean
  error?: string
  inputRef?: Ref<HTMLInputElement>
}

/** A field for choosing a new password: the length rule, a live character count, and its error. */
export default function NewPasswordField({ id, label, value, onChange, visible, error, inputRef }: Props) {
  const { t } = useTranslation()
  const describedBy = [`${id}-hint`, error ? `${id}-error` : undefined].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        ref={inputRef}
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        dir="ltr"
        autoComplete="new-password"
        maxLength={512}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="min-h-11 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700"
      />
      <p id={`${id}-hint`} className="text-sm text-stone-700">
        {t('register.passwordHint')}{' '}
        <span aria-live="polite">{t('register.passwordCount', { count: passwordLength(value) })}</span>
      </p>
      {error && (
        <p id={`${id}-error`} className="text-sm text-red-800">
          {t(`errors.${error}`, { defaultValue: t('errors.unexpected') })}
        </p>
      )}
    </div>
  )
}
