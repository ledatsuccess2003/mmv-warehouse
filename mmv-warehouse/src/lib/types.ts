// =====================================================================
//  MMV WAREHOUSE - TypeScript types
// =====================================================================

export type Role = 'ktv' | 'warehouse' | 'manager' | 'sales' | 'admin'

/** Nhóm vật tư - quyết định AI được phép nhập/xuất mã đó.
 *  'consumable' - vật tư tiêu hao, KTV tự lấy ở màn Lấy vật tư
 *  'roll'       - cuộn dài cắt dần, ở màn Cắt cuộn
 *  'general'    - mọi thứ còn lại, CHỈ ADMIN nhập/xuất (màn Nhập/Xuất kho)
 */
export type MaterialCategory = 'consumable' | 'roll' | 'general'

export const MATERIAL_CATEGORY_LABEL: Record<MaterialCategory, string> = {
  consumable: 'Vật tư tiêu hao',
  roll: 'Cuộn cắt dần',
  general: 'Vật tư khác (chỉ admin)',
}

export type VoucherType = 'IN' | 'OUT'
export type VoucherStatus = 'draft' | 'confirmed'
export type RollStatus = 'active' | 'finished'

export interface Material {
  id: number
  code: string
  description: string | null
  description_vi: string | null
  unit: string | null
  category: MaterialCategory
  min_stock: number
  closing_qty: number
  lead_time_days: number
  has_expiry: boolean
  expiry_date: string | null
  unit_price: number
  // Bốn cột dưới lấy nguyên từ Material.xlsx của kho, để bản Export
  // Material dựng lại đúng file gốc - xem src/lib/excel.ts.
  location: string | null
  mat_type: string | null
  remark: string | null
  stock_status: string | null
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
  user_id: number | null
  user_name: string | null
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

/** Một lần admin nhập/xuất thẳng vật tư ngoài tiêu hao (màn Nhập/Xuất kho) */
export interface StockMove {
  id: number
  user_id: number | null
  material_code: string | null
  type: VoucherType
  qty: number
  job_code: string | null
  vessel: string | null
  note: string | null
  timestamp: string
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
      stock_moves: TableDef<StockMove>
    }
    Views: Record<string, never>
    Functions: {
      // Các RPC gom nhiều lệnh ghi vào một transaction.
      // Xem supabase/schema.sql.
      log_manual_consumable: {
        Args: {
          p_user_id: number
          p_code: string
          p_description: string
          p_unit: string
          p_qty: number
          p_job_code: string
          p_user_name?: string | null
          p_occurred_at?: string | null
        }
        Returns: {
          log: ConsumableLog
          closing_qty: number
          warning: string | null
        }
      }
      log_consumable: {
        Args: {
          p_user_id: number
          p_material_code: string
          p_qty: number
          p_job_code: string
          p_notes?: string | null
          p_user_name?: string | null
          p_occurred_at?: string | null
        }
        Returns: {
          log: ConsumableLog
          closing_qty: number
          warning: string | null
        }
      }
      log_roll_cut: {
        Args: {
          p_roll_id: string
          p_user_id: number
          p_job_code: string
          p_length_used: number
          p_user_name?: string | null
        }
        Returns: { remaining: number; finished: boolean }
      }
      confirm_voucher: {
        Args: { p_voucher_id: number; p_actor_role?: string | null }
        Returns: { voucher: Voucher; warning: string | null }
      }
      log_stock_move: {
        Args: {
          p_user_id: number
          p_material_code: string
          p_type: VoucherType
          p_qty: number
          p_job_code?: string | null
          p_vessel?: string | null
          p_note?: string | null
          p_user_name?: string | null
          p_actor_role?: string | null
        }
        Returns: {
          move: StockMove
          closing_qty: number
          warning: string | null
        }
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
