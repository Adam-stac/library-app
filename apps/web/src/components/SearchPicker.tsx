import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getJson } from '../api'
import { formatNumber } from '../authors'
import Icon from './Icon'

/** The kinds of record the search API finds (GET /api/v1/search). */
export type SearchKind = 'authors' | 'places' | 'works' | 'editions'

type Option = { primary: string; secondary?: string | null }

type Props<T extends { id: string }> = {
  id: string
  label: string
  hint?: string
  /** An error message, already in the page's language */
  error?: string | null
  kind: SearchKind
  /** How a found record reads in the list */
  describe: (item: T) => Option
  onPick: (item: T) => void
  /** Records already chosen, left out of the list */
  exclude?: string[]
  /**
   * Adding what was typed as a new record, offered at the end of the list: its label, and what adding does
   * (returns the new record, or an error message to show).
   */
  create?: { label: (text: string) => string; run: (text: string) => Promise<T | string> }
}

const SEARCH_DELAY_MS = 250

/**
 * A search box that finds one of the account's records as you type, and picks it: an ARIA combobox with a list
 * of options (arrow keys, Enter and Escape work; so do the pointer and touch). Lookups wait a moment after the last
 * key, so typing a name sends one request, not one per letter.
 */
export default function SearchPicker<T extends { id: string }>({
  id,
  label,
  hint,
  error,
  kind,
  describe,
  onPick,
  exclude = [],
  create,
}: Props<T>) {
  const { t, i18n } = useTranslation()
  const [text, setText] = useState('')
  const [found, setFound] = useState<{ text: string; items: T[] } | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const query = text.trim()
  const searchable = /[\p{L}\p{N}]/u.test(query)

  useEffect(() => {
    if (!searchable) return
    let current = true
    const timer = setTimeout(() => {
      void getJson<Record<SearchKind, { items: T[] }>>(`/api/v1/search?q=${encodeURIComponent(query)}&limit=8`).then(
        (response) => {
          if (current && response.ok && response.data) setFound({ text: query, items: response.data[kind].items })
        },
      )
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [query, searchable, kind])

  const items = searchable && found?.text === query ? found.items.filter((item) => !exclude.includes(item.id)) : []
  const offerCreate = Boolean(create) && searchable && found?.text === query
  const count = items.length + (offerCreate ? 1 : 0)
  const showList = open && searchable && count > 0
  const optionId = (index: number) => `${listId}-${index}`

  function pick(item: T) {
    onPick(item)
    setText('')
    setFound(null)
    setOpen(false)
    setActive(-1)
    setCreateError(null)
    input.current?.focus()
  }

  async function choose(index: number) {
    if (index < items.length) {
      pick(items[index])
    } else if (create) {
      setCreating(true)
      setCreateError(null)
      const made = await create.run(query)
      setCreating(false)
      if (typeof made === 'string') setCreateError(made)
      else pick(made)
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (count === 0 ? -1 : (index + 1) % count))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive((index) => (count === 0 ? -1 : (index - 1 + count) % count))
    } else if (event.key === 'Enter' && showList && active >= 0) {
      event.preventDefault() // picks, rather than submitting the form
      void choose(active)
    } else if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
      setActive(-1)
    }
  }

  const described = [hint ? `${id}-hint` : '', error || createError ? `${id}-error` : ''].join(' ').trim()

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          ref={input}
          id={id}
          type="text"
          role="combobox"
          dir="auto"
          autoComplete="off"
          spellCheck={false}
          maxLength={100}
          value={text}
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
          aria-describedby={described || undefined}
          aria-invalid={error || createError ? true : undefined}
          onChange={(event) => {
            setText(event.target.value)
            setOpen(true)
            setActive(-1)
            setCreateError(null)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="field font-book w-full ps-9"
        />
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!showList}
          className="glass-panel absolute inset-x-0 top-full z-20 mt-1.5 max-h-72 overflow-y-auto rounded-xl border border-line p-1.5 shadow-menu"
        >
          {items.map((item, index) => {
            const option = describe(item)
            return (
              <li
                key={item.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // Keeps focus in the box, so choosing doesn't first close the list
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(index)}
                className={`flex cursor-pointer flex-wrap items-baseline gap-x-3 rounded-lg px-3 py-2 ${
                  index === active ? 'bg-hover' : 'hover:bg-hover'
                }`}
              >
                <bdi className="font-book text-reading">{option.primary}</bdi>
                {option.secondary && <bdi className="font-book text-sm text-muted">{option.secondary}</bdi>}
              </li>
            )
          })}
          {offerCreate && create && (
            <li
              id={optionId(items.length)}
              role="option"
              aria-selected={active === items.length}
              aria-disabled={creating || undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => void choose(items.length)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-accent ${
                active === items.length ? 'bg-hover' : 'hover:bg-hover'
              }`}
            >
              <Icon name="plus" className="size-4" />
              <bdi>{create.label(query)}</bdi>
            </li>
          )}
        </ul>
      </div>
      <p className="sr-only" aria-live="polite">
        {showList ? t('picker.found', { count: items.length, number: formatNumber(items.length, i18n.language) }) : ''}
      </p>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {(error || createError) && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error ?? createError}
        </p>
      )}
    </div>
  )
}

/** A record that has been picked, with a button to take it out again. */
export function Picked({
  label,
  secondary,
  onRemove,
}: {
  label: string
  secondary?: string | null
  onRemove: () => void
}) {
  const { t } = useTranslation()
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface py-1 ps-3 pe-1">
      <bdi className="font-book min-w-0 truncate text-reading">{label}</bdi>
      {secondary && <bdi className="font-book hidden truncate text-sm text-muted sm:inline">{secondary}</bdi>}
      <button
        type="button"
        onClick={onRemove}
        aria-label={t('picker.remove', { name: label })}
        className="grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
      >
        <Icon name="close" className="size-4" />
      </button>
    </span>
  )
}
