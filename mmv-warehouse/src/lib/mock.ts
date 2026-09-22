import type {
  Material, MaterialCategory, Job, User, ConsumableLog, Voucher, Movement,
  RollTracking, RollCut, StockMove, VoucherType,
} from './types'

type MatExtra = Partial<Pick<Material, 'location' | 'mat_type' | 'remark' | 'stock_status'>>

let _matId = 1
function mat(code: string, desc: string, vi: string, unit: string, cat: MaterialCategory, min: number, qty: number, price: number, expiry?: string, extra?: MatExtra): Material {
  return {
    id: _matId++, code, description: desc, description_vi: vi, unit, category: cat,
    min_stock: min, closing_qty: qty, lead_time_days: 14, has_expiry: !!expiry,
    expiry_date: expiry ?? null, unit_price: price,
    location: extra?.location ?? null, mat_type: extra?.mat_type ?? null,
    remark: extra?.remark ?? null, stock_status: extra?.stock_status ?? null,
    created_at: '2026-01-01',
  }
}

/** Vat tu 'general' - hang ngoai tieu hao, chi admin nhap/xuat. Khong co
 *  ten tieng Viet, khong co don gia, min_stock = 0 (khong theo doi dat
 *  hang lai) - dung nhu du lieu that trong Material.xlsx. */
function gen(code: string, desc: string, unit: string | null, qty: number, extra?: MatExtra): Material {
  return {
    id: _matId++, code, description: desc, description_vi: null, unit, category: 'general',
    min_stock: 0, closing_qty: qty, lead_time_days: 60, has_expiry: false,
    expiry_date: null, unit_price: 0,
    location: extra?.location ?? null, mat_type: extra?.mat_type ?? null,
    remark: extra?.remark ?? null, stock_status: extra?.stock_status ?? null,
    created_at: '2026-01-01',
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

  // === Vat tu ngoai tieu hao (category 'general') ===
  // MAU 48 ma, KHONG phai toan bo danh muc. Danh muc that co 1466 ma
  // 'general', nap bang supabase/seed_materials.sql. O day chi giu mot
  // mau du trai khap cac nhom (VIK, ZODI, RFD, FE, DSB...) de chay thu
  // man Nhap/Xuat kho khi khong co .env - nhet ca 1466 ma vao file nay
  // se nam trong bundle production ma khong ai dung toi.
  gen('VIK1055229','Do not pull label','pcs',5,{ location: 'B3.1.2', mat_type: 'VIK', stock_status: 'fast' }),
  gen('VIK1039204','Label - Flag State Approval','pcs',98,{ location: 'B3.1.2', mat_type: 'VIK', stock_status: 'fast' }),
  gen('VIK1005168','Weather sealing for round container Varim type','m',46,{ location: 'B4.1', mat_type: 'VIK', stock_status: null }),
  gen('YMTABF','AB Foam, Yamato','set',46,{ location: null, mat_type: null, stock_status: null }),
  gen('G-11N-090-1','Valve G-11N-090-1 for CO2 ylinder','pcs',12,{ location: null, mat_type: null, stock_status: null }),
  gen('COC0703004','Cartridge 550g CO2 for MPG-25','Nos',8,{ location: null, mat_type: null, stock_status: null }),
  gen('Z63334','Zip tie breaking strength 9dan','pcs',275,{ location: 'F2.3.3', mat_type: 'ZODI', stock_status: null }),
  gen('Z63724','Cylind weding foam 4 to 6.7L','pcs',51,{ location: 'F4.3.2', mat_type: 'ZODI', stock_status: 'low' }),
  gen('Z63725','Cylind weding foam 8 to 20L','pcs',49,{ location: 'F4.3.3', mat_type: 'ZODI', stock_status: 'low' }),
  gen('RFD41423001','Container strap & crimp (48 pcs/bag) "BA41-P01-007"','pcs',500,{ location: 'D2.3.1', mat_type: 'RFD', stock_status: 'normal' }),
  gen('RFD20958031','Label "D"','pcs',87,{ location: 'D4.1.1', mat_type: 'RFD', stock_status: 'fast' }),
  gen('RFD41295001','Container strap & crimp (48 pcs/bag) White on clear','pcs',132,{ location: 'D2.3.2', mat_type: 'RFD', stock_status: 'normal' }),
  gen('F070700029','AFFF 3% A FOAM "FOMTEC" IN 25 LTR DRUM','Ltr',912,{ location: 'WS', mat_type: 'FE', stock_status: null }),
  gen('EXTCO020005','5 kg CO2 Fire Extinguisher "EEC-5E1"','pcs',57,{ location: 'WS', mat_type: 'FE', stock_status: 'fast' }),
  gen('COC0703003','Cartridge 110g CO2 for Dry powder 6kg','pcs',47,{ location: 'I2.1', mat_type: 'FE', stock_status: 'fast' }),
  gen('DSB00805180','DSB ID Container c/w card','pcs',5,{ location: 'D3.3.1', mat_type: 'DSB', stock_status: 'no' }),
  gen('DSB00107430','PAINTER SEAL FOR CONTAINER MK','pcs',1,{ location: 'D.2.2.1', mat_type: 'DSB', stock_status: 'low' }),
  gen('DSB00202030','Canopy inner fabric','m',1,{ location: 'D1.3', mat_type: 'DSB', stock_status: 'no' }),
  gen('YUL-SP-1-115-1','Rubber foam band','pcs',13,{ location: 'B7.1.1', mat_type: 'CN LR', stock_status: 'low' }),
  gen('HN-HRU','China HRU','pcs',1,{ location: 'B7.2.1', mat_type: 'CN LR', stock_status: 'low' }),
  gen('YUL-SP-3-022-8','Non-return inflation valve','pcs',1,{ location: 'B7.1.3', mat_type: 'CN LR', stock_status: 'low' }),
  gen('PG07070012','Pressure gauge ELSA','pcs',1,{ location: 'F2.2.3', mat_type: 'BA', stock_status: 'low' }),
  gen('PG07070013','MSA, BA pressure gauge P/N 711366','pcs',3,{ location: 'F2.2.2', mat_type: 'BA', stock_status: 'low' }),
  gen('MTL3335413','O-ring" Draeger" (M18)','pcs',3,{ location: 'F2.2.2', mat_type: 'BA', stock_status: 'low' }),
  gen('FJK62043','Rubber grommet','pcs',5,{ location: 'E3.3.2', mat_type: 'FJK', stock_status: 'low' }),
  gen('FJK62044','Rubber grommet','pcs',5,{ location: 'E3.3.2', mat_type: 'FJK', stock_status: 'low' }),
  gen('FJK62036','Firing cable J-031','pcs',14,{ location: 'E3.3.3', mat_type: 'FJK', stock_status: 'low' }),
  gen('VIK1001594','Cartridge 38g CO2 for Lifejacket','pcs',146,{ location: 'I2.1', mat_type: 'LJ', stock_status: 'low' }),
  gen('VIK1001593','Cartridge 34g CO2 for Lifejacket','pcs',1,{ location: 'I2.1', mat_type: 'LJ', stock_status: 'normal' }),
  gen('VIK1001609','Automatic-holder for 6100230','pcs',1,{ location: 'E3.1.3', mat_type: 'LJ', stock_status: 'discontined' }),
  gen('LB-2207001','Rubber cap-oriental','pcs',2,{ location: 'C4.2', mat_type: 'LB', stock_status: 'low' }),
  gen('NOR132618','Diaphragm for hydraulic release, without holes','pcs',5,{ location: 'B8.2', mat_type: 'LB', stock_status: 'low' }),
  gen('LB-2207003','Log card-oriental','pcs',9,{ location: 'C4.2', mat_type: 'LB', stock_status: 'low' }),
  gen('VIK1001205','Comet, plastic container, watertight','pcs',1,{ location: 'E2.3', mat_type: 'PYROS', stock_status: 'low' }),
  gen('HF1301002','Hand Flare, HUAHAI-China (6)','pcs',31,{ location: 'Container', mat_type: 'PYROS', stock_status: 'fast' }),
  gen('SS1301003','Buoyant smoke Signal, HUAHAI-China (2)','pcs',68,{ location: 'Container', mat_type: 'PYROS', stock_status: 'fast' }),
  gen('BPANA0406.1','Dry cell (Big), 24pcs/box','pcs',94,{ location: 'J1.2', mat_type: 'LR', stock_status: 'fast' }),
  gen('S060800001','Scissors','pcs',1,{ location: 'A3.4.2', mat_type: 'LR', stock_status: 'no' }),
  gen('DCB0703007','Dry cell (medium), 24pcs/box','pcs',65,{ location: 'J1.2', mat_type: 'LR', stock_status: 'fast' }),
  gen('DON1010','Warning label','pcs',1,{ location: 'C4.1', mat_type: 'DN', stock_status: 'fast' }),
  gen('DON1008','Patent label','pcs',2,{ location: 'C4.1', mat_type: 'DN', stock_status: 'normal' }),
  gen('DON1002','Donut recert label','pcs',17,{ location: 'C4.1', mat_type: 'DN', stock_status: 'normal' }),
  gen('EVAL00559','Lifebuoy solas 2.5kg - EVAL','pcs',10,{ location: 'UPSTAIRS', mat_type: 'LBU', stock_status: 'low' }),
  gen('EVAL00558','Lifebuoy solas 4kg - EVAL','pcs',0,{ location: 'UPSTAIRS', mat_type: 'LBU', stock_status: null }),
  gen('CB-LLO10','Orange lifebuoy floating line 10mtrs','pcs',0,{ location: null, mat_type: 'LBU', stock_status: null }),
  gen('UNI-BA36-L01-093','DL LAUNCH POSTER','pcs',3,{ location: 'E4.2', mat_type: 'UNI', stock_status: 'low' }),
  gen('UNI53481001','53481001 SURVITEC LABEL','pcs',158,{ location: 'E4.2', mat_type: 'UNI', stock_status: 'low' }),
  gen('UNI-ESR-L02-015','“1” LABEL','pcs',0,{ location: 'E4.2', mat_type: 'UNI', stock_status: 'low' }),
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
  stockMoves: [] as StockMove[],
  nextLogId: 1,
  nextMovId: 1,
  nextVoucherId: 1,
  nextVoucherItemId: 1,
  nextRollCutId: 1,
  nextStockMoveId: 1,

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

  /** Admin nhap/xuat thang vat tu ngoai tieu hao. Ba lenh ghi giong het
   *  nhanh Supabase (RPC log_stock_move): chung tu goc -> cong/tru ton
   *  -> ghi so cai. Xem CLAUDE.md muc "Stock/ledger logic lives in the
   *  client". */
  addStockMove(
    userId: number, materialCode: string, type: VoucherType, qty: number,
    opts?: { jobCode?: string | null; vessel?: string | null; note?: string | null }
  ): { move: StockMove; closing_qty: number } | null {
    const mat = this.getMaterial(materialCode)
    if (!mat) return null

    const ts = new Date().toISOString()
    const move: StockMove = {
      id: this.nextStockMoveId++,
      user_id: userId,
      material_code: materialCode,
      type,
      qty,
      job_code: opts?.jobCode ?? null,
      vessel: opts?.vessel ?? null,
      note: opts?.note ?? null,
      timestamp: ts,
    }
    this.stockMoves.push(move)

    mat.closing_qty = Number(mat.closing_qty) + (type === 'IN' ? qty : -qty)

    this.movements.push({
      id: this.nextMovId++,
      source_type: 'stock',
      source_id: move.id,
      date: today(),
      code: materialCode,
      description: mat.description ?? mat.description_vi,
      unit: mat.unit,
      receipt: type === 'IN' ? qty : 0,
      issue: type === 'IN' ? 0 : qty,
      job_code: opts?.jobCode ?? null,
      vessel: opts?.vessel ?? null,
      user_id: userId,
      user_name: USERS.find(u => u.id === userId)?.name ?? null,
      created_at: ts,
    })

    return { move, closing_qty: mat.closing_qty }
  },
}
