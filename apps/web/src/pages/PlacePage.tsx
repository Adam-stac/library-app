import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { deleteJson } from '../api'
import { useAuth } from '../auth/context'
import ConfirmDelete from '../components/ConfirmDelete'
import Details from '../components/Details'
import Icon from '../components/Icon'
import Loading from '../components/Loading'
import Notice from '../components/Notice'
import PageHeader from '../components/PageHeader'
import { nameOf, otherNameOf, type Place } from '../library'
import { useLoad } from '../useLoad'

/** One place: its names, country and position. The account's own places can be edited and deleted. */
export default function PlacePage() {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const language = i18n.language === 'ar' ? 'ar' : 'en'
  const [loaded] = useLoad<Place>(`/api/v1/places/${encodeURIComponent(id)}`)

  if (state.status === 'loading') return null
  if (state.status === 'signedOut') return <Navigate to="/sign-in" replace />

  const back = { to: '/places', label: t('places.all') }
  if (loaded.status === 'notFound' || loaded.status === 'failed') {
    return (
      <article className="max-w-3xl">
        <PageHeader back={back} title={t('places.title')} />
        <p role="alert" className="mt-6 text-danger">
          {t(loaded.status === 'notFound' ? 'places.notFound' : 'common.loadFailed')}
        </p>
      </article>
    )
  }
  if (loaded.status !== 'ok') return <Loading />

  const place = loaded.data
  const name = nameOf(place, language)
  const country = [place.countryAr, place.countryEn].filter(Boolean)

  return (
    <article className="max-w-3xl">
      <PageHeader
        back={back}
        book
        title={<bdi>{name}</bdi>}
        lede={otherNameOf(place, language) && <bdi className="font-book text-lg">{otherNameOf(place, language)}</bdi>}
        actions={
          !place.shared && (
            <>
              <Link to={`/places/${encodeURIComponent(place.id)}/edit`} className="btn">
                <Icon name="pencil" className="size-4" />
                {t('common.edit')}
              </Link>
              <ConfirmDelete
                label={t('common.delete')}
                question={t('places.deleteConfirm', { name })}
                onDelete={() => deleteJson(`/api/v1/places/${encodeURIComponent(place.id)}`)}
                onDeleted={() => navigate('/places', { state: { notice: t('places.deleted', { name }) } })}
              />
            </>
          )
        }
      />
      <Notice className="mt-6" />
      {place.shared && <p className="mt-6 text-sm text-muted">{t('places.sharedNote')}</p>}

      <Details
        rows={[
          {
            label: t('places.form.otherNames'),
            value: place.otherNames.join(language === 'ar' ? '، ' : ', '),
            book: true,
          },
          { label: t('places.country'), value: country.join(' · '), book: true },
          {
            label: t('places.position'),
            value: place.latitude !== null && place.longitude !== null && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${place.latitude}&mlon=${place.longitude}#map=10/${place.latitude}/${place.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="link inline-flex items-center gap-1.5"
              >
                <Position latitude={place.latitude} longitude={place.longitude} />
                <Icon name="external" className="size-3.5" />
                <span className="sr-only">{t('places.openMap')}</span>
              </a>
            ),
          },
        ]}
      />
    </article>
  )
}

/**
 * "21.42250° N, 39.82611° E", or in Arabic "21.42250° شمالًا، 39.82611° شرقًا": degrees as the API keeps them. Each
 * number is kept left to right on its own, so the degree sign stays after it on an Arabic page.
 */
function Position({ latitude, longitude }: { latitude: number; longitude: number }) {
  const { t, i18n } = useTranslation()
  const axis = (value: number, positive: string, negative: string) => (
    <span>
      <bdi dir="ltr">{`${Math.abs(value).toFixed(5)}°`}</bdi> {t(value < 0 ? negative : positive)}
    </span>
  )
  return (
    <span>
      {axis(latitude, 'places.north', 'places.south')}
      {i18n.language === 'ar' ? '، ' : ', '}
      {axis(longitude, 'places.east', 'places.west')}
    </span>
  )
}
