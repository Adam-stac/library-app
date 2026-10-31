import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import Icon from './Icon'

type Props = {
  to: string
  label: ReactNode
  className?: string
}

/** A link back up a level, shown above a page's title ("← Settings") */
export default function BackLink({ to, label, className = 'back-link mb-6' }: Props) {
  return (
    <Link to={to} className={className}>
      <Icon name="back" className="size-4" />
      <bdi>{label}</bdi>
    </Link>
  )
}

/** The way back to Settings, for the pages listed there */
export function BackToSettings() {
  const { t } = useTranslation()
  return <BackLink to="/settings" label={t('settings.title')} />
}
