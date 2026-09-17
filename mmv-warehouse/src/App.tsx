import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoadingScreen } from './components/ui/spinner'

// Login va Home nap thang: day la hai man dau tien moi nguoi deu thay,
// cho them mot vong tai o day chi lam cham cam nhan.
import Login from './pages/Login'
import Home from './pages/Home'

// Cac man con lai nap theo nhu cau. Dang ke nhat la Dashboard, CostByJob
// va ReportUser - ba man duy nhat dung recharts, ma KTV ngoai xuong
// khong co quyen vao.
const Pick = lazy(() => import('./pages/Pick'))
const Roll = lazy(() => import('./pages/Roll'))
const History = lazy(() => import('./pages/History'))
const VoucherNew = lazy(() => import('./pages/VoucherNew'))
const Vouchers = lazy(() => import('./pages/Vouchers'))
const VoucherDetail = lazy(() => import('./pages/VoucherDetail'))
const Movement = lazy(() => import('./pages/Movement'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const CostByJob = lazy(() => import('./pages/CostByJob'))
const ReportWeekly = lazy(() => import('./pages/ReportWeekly'))
const ReportUser = lazy(() => import('./pages/ReportUser'))

import { InstallAppPrompt } from './components/InstallAppPrompt'

export default function App() {
  return (
    <>
    <Suspense fallback={<LoadingScreen />}>
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
    </Suspense>
    <InstallAppPrompt />
    </>
  )
}
