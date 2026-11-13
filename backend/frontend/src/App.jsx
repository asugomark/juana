import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Hangouts from './pages/Hangouts'
import HangoutDetail from './pages/HangoutDetail'
import CreateHangout from './pages/CreateHangout'
import HolaThread from './pages/HolaThread'
import HolaInbox from './pages/HolaInbox'
import Nearby from './pages/Nearby'
import Earnings from './pages/Earnings'
import Profile from './pages/Profile'
import AdminDashboard from './pages/AdminDashboard'
import Invite from './pages/Invite'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/hangouts" element={<Hangouts />} />
        <Route path="/hangouts/new" element={<CreateHangout />} />
        <Route path="/hangouts/:id" element={<HangoutDetail />} />
        <Route path="/hola" element={<HolaInbox />} />
        <Route path="/hola/:userId" element={<HolaThread />} />
        <Route path="/nearby" element={<Nearby />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/profile/:id" element={<Profile />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/invite/:hangoutId" element={<Invite />} />
      </Routes>
    </BrowserRouter>
  )
}
