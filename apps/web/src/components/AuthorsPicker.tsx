import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { postJson } from '../api'
import { formatNumber } from '../authors'
import { displayName } from '../authors'
import { errorMessage, isArabic, type Named, nameOf, otherNameOf } from '../library'
import { scholarLine, scholarsNamed } from '../scholarWorks'
import Icon from './Icon'
import SearchPicker, { type CatalogueOption } from './SearchPicker'

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
 * A work's authors, in the order the book names them: found as you type among the account's authors, or among the
 * scholars' catalogue (added with their death year and linked to the scholar), or added from what was typed (as the
 * Arabic or English name, by its letters), then moved up or down, or taken out.
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
  // Scholars from the catalogue, after your own authors: a book whose title isn't in the catalogue often has an
  // author who is (al-Hattab, for his Mutammima). Choosing one adds them as your author, with their death year
  const fromCatalogue = useCallback(
    async (typed: string): Promise<CatalogueOption<Named>[]> =>
      (await scholarsNamed(typed)).map((scholar) => {
        const other = language === 'ar' ? scholar.nameEn : scholar.nameAr
        return {
          key: scholar.id,
          primary: scholarLine(scholar, t, language),
          secondary: other && other !== displayName(scholar, language) ? other : null,
          run: async () => {
            const result = await postJson<Named>(
              '/api/v1/authors',
              {
                nameAr: scholar.nameAr,
                nameEn: scholar.nameEn,
                death: { hijri: scholar.deathHijri, ce: scholar.deathCe, approximate: false },
                wikidataId: scholar.id,
              },
              { csrf: true },
            )
            if (result.ok && result.data) return result.data
            if (result.ok) return errorMessage(t, language, 'unexpected')
            return errorMessage(t, language, Object.values(result.fieldErrors)[0] ?? result.code)
          },
        }
      }),
    [t, language],
  )
  const iconButton =
    'grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ol aria-label={label} className="card divide-y divide-line">
          {value.map((author, index) => {
            const name = nameOf(author, language)
            return (
              <li key={author.id} className="flex items-center gap-2 py-1.5 ps-3 pe-1.5">
                <span aria-hidden="true" className="w-5 text-sm text-muted">
                  {formatNumber(index + 1, language)}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                  <bdi className="font-book truncate text-reading">{name}</bdi>
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
          catalogue={{ heading: t('picker.fromCatalogue'), search: fromCatalogue }}
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
