import { useTranslation } from 'react-i18next'
import { formatYear } from '../authors'
import { type YearDraft, type YearErrors, yearOf } from '../yearDraft'

type Props = {
  kind: 'birth' | 'death'
  value: YearDraft
  onChange: (value: YearDraft) => void
  errors: YearErrors
}

const input =
  'min-h-11 w-28 rounded-lg border border-stone-400 bg-white px-3 aria-invalid:border-red-700'
const select = 'min-h-11 rounded-lg border border-stone-400 bg-white px-2'

/**
 * A birth or death year: the Hijri year (after or before the Hijra), an optional CE year, and "approximate".
 * Shows how the year will read, including the CE years worked out from the Hijri year.
 */
export default function YearFields({ kind, value, onChange, errors }: Props) {
  const { t, i18n } = useTranslation()
  const id = (part: string) => `${kind}-${part}`
  const label = (part: string) => t(`authors.form.${kind}.${part}`)
  const preview = formatYear(yearOf(value).year, t, i18n.language)
  const set = (change: Partial<YearDraft>) => onChange({ ...value, ...change })
  const errorText = (code: string) => t(`errors.${code}`, { defaultValue: t('errors.unexpected') })

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-stone-200 bg-white p-4">
      <legend className="px-1 text-lg font-semibold">{label('legend')}</legend>

      <div className="flex flex-col gap-2">
        <label htmlFor={id('hijri')} className="font-semibold">
          {label('hijri')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={id('hijri')}
            inputMode="numeric"
            dir="ltr"
            maxLength={8}
            value={value.hijri}
            onChange={(e) => set({ hijri: e.target.value })}
            aria-invalid={errors.hijri ? true : undefined}
            aria-describedby={errors.hijri ? `${id('hijri')}-error` : undefined}
            className={input}
          />
          <select
            aria-label={label('hijriEra')}
            value={value.hijriEra}
            onChange={(e) => set({ hijriEra: e.target.value as YearDraft['hijriEra'] })}
            className={select}
          >
            <option value="AH">{t('authors.form.ah')}</option>
            <option value="BH">{t('authors.form.bh')}</option>
          </select>
        </div>
        {errors.hijri && (
          <p id={`${id('hijri')}-error`} className="text-sm text-red-800">
            {errorText(errors.hijri)}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={id('ce')} className="font-semibold">
          {label('ce')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={id('ce')}
            inputMode="numeric"
            dir="ltr"
            maxLength={8}
            value={value.ce}
            onChange={(e) => set({ ce: e.target.value })}
            aria-invalid={errors.ce ? true : undefined}
            aria-describedby={[`${id('ce')}-hint`, errors.ce ? `${id('ce')}-error` : ''].join(' ').trim()}
            className={input}
          />
          <select
            aria-label={label('ceEra')}
            value={value.ceEra}
            onChange={(e) => set({ ceEra: e.target.value as YearDraft['ceEra'] })}
            className={select}
          >
            <option value="CE">{t('authors.form.ce')}</option>
            <option value="BCE">{t('authors.form.bce')}</option>
          </select>
        </div>
        <p id={`${id('ce')}-hint`} className="text-sm text-stone-700">
          {t('authors.form.ceHint')}
        </p>
        {errors.ce && (
          <p id={`${id('ce')}-error`} className="text-sm text-red-800">
            {errorText(errors.ce)}
          </p>
        )}
      </div>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={value.approximate}
          onChange={(e) => set({ approximate: e.target.checked })}
          className="size-5"
        />
        {label('approximate')}
      </label>

      {preview && (
        <p className="text-stone-700" aria-live="polite">
          {t('authors.form.shownAs', { text: preview })}
        </p>
      )}
    </fieldset>
  )
}
