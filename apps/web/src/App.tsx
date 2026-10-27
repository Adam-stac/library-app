import { Route, Routes } from 'react-router'
import AuthProvider from './auth/AuthProvider'
import Layout from './components/Layout'
import AccountDeletedPage from './pages/AccountDeletedPage'
import AccountPage from './pages/AccountPage'
import AuthorFormPage from './pages/AuthorFormPage'
import AuthorPage from './pages/AuthorPage'
import AuthorsPage from './pages/AuthorsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ConfirmEmailChangePage from './pages/ConfirmEmailChangePage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HomePage from './pages/HomePage'
import NotFoundPage from './pages/NotFoundPage'
import PlaceFormPage from './pages/PlaceFormPage'
import PlacePage from './pages/PlacePage'
import PlacesPage from './pages/PlacesPage'
import PasskeysPage from './pages/PasskeysPage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SciencesPage from './pages/SciencesPage'
import SecurityPage from './pages/SecurityPage'
import SettingsPage from './pages/SettingsPage'
import SignInPage from './pages/SignInPage'
import TwoFactorPage from './pages/TwoFactorPage'
import VerifyEmailPage from './pages/VerifyEmailPage'

export default function App() {
  return (
    <AuthProvider>
      <Layout>
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
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
          <Route path="/account-deleted" element={<AccountDeletedPage />} />
          <Route path="/authors" element={<AuthorsPage />} />
          <Route path="/authors/new" element={<AuthorFormPage mode="add" />} />
          <Route path="/authors/:id" element={<AuthorPage />} />
          <Route path="/authors/:id/edit" element={<AuthorFormPage mode="edit" />} />
          <Route path="/places" element={<PlacesPage />} />
          <Route path="/places/new" element={<PlaceFormPage mode="add" />} />
          <Route path="/places/:id" element={<PlacePage />} />
          <Route path="/places/:id/edit" element={<PlaceFormPage mode="edit" />} />
          <Route path="/sciences" element={<SciencesPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
