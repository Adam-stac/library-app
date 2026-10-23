import { Route, Routes } from 'react-router'
import AuthProvider from './auth/AuthProvider'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import RegisterPage from './pages/RegisterPage'
import SignInPage from './pages/SignInPage'
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
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Layout>
    </AuthProvider>
  )
}
