import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'

import Login from './pages/Login'
import Home from './pages/Home'
import Pick from './pages/Pick'
import Roll from './pages/Roll'
import History from './pages/History'
import VoucherNew from './pages/VoucherNew'
import Vouchers from './pages/Vouchers'
import VoucherDetail from './pages/VoucherDetail'
import Movement from './pages/Movement'
import Inventory from './pages/Inventory'
import Dashboard from './pages/Dashboard'
import CostByJob from './pages/CostByJob'
import ReportWeekly from './pages/ReportWeekly'
import ReportUser from './pages/ReportUser'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/home" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/pick" element={<ProtectedRoute><Pick /></ProtectedRoute>} />
      <Route path="/roll" element={<ProtectedRoute><Roll /></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />

      <Route
        path="/voucher/out/new"
        element={<ProtectedRoute roles={['warehouse', 'manager', 'admin']}><VoucherNew type="OUT" /></ProtectedRoute>}
      />
      <Route
        path="/voucher/in/new"
        element={<ProtectedRoute roles={['warehouse', 'manager', 'admin']}><VoucherNew type="IN" /></ProtectedRoute>}
      />
      <Route
        path="/vouchers"
        element={<ProtectedRoute roles={['warehouse', 'manager', 'admin']}><Vouchers /></ProtectedRoute>}
      />
      <Route
        path="/voucher/:id"
        element={<ProtectedRoute roles={['warehouse', 'manager', 'sales', 'admin']}><VoucherDetail /></ProtectedRoute>}
      />

      <Route
        path="/inventory"
        element={<ProtectedRoute roles={['warehouse', 'manager', 'sales', 'admin']}><Inventory /></ProtectedRoute>}
      />
      <Route
        path="/movement"
        element={<ProtectedRoute roles={['warehouse', 'manager', 'admin']}><Movement /></ProtectedRoute>}
      />

      <Route
        path="/dashboard"
        element={<ProtectedRoute roles={['manager', 'sales', 'admin']}><Dashboard /></ProtectedRoute>}
      />
      <Route
        path="/cost"
        element={<ProtectedRoute roles={['manager', 'sales', 'warehouse', 'admin']}><CostByJob /></ProtectedRoute>}
      />
      <Route
        path="/report/weekly"
        element={<ProtectedRoute roles={['manager', 'sales', 'warehouse', 'admin']}><ReportWeekly /></ProtectedRoute>}
      />
      <Route
        path="/report/user"
        element={<ProtectedRoute roles={['manager', 'sales', 'warehouse', 'admin']}><ReportUser /></ProtectedRoute>}
      />

      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  )
}
