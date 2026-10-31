import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { postJson } from '../api'
import { displayName } from '../authors'
import { errorMessage, type Named } from '../library'
import { type Scholar, type ScholarWork, scholarLine, useScholarWorks, yourAuthorsLike } from '../scholarWorks'
import Icon from './Icon'

/**
 * Classical works matching the title being typed, from the scholars' catalogue (ADR 0010, layer 2). Choosing one is
 * the reader's own act: it fills the titles, and the authors are then offered one by one ({@link ScholarAuthor}).
 * When none match, a line says so, and points to the author field, which also searches the catalogue's scholars.
 */
export function CatalogueOffers({ typed, onPick }: { typed: string; onPick: (work: ScholarWork) => void }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const works = useScholarWorks(typed)
  if (!works) return null
  if (works.length === 0) {
    // Said, so the reader knows the title was looked for and can go on: the author may still be in the catalogue
    return <p className="text-sm text-muted">{t('books.catalogue.none')}</p>
  }

  return (
    <section aria-labelledby="catalogue-title" className="rounded-panel border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 id="catalogue-title" className="text-sm font-medium">
          {t('books.catalogue.title')}
        </h3>
        <Link to="/about/data" className="link text-sm">
          {t('books.catalogue.about')}
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {works.map((work) => (
          <li key={work.id}>
            <button
              type="button"
              className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-start transition-colors duration-150 hover:bg-hover"
              onClick={() => onPick(work)}
            >
              <bdi className="font-book text-reading">{work.titleAr}</bdi>
              <span className="text-sm text-muted">
                <bdi>
                  {work.authors.map((author) => scholarLine(author, t, language)).join(t('books.catalogue.and'))}
                </bdi>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One author of a work chosen from the catalogue, not yet among the book's authors: the reader's own authors who may
 * be them, to use, or adding them as a new author with their death year. Nothing happens until a button is pressed.
 */
export function ScholarAuthor({ scholar, onChosen }: { scholar: Scholar; onChosen: (author: Named) => void }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [yours, setYours] = useState<{ id: string; authors: Named[] } | null>(null)
  const [adding, setAdding] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    void yourAuthorsLike(scholar).then((authors) => {
      if (current) setYours({ id: scholar.id, authors })
    })
    return () => {
      current = false
    }
  }, [scholar])

  const add = async () => {
    setAdding(true)
    setProblem(null)
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
    setAdding(false)
    if (result.ok && result.data) onChosen(result.data)
    else
      setProblem(
        errorMessage(t, language, result.ok ? 'unexpected' : (Object.values(result.fieldErrors)[0] ?? result.code)),
      )
  }

  const name = displayName(scholar, language)
  return (
    <div className="notice">
      <Icon name="user" className="mt-px size-4 text-accent" />
      <div className="flex min-w-0 flex-col gap-2">
        <p>
          <bdi className="font-book">{t('books.catalogue.author', { name: scholarLine(scholar, t, language) })}</bdi>
        </p>
        <div className="flex flex-wrap gap-2">
          {(yours?.id === scholar.id ? yours.authors : []).map((author) => (
            <button
              key={author.id}
              type="button"
              className="btn h-auto max-w-full py-2 text-start whitespace-normal"
              onClick={() => onChosen(author)}
            >
              <bdi>{t('books.catalogue.useYours', { name: displayName(author, language) })}</bdi>
            </button>
          ))}
          <button
            type="button"
            className="btn h-auto max-w-full py-2 text-start whitespace-normal"
            disabled={adding}
            aria-busy={adding}
            onClick={() => void add()}
          >
            <Icon name="plus" className="size-4" />
            <bdi>{t('books.catalogue.addNew', { name })}</bdi>
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
