import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate } from 'react-router'
import { deleteJson, postJson } from '../api'
import { useAuth } from '../auth/context'
import { formatNumber } from '../authors'
import { formatInstant } from '../books'
import ConfirmDelete from '../components/ConfirmDelete'
import EmptyState from '../components/EmptyState'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import PageHeader from '../components/PageHeader'
import { errorMessage, workTitle } from '../library'
import { useLoad } from '../useLoad'

/** One thing in the bin, as the API lists it (ADR 0009) */
type BinItem = {
  id: string
  kind: 'book' | 'benefit'
  /** A book's own title, when it has one */
  title: string | null
  /** A book's work's titles */
  titleAr: string | null
  titleEn: string | null
  /** The start of a benefit's text */
  excerpt: string | null
  deletedAt: string
  /** When it will be deleted for good */
  removedAt: string
}

type BinContents = { items: BinItem[]; total: number; keptDays: number }

/** What the last action did, said once at the top: "… was put back. Open it", or "The bin was emptied." */
type Done = { text: string; open?: string } | null

/**
 * The bin: books and benefits deleted in the last 30 days, newest first. Each can be put back as it was, or
 * deleted for good (after a question); the whole bin can be emptied. Reached from Settings, and from the Undo
 * message when putting back there didn't work.
 */
export default function BinPage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded, { reload }] = useLoad<BinContents>('/api/v1/bin')
  const [done, setDone] = useState<Done>(null)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const bin = loaded.status === 'ok' ? loaded.data : null
  const nameOf = (item: BinItem) =>
    item.kind === 'benefit'
      ? t('bin.benefit')
      : item.title || workTitle({ titleAr: item.titleAr, titleEn: item.titleEn }, language) || t('bin.untitled')

  return (
    <section className="max-w-3xl">
      <PageHeader
        back={{ to: '/settings', label: t('settings.title') }}
        title={t('bin.title')}
        lede={t('bin.intro', { days: formatNumber(bin?.keptDays ?? 30, language) })}
        actions={
          bin &&
          bin.total > 0 && (
            <ConfirmDelete
              label={t('bin.empty')}
              question={t('bin.emptyConfirm')}
              onDelete={() => deleteJson('/api/v1/bin')}
              onDeleted={() => {
                setDone({ text: t('bin.emptied') })
                reload()
              }}
            />
          )
        }
      />
      {done && (
        <p role="status" className="notice mt-8">
          <Icon name="check" className="mt-px size-4 text-accent" />
          <span>
            {done.text}
            {done.open && (
              <>
                {' '}
                <Link to={done.open} className="link font-medium">
                  {t('bin.openIt')}
                </Link>
              </>
            )}
          </span>
        </p>
      )}

      {loaded.status === 'loading' && <Loading shape="list" className="mt-8" />}
      {loaded.status === 'failed' && (
        <p role="alert" className="mt-8 text-danger">
          {t('common.loadFailed')}
        </p>
      )}
      {bin && bin.total === 0 && <EmptyState text={t('bin.none')} />}
      {bin && bin.total > 0 && (
        <>
          <p className="mt-8 mb-2 text-sm text-muted">
            {t('bin.count', { count: bin.total, number: formatNumber(bin.total, language) })}
          </p>
          <ul className="card divide-y divide-line">
            {bin.items.map((item) => (
              <li key={item.id}>
                <BinRow
                  item={item}
                  name={nameOf(item)}
                  onRestored={() => {
                    setDone(
                      item.kind === 'book'
                        ? { text: t('bin.restored', { title: nameOf(item) }), open: `/books/${item.id}` }
                        : { text: t('bin.restoredBenefit'), open: `/benefits/${item.id}` },
                    )
                    reload()
                  }}
                  onDeleted={reload}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function BinRow({
  item,
  name,
  onRestored,
  onDeleted,
}: {
  item: BinItem
  name: string
  onRestored: () => void
  onDeleted: () => void
}) {
  const { t, i18n } = useTranslation()
  const { refresh } = useAuth()
  const language = i18n.language
  const [restoring, setRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function restore() {
    setRestoring(true)
    setError(null)
    const result = await postJson(`/api/v1/bin/${encodeURIComponent(item.id)}/restore`, undefined, { csrf: true })
    setRestoring(false)
    if (result.ok) onRestored()
    else if (result.status === 401) void refresh()
    else if (result.status === 404)
      onDeleted() // already gone: show the bin as it is now
    else setError(errorMessage(t, language, result.code))
  }

  return (
    <article className="flex flex-col gap-3 px-5 py-4 sm:px-6">
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-field text-muted">
          <Icon name={item.kind === 'book' ? 'bookOpen' : 'quote'} className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          {item.kind === 'book' ? (
            <h2 className="font-book text-xl break-words">
              <bdi>{name}</bdi>
            </h2>
          ) : (
            <>
              <h2 className="sr-only">{name}</h2>
              <p className="font-book line-clamp-2 text-lg leading-reading break-words" dir="auto">
                {item.excerpt}
              </p>
            </>
          )}
          <p className="mt-1 text-sm text-muted">
            {t(item.kind === 'book' ? 'bin.book' : 'bin.benefit')}
            {' · '}
            {t('bin.deletedOn', { date: formatInstant(item.deletedAt, language) })}
            {' · '}
            {t('bin.goneOn', { date: formatInstant(item.removedAt, language) })}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 ps-14 has-[>div]:basis-full">
        <button
          type="button"
          className="btn"
          aria-label={t('bin.restoreNamed', { name })}
          aria-busy={restoring || undefined}
          disabled={restoring}
          onClick={() => void restore()}
        >
          {!restoring && <Icon name="undo" className="size-4" />}
          {t('bin.restore')}
        </button>
        <ConfirmDelete
          label={t('bin.deleteForever')}
          hiddenName={name}
          question={t('bin.deleteForeverConfirm')}
          onDelete={() => deleteJson(`/api/v1/bin/${encodeURIComponent(item.id)}`)}
          onDeleted={onDeleted}
        />
      </div>
      {error && (
        <p role="alert" className="ps-14 text-sm text-danger">
          {error}
        </p>
      )}
    </article>
  )
}
