import type { Material, Job, User, ConsumableLog, Voucher, Movement, RollTracking, RollCut } from './types'

let _matId = 1
function mat(code: string, desc: string, vi: string, unit: string, cat: string, min: number, qty: number, price: number, expiry?: string): Material {
  return {
    id: _matId++, code, description: desc, description_vi: vi, unit, category: cat,
    min_stock: min, closing_qty: qty, lead_time_days: 14, has_expiry: !!expiry,
    expiry_date: expiry ?? null, unit_price: price, created_at: '2026-01-01',
  }
}

export const MATERIALS: Material[] = [
  mat('MMV1003021','Wool gloves','Bao tay len','đôi','consumable',20,53,8000),
  mat('MMV2009008','Fabric gloves','Bao tay vải','đôi','consumable',20,51,7000),
  mat('MMV1003020','Rubber gloves','Bao tay cao su','đôi','consumable',20,239,12000),
  mat('MMV100090049','Face mask','Khẩu trang','cái','consumable',50,250,2000),
  mat('MMV09090057','Dish scrubber','Miếng rửa chén','cái','consumable',20,35,3000),
  mat('MMV-OMO','Detergent powder','Xà bông','bịch','consumable',10,12,35000),
  mat('MMV-VIM','Bleach cleaner','Nước tẩy','chai','consumable',10,8,28000,'2027-03-01'),
  mat('MMV10120080','Raft wrap film','Màng cuốn bè','cuộn','consumable',10,5,90000),
  mat('MMV1111003','White rags','Giẻ trắng','kg','consumable',20,40,25000),
  mat('MMV10120066','Colored rags','Giẻ màu','kg','consumable',20,22,20000),
  mat('MMV10040026','Spray paint','Sơn xịt','chai','consumable',20,18,55000,'2027-06-01'),
  mat('MMV10040025','Super glue','Keo con chó','lọ','consumable',20,9,9000,'2026-12-01'),
  mat('MMV09090056','Fine sandpaper','Giấy nhám mịn','tờ','consumable',30,120,4000),
  mat('MMV09090059','Coarse sandpaper','Giấy nhám thô','m','consumable',20,60,15000),
  mat('MMV1003017','Paint brush 2"','Cọ quét sơn 2"','cái','consumable',15,15,18000),
  mat('MMV1003016','Paint brush 1"','Cọ quét sơn 1"','cái','consumable',15,14,14000),
  mat('MMV10120082','Boat seam sealant','Keo ron xuồng','tuýp','consumable',10,6,120000,'2027-01-01'),
  mat('MMV09090055','WD-40 rust remover','Tẩy gỉ WD-40','chai','consumable',15,11,85000,'2027-08-01'),
  mat('MMV09090060','Brake cleaner spray','Xịt bố thắng','chai','consumable',15,7,65000,'2026-11-01'),
  mat('MMV110912','FE maintenance sticker','Tem bảo dưỡng bình chữa cháy','cái','consumable',20,3,5000),
  mat('MMV10040030','Nylon bag','Bịch nylon','kg','consumable',20,14,30000),
  mat('STAPE09050042','Cloth tape 5cm','Băng keo vải 5cm','cuộn','consumable',15,9,22000),
  mat('STAPE09050042-1','Cloth tape 10cm','Băng keo vải 10cm','cuộn','consumable',15,10,35000),
  mat('RTAPE1209003','Teflon tape','Bao keo non','cuộn','consumable',20,25,6000),
  mat('MMV1003012','Paper tape 5cm','Băng keo giấy 5cm','cuộn','consumable',10,1,18000),
  mat('MMV10060040','Paper tape 2.5cm','Băng keo giấy 2.5cm','cuộn','consumable',10,0,14000),
  mat('ETAPE09050041','Insulating tape','Băng keo điện','cuộn','consumable',20,56,9000),
  mat('DSTAPE1209003','Double-side tape','Băng keo 2 mặt','cuộn','consumable',10,1,25000),
  mat('MMV10050033','Clear tape 5cm','Băng keo trong 5cm','cuộn','consumable',20,32,12000),
  mat('MMV100100052','Clear tape 2.5cm','Băng keo trong 2.5cm','cuộn','consumable',20,36,10000),
  mat('MMV1003011','Brown tape 5cm','Băng keo vàng','cuộn','consumable',20,24,11000),
  mat('MMV-SIKA140','Sikaflex / Silicon','Sikaflex / Silicon','tuýp','consumable',10,4,180000,'2027-02-01'),
  mat('PF06060002','Plastic foil (4m)','Màng nhựa (cuộn 4m)','mtr','roll',50,272,22000),
  mat('YUL-SP-3-008-1','Retro-reflective tape','Băng phản quang','mtr','roll',50,464,45000),
  mat('CN-190321','Solas Reflective Tape (china)','Băng phản quang China (45m)','m','roll',50,731,38000),
]

let _uid = 1
const uid = () => _uid++
export const USERS: User[] = [
  // === Workshop Manager ===
  { id: uid(), name: 'Nguyen Khac Vinh',       role: 'manager', pin: '2222', active: true },
  // === Workshop: Senior Engineer / Supervisor ===
  { id: uid(), name: 'Nguyen Thanh Vinh',      role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Pham Van Huy',           role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Le Van Quang',           role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Tran Van Thuc',          role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Le Hong Tu',             role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Cao Minh Tuan',          role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Le Duy Thang',           role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Dao Ngan Lam',           role: 'ktv', pin: '', active: true },
  // === Workshop: Engineer ===
  { id: uid(), name: 'Duong Manh Hien',        role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Nguyen Truc Tai',        role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Le Truong Hau',          role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Tran Xuan Hop',          role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Nguyen Ngoc Minh',       role: 'ktv', pin: '', active: true },
  // === Workshop: Technician ===
  { id: uid(), name: 'Nguyen Hoang Phuc',      role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Nguyen Anh Duc',         role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Nguyen Van Cuong',       role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Vu Duc Hanh',            role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Luong Van Hai',          role: 'ktv', pin: '', active: true },
  // === Workshop: 2 thanh vien moi ===
  { id: uid(), name: 'Le Quoc Khiem',          role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Le Minh Hieu',           role: 'ktv', pin: '', active: true },
  // === Engineering (Pham Van Huy va Le Van Quang da co o Workshop, khong lap lai) ===
  { id: uid(), name: 'Pham Tu',                role: 'ktv', pin: '', active: true },
  { id: uid(), name: 'Pham Do',                role: 'ktv', pin: '', active: true },
  // === Customs & Logistic / Procurement ===
  { id: uid(), name: 'Tran Quyen',             role: 'warehouse', pin: '', active: true },
  { id: uid(), name: 'Dao Dung',               role: 'warehouse', pin: '', active: true },
  { id: uid(), name: 'Luong Thu',              role: 'warehouse', pin: '', active: true },
  { id: uid(), name: 'Le Quoc Dat',            role: 'warehouse', pin: '1111', active: true },
  // === Sales ===
  { id: uid(), name: 'Tran Thi Dao Binh',      role: 'sales', pin: '', active: true },
  { id: uid(), name: 'Nguyen Thi Van Anh',     role: 'sales', pin: '', active: true },
  { id: uid(), name: 'Chu Thao Nguyen',        role: 'sales', pin: '', active: true },
  { id: uid(), name: 'Bui Duc Nam',            role: 'sales', pin: '', active: true },
  // === Bidding ===
  { id: uid(), name: 'Nguyen Lan',             role: 'sales', pin: '', active: true },
  { id: uid(), name: 'Nguyen Trang',           role: 'sales', pin: '', active: true },
  { id: uid(), name: 'Duong Nhu',              role: 'sales', pin: '', active: true },
  { id: uid(), name: 'Nguyen Tuan',            role: 'sales', pin: '', active: true },
  // === Admin accounts ===
  { id: uid(), name: 'Admin 1', role: 'admin', pin: 'mermaid123', active: true },
  { id: uid(), name: 'Admin 2', role: 'admin', pin: 'mermaid123', active: true },
  { id: uid(), name: 'Admin 3', role: 'admin', pin: 'mermaid123', active: true },
]

export const JOBS: Job[] = [
  { id: 1, job_code: 'WO26-0392', customer: 'PV Trans',     vessel: 'MV Ocean Star', location: 'Bãi 1', status: 'open', eta: '2026-09-01', etd: '2026-09-20' },
  { id: 2, job_code: 'WO26-0617', customer: 'Vietsovpetro', vessel: 'MV Sea Dragon', location: 'Bãi 2', status: 'open', eta: '2026-09-10', etd: '2026-10-05' },
  { id: 3, job_code: 'WO26-0758', customer: 'PTSC Marine',  vessel: 'MV Blue Whale', location: 'Bãi 3', status: 'open', eta: '2026-09-15', etd: '2026-10-12' },
]

export const ROLLS: RollTracking[] = [
  { id: 1, material_code: 'PF06060002',     roll_id: 'PF-2026-01',  total_length: 400, used_length: 128, status: 'active', started_at: '2026-08-01' },
  { id: 2, material_code: 'YUL-SP-3-008-1', roll_id: 'YUL-2026-01', total_length: 500, used_length: 36,  status: 'active', started_at: '2026-08-05' },
  { id: 3, material_code: 'CN-190321',      roll_id: 'CN-2026-01',  total_length: 900, used_length: 169, status: 'active', started_at: '2026-08-10' },
]

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// In-memory mutable state for demo
export const store = {
  materials: [...MATERIALS],
  logs: [] as ConsumableLog[],
  movements: [] as Movement[],
  vouchers: [] as Voucher[],
  voucherItems: [] as any[],
  rolls: [...ROLLS],
  rollCuts: [] as RollCut[],
  nextLogId: 1,
  nextMovId: 1,
  nextVoucherId: 1,
  nextVoucherItemId: 1,
  nextRollCutId: 1,

  getMaterial(code: string) {
    return this.materials.find(m => m.code === code)
  },

  addLog(userId: number, materialCode: string, qty: number, jobCode: string, notes?: string, timestamp?: string): ConsumableLog {
    const log: ConsumableLog = {
      id: this.nextLogId++,
      user_id: userId,
      material_code: materialCode,
      qty,
      job_code: jobCode,
      timestamp: timestamp ?? new Date().toISOString(),
      notes: notes ?? null,
    }
    this.logs.push(log)

    const mat = this.getMaterial(materialCode)
    if (mat) {
      mat.closing_qty = Number(mat.closing_qty) - qty

      this.movements.push({
        id: this.nextMovId++,
        source_type: 'consumable_log',
        source_id: log.id,
        date: today(),
        code: materialCode,
        description: mat.description_vi ?? mat.description,
        unit: mat.unit,
        receipt: 0,
        issue: qty,
        job_code: jobCode,
        vessel: null,
        user_id: userId,
        user_name: USERS.find(u => u.id === userId)?.name ?? null,
        created_at: timestamp ?? new Date().toISOString(),
      })
    }
    return log
  },

  getTodayLogs() {
    const t = today()
    return this.logs.filter(l => l.timestamp.startsWith(t))
  },
}
