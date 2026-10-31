import { type FormEvent, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { type ApiResult, postJson, putJson } from '../api'
import { useAuth } from '../auth/context'
import { COMMON_LANGUAGES, currencies, currencyName, languageName, regionName, today } from '../books'
import { cameraCanBeUsed } from '../camera'
import AuthorsPicker from '../components/AuthorsPicker'
import FormField, { CheckNote } from '../components/FormField'
import Icon from '../components/Icon'
import IsbnScanner from '../components/IsbnScanner'
import { CatalogueOffers, ScholarAuthor } from '../components/ScholarWorks'
import Loading from '../components/Loading'
import PageAuthor from '../components/PageAuthor'
import PageReader from '../components/PageReader'
import PageHeader from '../components/PageHeader'
import SearchPicker, { Picked } from '../components/SearchPicker'
import TextAreaField from '../components/TextAreaField'
import UnsavedChanges from '../components/UnsavedChanges'
import { useFormChecks } from '../formChecks'
import {
  authorsOf,
  bookTitle,
  decimal,
  type Edition,
  errorMessage,
  isArabic,
  type Named,
  nameOf,
  orNull,
  type ScienceList,
  wholeNumber,
  type Work,
  type WorkSummary,
  workTitle,
} from '../library'
import { readIsbn } from '../isbn'
import { editionNumber, type PageReading } from '../pageReading'
import type { Scholar, ScholarWork } from '../scholarWorks'
import {
  type Fillable,
  type Filled,
  fillIn,
  stillFilled,
  type Suggested,
  type Suggestions,
  useIsbnSuggestions,
} from '../suggestions'
import { useCopiesWithIsbn } from '../useCopiesWithIsbn'
import { useLoad } from '../useLoad'

type Draft = {
  /** Adding a copy of a work already in the library, rather than a new work */
  existingWork: WorkSummary | null
  titleAr: string
  titleEn: string
  authors: Named[]
  scienceId: string
  title: string
  language: string
  translator: string
  muhaqqiq: string
  publisher: string
  publicationPlace: string
  publishedHijri: string
  publishedCe: string
  editionNumber: string
  volumes: string
  isbn: string
  legalDeposit: string
  shelf: string
  notes: string
  purchasedOn: string
  priceAmount: string
  priceCurrency: string
  startedOn: string
  finishedOn: string
}

/** The fields a photo of the cover or title page can fill (ADR 0011) */
type PhotoField =
  | 'titleAr'
  | 'titleEn'
  | 'title'
  | 'muhaqqiq'
  | 'publisher'
  | 'publicationPlace'
  | 'publishedHijri'
  | 'publishedCe'
  | 'editionNumber'
  | 'isbn'

const EMPTY: Draft = {
  existingWork: null,
  titleAr: '',
  titleEn: '',
  authors: [],
  scienceId: '',
  title: '',
  language: '',
  translator: '',
  muhaqqiq: '',
  publisher: '',
  publicationPlace: '',
  publishedHijri: '',
  publishedCe: '',
  editionNumber: '',
  volumes: '',
  isbn: '',
  legalDeposit: '',
  shelf: '',
  notes: '',
  purchasedOn: '',
  priceAmount: '',
  priceCurrency: '',
  startedOn: '',
  finishedOn: '',
}

const text = (value: string | null) => value ?? ''
const number = (value: number | null) => (value === null ? '' : String(value))

function draftFrom(edition: Edition, work: Work): Draft {
  return {
    existingWork: null,
    titleAr: text(work.titleAr),
    titleEn: text(work.titleEn),
    authors: work.authors,
    scienceId: work.science?.id ?? '',
    title: text(edition.title),
    language: text(edition.language),
    translator: text(edition.translator),
    muhaqqiq: text(edition.muhaqqiq),
    publisher: text(edition.publisher),
    publicationPlace: text(edition.publicationPlace),
    publishedHijri: number(edition.published.hijri),
    publishedCe: number(edition.published.ce),
    editionNumber: number(edition.editionNumber),
    volumes: number(edition.volumes),
    isbn: text(edition.isbn),
    legalDeposit: text(edition.legalDeposit),
    shelf: text(edition.shelf),
    notes: text(edition.notes),
    purchasedOn: text(edition.purchasedOn),
    priceAmount: edition.price?.amount ?? '',
    priceCurrency: edition.price?.currency ?? '',
    startedOn: text(edition.startedOn),
    finishedOn: text(edition.finishedOn),
  }
}

/** The work's fields, as the API names them inside an edition ("work.titleAr") and on their own ("titleAr"). */
const asWorkErrors = (errors: Record<string, string>) =>
  Object.fromEntries(Object.entries(errors).map(([field, code]) => [`work.${field.replace(/^work\./, '')}`, code]))

/**
 * Adding a book (a copy on the shelf, with its work in the same form: a new work, or another copy of one already in
 * the library), or editing one (`/books/:id/edit`), which edits its work too. The API has the final say on every
 * rule; the checks here only save a round trip.
 */
export default function BookFormPage({ mode }: { mode: 'add' | 'edit' }) {
  const { t, i18n } = useTranslation()
  const { state, refresh } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [edition, { reload: reloadEdition }] = useLoad<Edition>(
    mode === 'edit' ? `/api/v1/editions/${encodeURIComponent(id)}` : null,
  )
  const workId = edition.status === 'ok' ? edition.data.work.id : null
  const [work, { reload: reloadWork }] = useLoad<Work>(workId ? `/api/v1/works/${encodeURIComponent(workId)}` : null)
  const [sciences] = useLoad<ScienceList>(`/api/v1/sciences?sort=${language}`)
  const [settings] = useLoad<{ defaultCurrency: string | null }>(mode === 'add' ? '/api/v1/library-settings' : null)

  const editing = mode === 'edit' && edition.status === 'ok' && work.status === 'ok' ? edition.data : null
  const editingWork = editing && work.status === 'ok' ? work.data : null
  // What has been typed, kept against the versions it started from (see PlaceFormPage). Adding a book, your default
  // currency fills in the price's currency whenever it arrives, even after you've started typing, unless you've
  // chosen a currency yourself.
  const defaultCurrency = settings.status === 'ok' ? (settings.data.defaultCurrency ?? '') : ''
  const base = editing && editingWork ? `${editing.id}:${editing.version}:${editingWork.version}` : 'new'
  const initial =
    editing && editingWork ? draftFrom(editing, editingWork) : { ...EMPTY, priceCurrency: defaultCurrency }
  const [typed, setTyped] = useState<{ base: string; draft: Draft; currencyChosen: boolean } | null>(null)
  const draft =
    typed?.base === base
      ? editing || typed.currencyChosen
        ? typed.draft
        : { ...typed.draft, priceCurrency: defaultCurrency }
      : initial
  const setDraft = (next: Draft) =>
    setTyped({
      base,
      draft: next,
      currencyChosen: (typed?.base === base && typed.currencyChosen) || next.priceCurrency !== draft.priceCurrency,
    })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const checks = useFormChecks(setErrors)
  // "You already have this": the reader's own copies of the ISBN in the field, other than the one being edited
  const { copies, checked: shelfChecked } = useCopiesWithIsbn(draft.isbn, editing ? editing.id : null)
  // Filling in from the ISBN (ADR 0010, layer 1): only empty fields, each with its "please check" note until edited.
  // On the edit page only once the ISBN has been changed, so opening a saved book never fills anything by itself.
  const suggestFor = !editing || readIsbn(draft.isbn) !== readIsbn(editing.isbn ?? '')
  const suggestions = useIsbnSuggestions(suggestFor ? draft.isbn : '', editing ? editing.id : null)
  const [fill, setFill] = useState<{ base: string; applied: Suggestions | undefined; filled: Filled }>({
    base,
    applied: undefined,
    filled: {},
  })
  const filled = fill.base === base ? fill.filled : {}
  if (suggestions !== undefined && (fill.base !== base || fill.applied !== suggestions)) {
    // A new answer: applied once, while rendering, so the fields and their notes change together
    const next = fillIn(draft, filled, suggestions)
    setFill({ base, applied: suggestions, filled: next.filled })
    if (next.draft !== draft) setDraft(next.draft)
  }
  const noteFor = (suggested: Suggested) =>
    `${t('books.suggest.check')} ${
      suggested.from === 'country' && suggested.country
        ? t('books.suggest.fromCountry', { country: regionName(suggested.country, language) })
        : suggested.from === 'publisher' && suggested.country
          ? t('books.suggest.fromPublisher', { country: regionName(suggested.country, language) })
          : suggested.from === 'languageArea'
            ? t('books.suggest.fromLanguageArea')
            : t('books.suggest.fromYourBooks')
    }`
  const checkNote = (field: Fillable) => {
    const suggested = stillFilled(draft, filled, field)
    return suggested ? noteFor(suggested) : undefined
  }
  const anyFilled = (['publisher', 'publicationPlace', 'language'] as const).some((field) => checkNote(field))
  // What the ISBN did, said in words under it: there is no search to press, so the reader sees that it was read
  const filledNames = (['language', 'publisher', 'publicationPlace'] as const)
    .filter((field) => checkNote(field))
    .map((field) => t(`books.fields.${field}`))
  const isbnStatus =
    !editing && readIsbn(draft.isbn) && shelfChecked && copies.length === 0
      ? [
          t('books.isbn.notYours'),
          filledNames.length > 0
            ? t('books.isbn.filled', { fields: filledNames.join(language === 'ar' ? '، ' : ', ') })
            : '',
          draft.existingWork || draft.titleAr || draft.titleEn ? '' : t('books.isbn.next'),
        ]
          .filter(Boolean)
          .join(' ')
      : ''
  // A classical work chosen from the scholars' catalogue (ADR 0010, layer 2): its titles as filled in, and its
  // authors still to be matched to the reader's own or added, one press each
  const [catalogue, setCatalogue] = useState<{
    base: string
    titleAr: string
    titleEn: string | null
    pending: Scholar[]
  } | null>(null)
  const chosen = catalogue?.base === base ? catalogue : null
  const fromCatalogue = `${t('books.suggest.check')} ${t('books.catalogue.from')}`
  const pickWork = (work: ScholarWork) => {
    const englishIsOurs = chosen?.titleEn != null && draft.titleEn === chosen.titleEn
    const titleEn = work.titleEn && (draft.titleEn === '' || englishIsOurs) ? work.titleEn : null
    setDraft({ ...draft, titleAr: work.titleAr, titleEn: titleEn ?? (englishIsOurs ? '' : draft.titleEn) })
    setCatalogue({ base, titleAr: work.titleAr, titleEn, pending: work.authors })
  }
  // Read from a photo of the cover or title page (ADR 0011): what filled which field, the authors printed on it still
  // to be chosen, and every line read, for the reader to move into a field
  const [photo, setPhoto] = useState<{
    base: string
    values: Partial<Record<PhotoField, string>>
    authors: string[]
    deathHijri: number | null
    lines: string[]
  } | null>(null)
  const fromPhoto = photo?.base === base ? photo : null
  const photoNote = (field: PhotoField) =>
    fromPhoto && draft[field] !== '' && draft[field] === fromPhoto.values[field] ? t('pageReading.check') : undefined
  const pageRead = (reading: PageReading) => {
    const f = reading.fields
    const found: Partial<Record<PhotoField, string>> = {
      ...(f.title && !draft.existingWork ? { [isArabic(f.title) ? 'titleAr' : 'titleEn']: f.title } : {}),
      muhaqqiq: f.muhaqqiq ?? undefined,
      publisher: f.publisher ?? undefined,
      publicationPlace: f.publicationPlace ?? undefined,
      publishedHijri: f.publishedHijri === null ? undefined : String(f.publishedHijri),
      publishedCe: f.publishedCe === null ? undefined : String(f.publishedCe),
      editionNumber: editionNumber(f.edition) === null ? undefined : String(editionNumber(f.edition)),
      isbn: f.isbn ?? undefined,
    }
    // Only empty fields: nothing the reader typed is replaced
    const next = { ...draft }
    const values: Partial<Record<PhotoField, string>> = {}
    for (const [field, value] of Object.entries(found) as [PhotoField, string | undefined][]) {
      if (value && next[field] === '') {
        next[field] = value
        values[field] = value
      }
    }
    setDraft(next)
    setPhoto({ base, values, authors: f.authors, deathHijri: f.authorDeathHijri, lines: reading.lines })
  }
  const useLine = (line: string, field: PhotoField) => {
    // The reader's own choice: it may replace what is there
    setDraft({ ...draft, [field]: line })
    if (fromPhoto) setPhoto({ ...fromPhoto, values: { ...fromPhoto.values, [field]: line } })
  }
  const pageAuthorChosen = (printed: string, author: Named) => {
    setDraft({
      ...draft,
      authors: draft.authors.some((other) => other.id === author.id) ? draft.authors : [...draft.authors, author],
    })
    if (fromPhoto) setPhoto({ ...fromPhoto, authors: fromPhoto.authors.filter((name) => name !== printed) })
  }
  const authorChosen = (scholar: Scholar, author: Named) => {
    setDraft({
      ...draft,
      authors: draft.authors.some((other) => other.id === author.id) ? draft.authors : [...draft.authors, author],
    })
    if (chosen) setCatalogue({ ...chosen, pending: chosen.pending.filter((other) => other.id !== scholar.id) })
  }

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  if (mode === 'edit' && !editing) {
    const failed = [edition.status, work.status].find((s) => s === 'notFound' || s === 'failed')
    if (!failed) return <Loading />
    return (
      <section className="max-w-2xl">
        <PageHeader back={{ to: '/books', label: t('books.all') }} title={t('books.title')} />
        <p role="alert" className="mt-6 text-danger">
          {t(failed === 'notFound' ? 'books.notFound' : 'common.loadFailed')}
        </p>
      </section>
    )
  }

  const set = (field: keyof Draft) => (value: string) => setDraft({ ...draft, [field]: value })
  const back = editing
    ? { to: `/books/${encodeURIComponent(editing.id)}`, label: bookTitle(editing, language) }
    : { to: '/books', label: t('books.all') }

  function loadLatest() {
    setErrors({})
    setFormError(null)
    reloadEdition()
    reloadWork()
  }

  /** Checks what can be checked here; returns the body, or null after showing what's wrong. */
  /** What is wrong with the form as it stands, by field: checked on saving, and as each field is left */
  function problems(): Record<string, string> {
    return inspect().found
  }

  /** Sets the errors; the edition's fields as the API takes them when there are none */
  function checked() {
    const { found, body } = inspect()
    setErrors(found)
    return Object.keys(found).length > 0 ? null : body
  }

  function inspect() {
    const found: Record<string, string> = {}
    const numberOf = (field: keyof Draft, max: number, code = 'invalid_number') => {
      const value = wholeNumber(draft[field] as string, max)
      if (value === 'invalid') found[field] = code
      return value === 'invalid' ? null : value
    }
    if (!draft.existingWork && draft.titleAr.trim() === '' && draft.titleEn.trim() === '') {
      found['work.titleAr'] = 'title_required'
    }
    const publishedHijri = numberOf('publishedHijri', 1500, 'invalid_year')
    const publishedCe = numberOf('publishedCe', 2100, 'invalid_year')
    const editionNumber = numberOf('editionNumber', 999)
    const volumes = numberOf('volumes', 500)
    const amount = draft.priceAmount.trim() === '' ? null : decimal(draft.priceAmount)
    if (amount === 'invalid' || (typeof amount === 'number' && amount < 0)) found.priceAmount = 'invalid_amount'
    // A currency with no amount (such as the default one, filled in) is not a price: it's simply left out
    if (amount !== null && amount !== 'invalid' && draft.priceCurrency === '') found.priceCurrency = 'currency_required'
    const now = today()
    for (const field of ['purchasedOn', 'startedOn', 'finishedOn'] as const) {
      if (draft[field] && draft[field] > now) found[field] = 'in_the_future'
    }
    if (draft.finishedOn && !draft.startedOn) found.startedOn = 'start_required'
    else if (draft.finishedOn && draft.startedOn && draft.finishedOn < draft.startedOn)
      found.finishedOn = 'before_start'

    const body = {
      title: orNull(draft.title),
      language: orNull(draft.language),
      translator: orNull(draft.translator),
      muhaqqiq: orNull(draft.muhaqqiq),
      publisher: orNull(draft.publisher),
      publicationPlace: orNull(draft.publicationPlace),
      published: { hijri: publishedHijri, ce: publishedCe },
      editionNumber,
      volumes,
      isbn: orNull(draft.isbn),
      legalDeposit: orNull(draft.legalDeposit),
      shelf: orNull(draft.shelf),
      notes: orNull(draft.notes),
      purchasedOn: orNull(draft.purchasedOn),
      price: amount === null || amount === 'invalid' ? null : { amount: String(amount), currency: draft.priceCurrency },
      startedOn: orNull(draft.startedOn),
      finishedOn: orNull(draft.finishedOn),
    }
    return { found, body }
  }

  const workBody = () => ({
    titleAr: orNull(draft.titleAr),
    titleEn: orNull(draft.titleEn),
    scienceId: draft.scienceId || null,
    authorIds: draft.authors.map((author) => author.id),
  })

  function failed(result: ApiResult, workErrors = false) {
    if (result.ok) return
    if (result.status === 401) void refresh()
    else if (Object.keys(result.fieldErrors).length > 0) {
      setErrors(workErrors ? asWorkErrors(result.fieldErrors) : editionErrors(result.fieldErrors))
    } else setFormError(result.code)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const body = checked()
    if (!body) return
    setSaving(true)
    let result: ApiResult<Edition>
    if (editing && editingWork) {
      const workChanged = JSON.stringify(workBody()) !== JSON.stringify(workBodyOf(editingWork))
      if (workChanged) {
        const saved = await putJson<Work>(
          `/api/v1/works/${encodeURIComponent(editingWork.id)}`,
          workBody(),
          editingWork.version,
        )
        if (!saved.ok) {
          setSaving(false)
          failed(saved, true)
          return
        }
      }
      result = await putJson<Edition>(
        `/api/v1/editions/${encodeURIComponent(editing.id)}`,
        { ...body, workId: editingWork.id },
        editing.version,
      )
    } else {
      result = await postJson<Edition>(
        '/api/v1/editions',
        draft.existingWork ? { ...body, workId: draft.existingWork.id } : { ...body, work: workBody() },
        { csrf: true },
      )
    }
    setSaving(false)
    if (result.ok && result.data) {
      navigate(`/books/${encodeURIComponent(result.data.id)}`, {
        state: { notice: t(editing ? 'common.saved' : 'books.added') },
      })
    } else failed(result)
  }

  const error = (field: string) => errors[field]

  return (
    <section className="max-w-2xl">
      <PageHeader
        back={back}
        title={
          <bdi>{editing ? t('books.editTitle', { title: bookTitle(editing, language) }) : t('books.addTitle')}</bdi>
        }
      />

      {formError === 'stale_version' ? (
        <div role="alert" className="mt-6 rounded-xl border border-danger-line bg-danger-soft p-5">
          <p>{t('common.stale')}</p>
          <button type="button" className="btn btn-primary mt-4" onClick={loadLatest}>
            {t('common.loadLatest')}
          </button>
        </div>
      ) : (
        formError && (
          <p role="alert" className="mt-6 text-danger">
            {errorMessage(t, language, formError)}
          </p>
        )
      )}

      <UnsavedChanges when={checks.dirty && !saving} />
      <form
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        {...checks.formProps(problems)}
        className="mt-10 flex flex-col gap-7"
      >
        {!editing && (
          <PageReader
            onRead={pageRead}
            frame={(content) => (
              <Group title={t('pageReading.title')} hint={t('pageReading.hint')}>
                {content}
                {fromPhoto && fromPhoto.lines.length > 0 && (
                  <PageLines lines={fromPhoto.lines} onUse={useLine} hasWork={Boolean(draft.existingWork)} />
                )}
              </Group>
            )}
          />
        )}
        <Group title={t('books.form.isbnGroup')} hint={editing ? undefined : t('books.form.isbnGroupHint')}>
          <div className="flex flex-col gap-3">
            <FormField
              id="isbn"
              label={t('books.fields.isbn')}
              hint={cameraCanBeUsed() ? t('books.isbn.hintScan') : t('books.isbn.hint')}
              value={draft.isbn}
              onChange={set('isbn')}
              error={error('isbn')}
              note={photoNote('isbn')}
              maxLength={40}
            />
            {cameraCanBeUsed() && <IsbnScanner onFound={(isbn) => setDraft({ ...draft, isbn })} />}
            <div aria-live="polite">
              {anyFilled && <p className="sr-only">{t('books.suggest.filled')}</p>}
              {copies.length > 0 && (
                <div className="notice">
                  <Icon name="bookOpen" className="mt-px size-4 text-accent" />
                  <div className="min-w-0">
                    <p>{t('books.isbn.have')}</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {copies.map((copy) => (
                        <li key={copy.id}>
                          <Link to={`/books/${encodeURIComponent(copy.id)}`} className="link">
                            <bdi>{bookTitle(copy, language)}</bdi>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {isbnStatus && <p className="text-sm text-muted">{isbnStatus}</p>}
            </div>
          </div>
        </Group>

        <Group title={t('books.form.work')} hint={editing ? t('books.form.workEditHint') : undefined}>
          {!editing && (
            <div className="flex flex-col gap-2">
              {draft.existingWork ? (
                <>
                  <span id="existing-work-label" className="label">
                    {t('books.form.existingWork')}
                  </span>
                  <p role="group" aria-labelledby="existing-work-label">
                    <Picked
                      label={workTitle(draft.existingWork, language)}
                      secondary={authorsOf(draft.existingWork, language) || null}
                      onRemove={() => setDraft({ ...draft, existingWork: null })}
                    />
                  </p>
                </>
              ) : (
                <SearchPicker<WorkSummary>
                  id="existingWork"
                  label={t('books.form.existingWork')}
                  hint={t('books.form.existingWorkHint')}
                  kind="works"
                  describe={(found) => ({
                    primary: workTitle(found, language),
                    secondary: authorsOf(found, language) || null,
                  })}
                  onPick={(found) => setDraft({ ...draft, existingWork: found })}
                />
              )}
            </div>
          )}
          {!draft.existingWork && (
            <>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <FormField
                  id="titleAr"
                  label={t('books.form.titleAr')}
                  value={draft.titleAr}
                  onChange={set('titleAr')}
                  error={error('work.titleAr')}
                  note={chosen && draft.titleAr === chosen.titleAr ? fromCatalogue : photoNote('titleAr')}
                  maxLength={500}
                  dir="auto"
                  book
                />
                <FormField
                  id="titleEn"
                  label={t('books.form.titleEn')}
                  value={draft.titleEn}
                  onChange={set('titleEn')}
                  error={error('work.titleEn')}
                  note={chosen?.titleEn && draft.titleEn === chosen.titleEn ? fromCatalogue : photoNote('titleEn')}
                  maxLength={500}
                  dir="auto"
                  book
                />
              </div>
              {!editing && !(chosen && draft.titleAr === chosen.titleAr) && (
                <CatalogueOffers typed={draft.titleAr || draft.titleEn} onPick={pickWork} />
              )}
              <p aria-live="polite" className="sr-only">
                {chosen && draft.titleAr === chosen.titleAr ? t('books.catalogue.filled') : ''}
              </p>
              <AuthorsPicker
                id="authors"
                label={t('books.form.authors')}
                value={draft.authors}
                onChange={(authors) => setDraft({ ...draft, authors })}
                error={error('work.authorIds')}
              />
              {fromPhoto?.authors.map((printed) => (
                <PageAuthor
                  key={printed}
                  printed={printed}
                  deathHijri={fromPhoto.deathHijri}
                  onChosen={(author) => pageAuthorChosen(printed, author)}
                />
              ))}
              {chosen?.pending.map((scholar) => (
                <ScholarAuthor
                  key={scholar.id}
                  scholar={scholar}
                  onChosen={(author) => authorChosen(scholar, author)}
                />
              ))}
              <div className="flex flex-col gap-2">
                <label htmlFor="science" className="label">
                  {t('books.fields.science')}
                </label>
                <select
                  id="science"
                  value={draft.scienceId}
                  onChange={(event) => set('scienceId')(event.target.value)}
                  aria-invalid={error('work.scienceId') ? true : undefined}
                  className="field font-book"
                >
                  <option value="">{t('books.form.noScience')}</option>
                  {sciences.status === 'ok' &&
                    sciences.data.items.map((science) => (
                      <option key={science.id} value={science.id}>
                        {nameOf(science, language)}
                      </option>
                    ))}
                </select>
                {error('work.scienceId') && (
                  <p className="text-sm text-danger">{errorMessage(t, language, error('work.scienceId'))}</p>
                )}
              </div>
            </>
          )}
        </Group>

        <Group title={t('books.form.copy')}>
          <FormField
            id="title"
            label={t('books.fields.coverTitle')}
            hint={t('books.form.coverTitleHint')}
            value={draft.title}
            onChange={set('title')}
            error={error('title')}
            note={photoNote('title')}
            maxLength={500}
            dir="auto"
            book
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              id="volumes"
              label={t('books.fields.volumes')}
              value={draft.volumes}
              onChange={set('volumes')}
              error={error('volumes')}
              maxLength={6}
            />
            <FormField
              id="shelf"
              label={t('books.fields.shelf')}
              hint={t('books.form.shelfHint')}
              value={draft.shelf}
              onChange={set('shelf')}
              error={error('shelf')}
              maxLength={100}
              dir="auto"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="language" className="label">
              {t('books.fields.language')}
            </label>
            <select
              id="language"
              value={draft.language}
              onChange={(event) => set('language')(event.target.value)}
              aria-invalid={error('language') ? true : undefined}
              aria-describedby={checkNote('language') ? 'language-note' : undefined}
              className="field"
            >
              <option value="">{t('books.form.noLanguage')}</option>
              {[...new Set([...COMMON_LANGUAGES, ...(draft.language ? [draft.language] : [])])].map((code) => (
                <option key={code} value={code}>
                  {languageName(code, language)}
                </option>
              ))}
            </select>
            {checkNote('language') && <CheckNote id="language-note" text={checkNote('language') ?? ''} />}
          </div>
        </Group>

        <Group title={t('books.form.imprint')}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <FormField
              id="muhaqqiq"
              label={t('books.fields.muhaqqiq')}
              value={draft.muhaqqiq}
              onChange={set('muhaqqiq')}
              error={error('muhaqqiq')}
              note={photoNote('muhaqqiq')}
              maxLength={300}
              dir="auto"
              book
            />
            <FormField
              id="translator"
              label={t('books.fields.translator')}
              value={draft.translator}
              onChange={set('translator')}
              error={error('translator')}
              maxLength={200}
              dir="auto"
              book
            />
            <FormField
              id="publisher"
              label={t('books.fields.publisher')}
              value={draft.publisher}
              onChange={set('publisher')}
              error={error('publisher')}
              note={checkNote('publisher') ?? photoNote('publisher')}
              maxLength={200}
              dir="auto"
              book
            />
            <FormField
              id="publicationPlace"
              label={t('books.fields.publicationPlace')}
              value={draft.publicationPlace}
              onChange={set('publicationPlace')}
              error={error('publicationPlace')}
              note={checkNote('publicationPlace') ?? photoNote('publicationPlace')}
              maxLength={200}
              dir="auto"
              book
            />
            <FormField
              id="publishedHijri"
              label={t('books.form.publishedHijri')}
              value={draft.publishedHijri}
              onChange={set('publishedHijri')}
              error={error('publishedHijri')}
              note={photoNote('publishedHijri')}
              maxLength={6}
            />
            <FormField
              id="publishedCe"
              label={t('books.form.publishedCe')}
              value={draft.publishedCe}
              onChange={set('publishedCe')}
              error={error('publishedCe')}
              note={photoNote('publishedCe')}
              maxLength={6}
            />
            <FormField
              id="editionNumber"
              label={t('books.fields.editionNumber')}
              value={draft.editionNumber}
              onChange={set('editionNumber')}
              error={error('editionNumber')}
              note={photoNote('editionNumber')}
              maxLength={6}
            />
            <FormField
              id="legalDeposit"
              label={t('books.fields.legalDeposit')}
              value={draft.legalDeposit}
              onChange={set('legalDeposit')}
              error={error('legalDeposit')}
              maxLength={50}
            />
          </div>
        </Group>

        <Group title={t('books.form.purchase')}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <DateField id="purchasedOn" label={t('books.fields.purchasedOn')} draft={draft} set={set} error={error} />
            <FormField
              id="priceAmount"
              label={t('books.form.priceAmount')}
              value={draft.priceAmount}
              onChange={set('priceAmount')}
              error={error('priceAmount')}
              maxLength={20}
            />
            <div className="flex flex-col gap-2">
              <label htmlFor="priceCurrency" className="label">
                {t('books.form.priceCurrency')}
              </label>
              <select
                id="priceCurrency"
                value={draft.priceCurrency}
                onChange={(event) => set('priceCurrency')(event.target.value)}
                aria-invalid={error('priceCurrency') ? true : undefined}
                aria-describedby={error('priceCurrency') ? 'priceCurrency-error' : undefined}
                className="field min-w-0"
              >
                <option value="">{t('books.form.noCurrency')}</option>
                {currencies().map((code) => (
                  <option key={code} value={code}>
                    {currencyName(code, language)}
                  </option>
                ))}
              </select>
              {error('priceCurrency') && (
                <p id="priceCurrency-error" className="text-sm text-danger">
                  {errorMessage(t, language, error('priceCurrency'))}
                </p>
              )}
            </div>
          </div>
        </Group>

        <Group title={t('books.reading')} hint={t('books.form.readingHint')}>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <DateField id="startedOn" label={t('books.fields.startedOn')} draft={draft} set={set} error={error} />
            <DateField id="finishedOn" label={t('books.fields.finishedOn')} draft={draft} set={set} error={error} />
          </div>
        </Group>

        <TextAreaField
          id="notes"
          label={t('books.fields.notes')}
          value={draft.notes}
          onChange={set('notes')}
          error={error('notes')}
          maxLength={10000}
          rows={4}
        />

        <p>
          <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving || undefined}>
            {t('common.save')}
          </button>
        </p>
      </form>
    </section>
  )
}

/** The API's names for the edition's fields, as the form names them. */
function editionErrors(errors: Record<string, string>): Record<string, string> {
  const names: Record<string, string> = {
    'published.hijri': 'publishedHijri',
    'published.ce': 'publishedCe',
    'price.amount': 'priceAmount',
    'price.currency': 'priceCurrency',
    workId: 'work.titleAr',
  }
  return Object.fromEntries(Object.entries(errors).map(([field, code]) => [names[field] ?? field, code]))
}

function workBodyOf(work: Work) {
  return {
    titleAr: work.titleAr,
    titleEn: work.titleEn,
    scienceId: work.science?.id ?? null,
    authorIds: work.authors.map((author) => author.id),
  }
}

/** Every line read from the photo, each of which the reader can put into a field with one choice (ADR 0011) */
function PageLines({
  lines,
  onUse,
  hasWork,
}: {
  lines: string[]
  onUse: (line: string, field: PhotoField) => void
  hasWork: boolean
}) {
  const { t } = useTranslation()
  const fields: PhotoField[] = [
    ...(hasWork ? [] : (['titleAr', 'titleEn'] as const)),
    'title',
    'muhaqqiq',
    'publisher',
    'publicationPlace',
  ]
  return (
    <details className="rounded-panel border border-line p-4">
      <summary className="link cursor-pointer text-sm">{t('pageReading.lines', { count: lines.length })}</summary>
      <p className="mt-2 text-sm text-muted">{t('pageReading.linesHint')}</p>
      <ol className="mt-3 flex flex-col divide-y divide-line">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2">
            <bdi className="font-book min-w-0 text-reading">{line}</bdi>
            <select
              aria-label={t('pageReading.putIn', { line })}
              className="field w-auto py-1 text-sm"
              value=""
              onChange={(event) => {
                if (event.target.value) onUse(line, event.target.value as PhotoField)
              }}
            >
              <option value="">{t('pageReading.putInChoose')}</option>
              {fields.map((field) => (
                <option key={field} value={field}>
                  {t(`pageReading.fields.${field}`)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ol>
    </details>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="card p-5 sm:p-6">
      <legend className="section-title float-start mb-2 w-full">{title}</legend>
      <div className="clear-both flex flex-col gap-5 pt-3">
        {hint && <p className="-mt-3 text-sm text-muted">{hint}</p>}
        {children}
      </div>
    </fieldset>
  )
}

function DateField({
  id,
  label,
  draft,
  set,
  error,
}: {
  id: 'purchasedOn' | 'startedOn' | 'finishedOn'
  label: string
  draft: Draft
  set: (field: keyof Draft) => (value: string) => void
  error: (field: string) => string | undefined
}) {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        type="date"
        min="1900-01-01"
        max={today()}
        value={draft[id]}
        onChange={(event) => set(id)(event.target.value)}
        aria-invalid={error(id) ? true : undefined}
        aria-describedby={error(id) ? `${id}-error` : undefined}
        className="field"
      />
      {error(id) && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {errorMessage(t, i18n.language, error(id)!)}
        </p>
      )}
    </div>
  )
}
