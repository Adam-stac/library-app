import { type ComponentType, lazy, Suspense, useEffect } from 'react'
import { Route, Routes } from 'react-router'
import AuthProvider from './auth/AuthProvider'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'

/*
 * Each page is its own file in the build, downloaded when it is first needed, so the first visit downloads only
 * the frame and the page it opens on. The home page, where most visits start, comes with the frame, so it doesn't
 * wait for a second download. Once the app is idle, the rest are fetched quietly, so moving between pages
 * never waits on the network.
 */
type Loader = () => Promise<{ default: ComponentType<never> }>
const loaders: Loader[] = []

function page<P>(loader: () => Promise<{ default: ComponentType<P> }>) {
  loaders.push(loader as Loader)
  return lazy(loader)
}

function usePreloadPages() {
  useEffect(() => {
    const preload = () => loaders.forEach((load) => void load().catch(() => {}))
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(preload, { timeout: 3000 })
      return () => cancelIdleCallback(id)
    }
    const id = setTimeout(preload, 1500)
    return () => clearTimeout(id)
  }, [])
}

const AccountDeletedPage = page(() => import('./pages/AccountDeletedPage'))
const AccountPage = page(() => import('./pages/AccountPage'))
const AuthorFormPage = page(() => import('./pages/AuthorFormPage'))
const AuthorPage = page(() => import('./pages/AuthorPage'))
const AuthorsPage = page(() => import('./pages/AuthorsPage'))
const BenefitFormPage = page(() => import('./pages/BenefitFormPage'))
const BenefitPage = page(() => import('./pages/BenefitPage'))
const BenefitsPage = page(() => import('./pages/BenefitsPage'))
const BookFormPage = page(() => import('./pages/BookFormPage'))
const BookPage = page(() => import('./pages/BookPage'))
const BooksPage = page(() => import('./pages/BooksPage'))
const ChangePasswordPage = page(() => import('./pages/ChangePasswordPage'))
const ConfirmEmailChangePage = page(() => import('./pages/ConfirmEmailChangePage'))
const ForgotPasswordPage = page(() => import('./pages/ForgotPasswordPage'))
const LibrarySettingsPage = page(() => import('./pages/LibrarySettingsPage'))
const NotFoundPage = page(() => import('./pages/NotFoundPage'))
const PlaceFormPage = page(() => import('./pages/PlaceFormPage'))
const PlacePage = page(() => import('./pages/PlacePage'))
const PlacesPage = page(() => import('./pages/PlacesPage'))
const PasskeysPage = page(() => import('./pages/PasskeysPage'))
const RegisterPage = page(() => import('./pages/RegisterPage'))
const ResetPasswordPage = page(() => import('./pages/ResetPasswordPage'))
const SciencesPage = page(() => import('./pages/SciencesPage'))
const SearchPage = page(() => import('./pages/SearchPage'))
const SecurityPage = page(() => import('./pages/SecurityPage'))
const SettingsPage = page(() => import('./pages/SettingsPage'))
const SignInPage = page(() => import('./pages/SignInPage'))
const TwoFactorPage = page(() => import('./pages/TwoFactorPage'))
const VerifyEmailPage = page(() => import('./pages/VerifyEmailPage'))

export default function App() {
  usePreloadPages()
  return (
    <AuthProvider>
      <Layout>
        {/* Nothing while a page's file arrives: the frame is already there, and it is usually a moment */}
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="/two-step-verification" element={<TwoFactorPage />} />
            <Route path="/passkeys" element={<PasskeysPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/library-settings" element={<LibrarySettingsPage />} />
            <Route path="/security" element={<SecurityPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
            <Route path="/account-deleted" element={<AccountDeletedPage />} />
            <Route path="/authors" element={<AuthorsPage />} />
            <Route path="/authors/new" element={<AuthorFormPage mode="add" />} />
            <Route path="/authors/:id" element={<AuthorPage />} />
            <Route path="/authors/:id/edit" element={<AuthorFormPage mode="edit" />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/new" element={<BookFormPage mode="add" />} />
            <Route path="/books/:id" element={<BookPage />} />
            <Route path="/books/:id/edit" element={<BookFormPage mode="edit" />} />
            <Route path="/benefits" element={<BenefitsPage />} />
            <Route path="/benefits/new" element={<BenefitFormPage mode="add" />} />
            <Route path="/benefits/:id" element={<BenefitPage />} />
            <Route path="/benefits/:id/edit" element={<BenefitFormPage mode="edit" />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/places" element={<PlacesPage />} />
            <Route path="/places/new" element={<PlaceFormPage mode="add" />} />
            <Route path="/places/:id" element={<PlacePage />} />
            <Route path="/places/:id/edit" element={<PlaceFormPage mode="edit" />} />
            <Route path="/sciences" element={<SciencesPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </Layout>
    </AuthProvider>
  )
}
