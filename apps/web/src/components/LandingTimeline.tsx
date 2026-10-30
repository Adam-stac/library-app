import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Loading from './Loading'

/** The ruler, the card and the list, fetched only when needed: they aren't part of the first visit */
const LandingTimelineView = lazy(() => import('./LandingTimelineView'))

/**
 * The general timeline on the landing page (slice T3): every scholar in the catalogue at the year they died, the
 * same one signed-in readers see beside their own authors. Its code and its list are loaded only as the visitor
 * scrolls near it, so the first screen doesn't wait for them. Its height is kept while it loads, so nothing below it
 * moves.
 */
export default function LandingTimeline() {
  const { t } = useTranslation()
  const [section, setSection] = useState<HTMLElement | null>(null)
  // Without IntersectionObserver (some older browsers), it loads straight away
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')

  // Within a screen or so of the visitor
  useEffect(() => {
    if (!section || near) return
    const observer = new IntersectionObserver((entries) => setNear(entries.some((entry) => entry.isIntersecting)), {
      rootMargin: '600px 0px',
    })
    observer.observe(section)
    return () => observer.disconnect()
  }, [section, near])

  return (
    <section ref={setSection} aria-labelledby="scholars-timeline" className="mt-24 sm:mt-32">
      <h2 id="scholars-timeline" className="font-display text-title leading-display font-semibold sm:text-title-lg">
        {t('landing.timelineTitle')}
      </h2>
      <p className="lede mt-3 max-w-2xl text-lg">{t('landing.timelineLede')}</p>
      <div className="card mt-8 min-h-[36rem] p-6 sm:min-h-[30rem] sm:p-8">
        {near ? (
          <Suspense fallback={<Loading />}>
            <LandingTimelineView />
          </Suspense>
        ) : (
          <Loading />
        )}
      </div>
    </section>
  )
}
