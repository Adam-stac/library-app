import { useTranslation } from 'react-i18next'
import { postJson } from '../api'
import { errorMessage, isArabic, type Named, nameOf, otherNameOf } from '../library'
import SearchPicker, { Picked } from './SearchPicker'

type Props = {
  id: string
  label: string
  value: Named | null
  onChange: (place: Named | null) => void
  /** An error code from the API for this field */
  error?: string
}

/**
 * Chooses one place: the account's own or one on the shared list, found as you type. A place that isn't there yet
 * can be added from what was typed (as its Arabic or English name, by its letters); the rest of its details can be
 * filled in on its page later.
 */
export default function PlacePicker({ id, label, value, onChange, error }: Props) {
  const { t, i18n } = useTranslation()
  const language = i18n.language

  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <span id={`${id}-label`} className="label">
          {label}
        </span>
        <p aria-labelledby={`${id}-label`} role="group">
          <Picked
            label={nameOf(value, language)}
            secondary={otherNameOf(value, language)}
            onRemove={() => onChange(null)}
          />
        </p>
        {error && <p className="text-sm text-danger">{errorMessage(t, language, error)}</p>}
      </div>
    )
  }

  return (
    <SearchPicker<Named>
      id={id}
      label={label}
      hint={t('picker.placeHint')}
      error={error ? errorMessage(t, language, error) : null}
      kind="places"
      describe={(place) => ({ primary: nameOf(place, language), secondary: otherNameOf(place, language) })}
      onPick={onChange}
      create={{
        label: (text) => t('picker.addPlace', { name: text }),
        run: async (text) => {
          const name = text.trim()
          const result = await postJson<Named>('/api/v1/places', isArabic(name) ? { nameAr: name } : { nameEn: name }, {
            csrf: true,
          })
          if (result.ok && result.data) return result.data
          if (result.ok) return errorMessage(t, language, 'unexpected')
          const code = Object.values(result.fieldErrors)[0] ?? result.code
          return errorMessage(t, language, code)
        },
      }}
    />
  )
}
