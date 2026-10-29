import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { AuthProvider } from './context/AuthContext'
import Auth from './pages/Auth'
import Backtest from './pages/Backtest'
import Dashboard from './pages/Dashboard'
import Help from './pages/Help'
import Indicators from './pages/Indicators'
import Landing from './pages/Landing'
import MarketAnalysis from './pages/MarketAnalysis'
import MarketExplorer from './pages/MarketExplorer'
import PaperTrading from './pages/PaperTrading'
import Predictions from './pages/Predictions'
import Profile from './pages/Profile'
import RiskCalculator from './pages/RiskCalculator'
import Watchlist from './pages/Watchlist'

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-extrabold text-ink-600">404</p>
      <p className="mt-3 text-slate-400">That page does not exist.</p>
      <a href="/" className="btn-primary mt-5 inline-flex">Back to home</a>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/markets" element={<MarketExplorer />} />
            <Route path="/market/:symbol" element={<MarketAnalysis />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/indicators" element={<Indicators />} />
            <Route path="/backtest" element={<Backtest />} />
            <Route path="/risk" element={<RiskCalculator />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/paper" element={<PaperTrading />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/help" element={<Help />} />
            <Route path="/analysis" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  )
}
