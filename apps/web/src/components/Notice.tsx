import { useLocation } from 'react-router'
import Icon from './Icon'

/** What the last page did, such as "Place added.", passed in the navigation state and shown once. */
export default function Notice({ className = 'mt-8' }: { className?: string }) {
  const location = useLocation()
  const notice = (location.state as { notice?: string } | null)?.notice
  if (!notice) return null
  return (
    <p role="status" className={`notice ${className}`}>
      <Icon name="check" className="mt-px size-4 text-accent" />
      {notice}
    </p>
  )
}
