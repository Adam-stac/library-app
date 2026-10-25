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
import PasskeysPage from './pages/PasskeysPage'
import RegisterPage from './pages/RegisterPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SecurityPage from './pages/SecurityPage'
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
          <Route path="/security" element={<SecurityPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/confirm-email-change" element={<ConfirmEmailChangePage />} />
          <Route path="/account-deleted" element={<AccountDeletedPage />} />
          <Route path="/authors" element={<AuthorsPage />} />
          <Route path="/authors/new" element={<AuthorFormPage mode="add" />} />
          <Route path="/authors/:id" element={<AuthorPage />} />
          <Route path="/authors/:id/edit" element={<AuthorFormPage mode="edit" />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
