// =====================================================================
//  MMV WAREHOUSE - TypeScript types
// =====================================================================

export type Role = 'ktv' | 'warehouse' | 'manager' | 'sales' | 'admin'
export type VoucherType = 'IN' | 'OUT'
export type VoucherStatus = 'draft' | 'confirmed'
export type RollStatus = 'active' | 'finished'

export interface Material {
  id: number
  code: string
  description: string | null
  description_vi: string | null
  unit: string | null
  category: string
  min_stock: number
  closing_qty: number
  lead_time_days: number
  has_expiry: boolean
  expiry_date: string | null
  unit_price: number
  created_at: string
}

export interface Job {
  id: number
  job_code: string
  customer: string | null
  vessel: string | null
  location: string | null
  status: string
  eta: string | null
  etd: string | null
}

export interface User {
  id: number
  name: string
  role: Role
  pin: string
  active: boolean
}

export interface ConsumableLog {
  id: number
  user_id: number | null
  material_code: string | null
  qty: number
  job_code: string | null
  timestamp: string
  notes: string | null
}

export interface Voucher {
  id: number
  voucher_no: string
  type: VoucherType
  date: string
  receiver: string | null
  supplier: string | null
  vessel: string | null
  job_code: string | null
  status: VoucherStatus
  created_by: number | null
  created_at: string
}

export interface VoucherItem {
  id: number
  voucher_id: number
  material_code: string | null
  description: string | null
  qty_theory: number | null
  qty_actual: number | null
  unit: string | null
  remarks: string | null
}

export interface Movement {
  id: number
  source_type: string | null
  source_id: number | null
  date: string | null
  code: string | null
  description: string | null
  unit: string | null
  receipt: number
  issue: number
  job_code: string | null
  vessel: string | null
  created_at: string
}

export interface RollTracking {
  id: number
  material_code: string | null
  roll_id: string
  total_length: number
  used_length: number
  status: RollStatus
  started_at: string
}

export interface RollCut {
  id: number
  roll_id: string
  user_id: number | null
  job_code: string | null
  length_used: number
  timestamp: string
}

// ---- Kết quả trả về chuẩn cho mọi hàm API ----
export interface ApiResult<T = unknown> {
  success: boolean
  data: T | null
  error: string | null
  warning?: string
}

// ---- Payload tạo phiếu ----
export interface VoucherItemInput {
  material_code: string
  description?: string | null
  qty_theory?: number | null
  qty_actual?: number | null
  unit?: string | null
  remarks?: string | null
}

export interface CreateVoucherData {
  date: string
  receiver?: string | null
  supplier?: string | null
  vessel?: string | null
  job_code?: string | null
  created_by?: number | null
  items: VoucherItemInput[]
}

// ---- Dữ liệu tổng hợp cho báo cáo / dashboard ----
export interface CostByJobRow {
  material_code: string
  description_vi: string | null
  unit: string | null
  qty_theory: number
  qty_actual: number
  diff: number
  unit_price: number
  amount: number
}

export interface MovementReportRow {
  code: string
  description: string | null
  unit: string | null
  receipt: number
  issue: number
}

// ---- Supabase Database generic (đủ dùng cho client) ----
type Row<T> = T
type Insert<T> = Partial<T>
type Update<T> = Partial<T>

interface TableDef<T> {
  Row: Row<T>
  Insert: Insert<T>
  Update: Update<T>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      materials: TableDef<Material>
      jobs: TableDef<Job>
      users: TableDef<User>
      consumable_logs: TableDef<ConsumableLog>
      vouchers: TableDef<Voucher>
      voucher_items: TableDef<VoucherItem>
      movements: TableDef<Movement>
      roll_tracking: TableDef<RollTracking>
      roll_cuts: TableDef<RollCut>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
