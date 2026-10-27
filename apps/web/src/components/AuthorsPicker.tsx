import { useTranslation } from 'react-i18next'
import { postJson } from '../api'
import { formatNumber } from '../authors'
import { errorMessage, isArabic, type Named, nameOf, otherNameOf } from '../library'
import Icon from './Icon'
import SearchPicker from './SearchPicker'

const MAX_AUTHORS = 20

type Props = {
  id: string
  label: string
  value: Named[]
  onChange: (authors: Named[]) => void
  /** An error code from the API for this field */
  error?: string
}

/**
 * A work's authors, in the order the book names them: found as you type among the account's authors, or added from
 * what was typed (as the Arabic or English name, by its letters), then moved up or down, or taken out.
 */
export default function AuthorsPicker({ id, label, value, onChange, error }: Props) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const move = (from: number, to: number) => {
    const next = [...value]
    const [author] = next.splice(from, 1)
    next.splice(to, 0, author)
    onChange(next)
  }
  const iconButton =
    'grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ol aria-label={label} className="divide-y divide-line rounded-xl border border-line bg-surface">
          {value.map((author, index) => {
            const name = nameOf(author, language)
            return (
              <li key={author.id} className="flex items-center gap-2 py-1.5 ps-3 pe-1.5">
                <span aria-hidden="true" className="w-5 text-sm text-muted">
                  {formatNumber(index + 1, language)}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                  <bdi className="font-book truncate text-[1.0625rem]">{name}</bdi>
                  {otherNameOf(author, language) && (
                    <bdi className="font-book truncate text-sm text-muted">{otherNameOf(author, language)}</bdi>
                  )}
                </span>
                <button
                  type="button"
                  className={iconButton}
                  disabled={index === 0}
                  aria-label={t('picker.moveUp', { name })}
                  onClick={() => move(index, index - 1)}
                >
                  <Icon name="up" className="size-4" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  disabled={index === value.length - 1}
                  aria-label={t('picker.moveDown', { name })}
                  onClick={() => move(index, index + 1)}
                >
                  <Icon name="down" className="size-4" />
                </button>
                <button
                  type="button"
                  className={iconButton}
                  aria-label={t('picker.remove', { name })}
                  onClick={() => onChange(value.filter((other) => other.id !== author.id))}
                >
                  <Icon name="close" className="size-4" />
                </button>
              </li>
            )
          })}
        </ol>
      )}
      {value.length < MAX_AUTHORS && (
        <SearchPicker<Named>
          id={id}
          label={value.length === 0 ? label : t('picker.addAnotherAuthor')}
          hint={t('picker.authorHint')}
          error={error ? errorMessage(t, language, error) : null}
          kind="authors"
          exclude={value.map((author) => author.id)}
          describe={(author) => ({ primary: nameOf(author, language), secondary: otherNameOf(author, language) })}
          onPick={(author) => onChange([...value, author])}
          create={{
            label: (text) => t('picker.addAuthor', { name: text }),
            run: async (text) => {
              const name = text.trim()
              const result = await postJson<Named>(
                '/api/v1/authors',
                isArabic(name) ? { nameAr: name } : { nameEn: name },
                { csrf: true },
              )
              if (result.ok && result.data) return result.data
              if (result.ok) return errorMessage(t, language, 'unexpected')
              return errorMessage(t, language, Object.values(result.fieldErrors)[0] ?? result.code)
            },
          }}
        />
      )}
    </div>
  )
}
