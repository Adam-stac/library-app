import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJson, postJson } from '../api'
import { displayName } from '../authors'
import { errorMessage, isArabic, type Named } from '../library'
import { knownAs } from '../pageReading'
import { type Scholar, scholarLine, scholarsNamed, searchable } from '../scholarWorks'
import Icon from './Icon'

/**
 * An author printed on the photographed page, not yet among the book's authors (ADR 0011, point 7). The reader
 * chooses: one of their own authors who may be them, a scholar from the catalogue (linked, so the timeline knows
 * them), or the name as printed, as a new author. Nothing happens until a button is pressed. The page wins: a death
 * year printed on it is used over the catalogue's, and a difference is shown.
 */
export default function PageAuthor({
  printed,
  deathHijri,
  onChosen,
}: {
  printed: string
  deathHijri: number | null
  onChosen: (author: Named) => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [offers, setOffers] = useState<{ printed: string; yours: Named[]; scholars: Scholar[] } | null>(null)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const known = knownAs(printed)

  useEffect(() => {
    let current = true
    const query = searchable(known) ? known : null
    void Promise.all([
      query
        ? getJson<{ authors?: { items?: unknown } }>(`/api/v1/search?q=${encodeURIComponent(query)}&limit=5`)
        : Promise.resolve(null),
      query ? scholarsNamed(query) : Promise.resolve([]),
    ]).then(([yours, scholars]) => {
      if (!current) return
      const items = yours?.ok && Array.isArray(yours.data?.authors?.items) ? (yours.data.authors.items as Named[]) : []
      setOffers({
        printed,
        yours: items.filter((item) => item && typeof item.id === 'string').slice(0, 3),
        scholars: scholars.slice(0, 2),
      })
    })
    return () => {
      current = false
    }
  }, [printed, known])

  const add = async (body: Record<string, unknown>) => {
    setAdding(true)
    setProblem(null)
    const result = await postJson<Named>('/api/v1/authors', body, { csrf: true })
    setAdding(false)
    if (result.ok && result.data) onChosen(result.data)
    else
      setProblem(
        errorMessage(t, language, result.ok ? 'unexpected' : (Object.values(result.fieldErrors)[0] ?? result.code)),
      )
  }
  const death = (scholar: Scholar | null) => ({
    hijri: deathHijri ?? scholar?.deathHijri ?? null,
    ce: deathHijri !== null ? null : (scholar?.deathCe ?? null),
    approximate: false,
  })
  const shown = offers?.printed === printed ? offers : null
  const button = 'btn h-auto max-w-full py-2 text-start whitespace-normal'

  return (
    <div className="notice">
      <Icon name="user" className="mt-px size-4 text-accent" />
      <div className="flex min-w-0 flex-col gap-2">
        <p>
          <bdi className="font-book">{t('pageReading.author', { name: printed })}</bdi>
        </p>
        <div className="flex flex-wrap gap-2">
          {shown?.yours.map((author) => (
            <button key={author.id} type="button" className={button} onClick={() => onChosen(author)}>
              <bdi>{t('books.catalogue.useYours', { name: displayName(author, language) })}</bdi>
            </button>
          ))}
          {shown?.scholars.map((scholar) => (
            <button
              key={scholar.id}
              type="button"
              className={button}
              disabled={adding}
              onClick={() =>
                void add({
                  nameAr: scholar.nameAr,
                  nameEn: scholar.nameEn,
                  death: death(scholar),
                  wikidataId: scholar.id,
                })
              }
            >
              <Icon name="plus" className="size-4" />
              <bdi>{t('pageReading.useScholar', { name: scholarLine(scholar, t, language) })}</bdi>
              {deathHijri !== null && scholar.deathHijri !== null && scholar.deathHijri !== deathHijri && (
                <span className="text-sm text-muted">
                  {' '}
                  {t('pageReading.pageSays', { year: deathHijri })}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            className={button}
            disabled={adding}
            aria-busy={adding}
            onClick={() => void add({ ...(isArabic(printed) ? { nameAr: printed } : { nameEn: printed }), death: death(null) })}
          >
            <Icon name="plus" className="size-4" />
            <bdi>{t('books.catalogue.addNew', { name: printed })}</bdi>
          </button>
        </div>
        {problem && (
          <p role="alert" className="text-sm text-danger">
            {problem}
          </p>
        )}
      </div>
    </div>
  )
}
