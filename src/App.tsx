import { BrowserRouter } from 'react-router-dom'
import AppRouter from './routes/AppRouter'
import AuthGate from './auth/AuthGate'

export default function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </AuthGate>
  )
}
