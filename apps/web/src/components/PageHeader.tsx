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
}

/** The top of a page: an optional way back, the title, a line about the page, and its main actions. */
export default function PageHeader({ title, lede, actions, back, book = false }: Props) {
  return (
    <>
      {back && (
        <Link to={back.to} className="back-link mb-6">
          <Icon name="back" className="size-4" />
          <bdi>{back.label}</bdi>
        </Link>
      )}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1
            className={
              book ? 'font-book text-[2.25rem] leading-tight font-semibold break-words sm:text-[2.75rem]' : 'page-title'
            }
          >
            {title}
          </h1>
          {lede && <div className="lede">{lede}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2 has-[>div]:basis-full">{actions}</div>}
      </header>
    </>
  )
}
