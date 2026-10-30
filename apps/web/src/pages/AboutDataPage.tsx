import { useTranslation } from 'react-i18next'
import Icon from '../components/Icon'

const SOURCES = [
  { key: 'scholars', href: 'https://www.wikidata.org/' },
  { key: 'isbn', href: 'https://www.isbn-international.org/' },
  { key: 'yours', href: null },
] as const

/**
 * Where the details the app fills in come from, and on what terms (ADR 0010): the credit every source in use is owed,
 * and what is and isn't shared. Open to everyone, signed in or not.
 */
export default function AboutDataPage() {
  const { t } = useTranslation()

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">{t('aboutData.title')}</h1>
      <p className="lede mt-3">{t('aboutData.lede')}</p>
      <ul className="mt-10 flex flex-col gap-5">
        {SOURCES.map(({ key, href }) => (
          <li key={key} className="card p-6">
            <h2 className="section-title">{t(`aboutData.${key}Title`)}</h2>
            <p className="mt-2 text-muted">{t(`aboutData.${key}Body`)}</p>
            {href && (
              <p className="mt-3">
                <a
                  href={href}
                  className="link inline-flex items-center gap-1"
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {t(`aboutData.${key}Link`)}
                  <Icon name="external" className="size-3.5" />
                </a>
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
