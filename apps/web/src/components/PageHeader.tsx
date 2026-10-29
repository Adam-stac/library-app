import type { ReactNode } from 'react'
import { Link } from 'react-router'
import Icon from './Icon'

type Props = {
  title: ReactNode
  lede?: ReactNode
  /** Buttons or links at the end of the header, such as "Add a place" */
  actions?: ReactNode
  /** A link back up a level, shown above the title */
  back?: { to: string; label: ReactNode }
  /** Library words (a name, a title) are set in Lateef, larger */
  book?: boolean
  /** Small labels above the title, such as a book's science and status */
  above?: ReactNode
}

/**
 * The top of a page: an optional way back, the title, a line about the page, and its main actions.
 *
 * On a page named after a book or a person (`book`), the actions sit on the row of the way back, above the title.
 * Beside a long title they would wrap under it or not depending on the title's width, and the title's font arrives
 * a moment after the page, so the page would jump when it did.
 */
export default function PageHeader({ title, lede, actions, back, book = false, above }: Props) {
  const actionsOnTop = book && back !== undefined && actions !== undefined
  const backLink = back && (
    <Link to={back.to} className={actionsOnTop ? 'back-link' : 'back-link mb-6'}>
      <Icon name="back" className="size-4" />
      <bdi>{back.label}</bdi>
    </Link>
  )
  const actionList = actions && <div className="flex flex-wrap gap-2 has-[>div]:basis-full">{actions}</div>

  return (
    <>
      {actionsOnTop ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          {backLink}
          {actionList}
        </div>
      ) : (
        backLink
      )}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {above}
          <h1
            className={
              book ? 'font-book text-display leading-tight font-semibold break-words sm:text-display-lg' : 'page-title'
            }
          >
            {title}
          </h1>
          {lede && <div className="lede">{lede}</div>}
        </div>
        {!actionsOnTop && actionList}
      </header>
    </>
  )
}
