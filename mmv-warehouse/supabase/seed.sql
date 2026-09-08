-- =====================================================================
--  MMV WAREHOUSE - Seed data
--  Chạy SAU schema.sql (Supabase -> SQL Editor -> Run)
-- =====================================================================

-- ---------------------------------------------------------------------
-- MATERIALS - 32 mã tiêu hao
-- code | description(EN) | description_vi | unit | category | min_stock | closing_qty | unit_price
-- ---------------------------------------------------------------------
insert into materials (code, description, description_vi, unit, category, min_stock, closing_qty, unit_price, has_expiry, expiry_date) values
('MMV1003021',    'Wool gloves',            'Bao tay len',            'đôi',  'consumable', 20, 53,  8000,   false, null),
('MMV2009008',    'Fabric gloves',          'Bao tay vải',            'đôi',  'consumable', 20, 51,  7000,   false, null),
('MMV1003020',    'Rubber gloves',          'Bao tay cao su',         'đôi',  'consumable', 20, 239, 12000,  false, null),
('MMV100090049',  'Face mask',              'Khẩu trang',             'cái',  'consumable', 50, 250, 2000,   false, null),
('MMV09090057',   'Dish scrubber',          'Miếng rửa chén',         'cái',  'consumable', 20, 35,  3000,   false, null),
('MMV-OMO',       'Detergent powder',       'Xà bông',                'bịch', 'consumable', 10, 12,  35000,  false, null),
('MMV-VIM',       'Bleach cleaner',         'Nước tẩy',               'chai', 'consumable', 10, 8,   28000,  true,  '2027-03-01'),
('MMV10120080',   'Raft wrap film',         'Màng cuốn bè',           'cuộn', 'consumable', 10, 5,   90000,  false, null),
('MMV1111003',    'White rags',             'Giẻ trắng',              'kg',   'consumable', 20, 40,  25000,  false, null),
('MMV10120066',   'Colored rags',           'Giẻ màu',                'kg',   'consumable', 20, 22,  20000,  false, null),
('MMV10040026',   'Spray paint',            'Sơn xịt',                'chai', 'consumable', 20, 18,  55000,  true,  '2027-06-01'),
('MMV10040025',   'Super glue',             'Keo con chó',            'lọ',   'consumable', 20, 9,   9000,   true,  '2026-12-01'),
('MMV09090056',   'Fine sandpaper',         'Giấy nhám mịn',          'tờ',   'consumable', 30, 120, 4000,   false, null),
('MMV09090059',   'Coarse sandpaper',       'Giấy nhám thô',          'm',    'consumable', 20, 60,  15000,  false, null),
('MMV1003017',    'Paint brush 2"',         'Cọ quét sơn 2"',         'cái',  'consumable', 15, 15,  18000,  false, null),
('MMV1003016',    'Paint brush 1"',         'Cọ quét sơn 1"',         'cái',  'consumable', 15, 14,  14000,  false, null),
('MMV10120082',   'Boat seam sealant',      'Keo ron xuồng',          'tuýp', 'consumable', 10, 6,   120000, true,  '2027-01-01'),
('MMV09090055',   'WD-40 rust remover',     'Tẩy gỉ WD-40',           'chai', 'consumable', 15, 11,  85000,  true,  '2027-08-01'),
('MMV09090060',   'Brake cleaner spray',    'Xịt bố thắng',           'chai', 'consumable', 15, 7,   65000,  true,  '2026-11-01'),
('MMV110912',     'FE maintenance sticker', 'Tem bảo dưỡng bình chữa cháy', 'cái', 'consumable', 20, 3, 5000, false, null),
('MMV10040030',   'Nylon bag',              'Bịch nylon',             'kg',   'consumable', 20, 14,  30000,  false, null),
('STAPE09050042', 'Cloth tape 5cm',         'Băng keo vải 5cm',       'cuộn', 'consumable', 15, 9,   22000,  false, null),
('STAPE09050042-1','Cloth tape 10cm',       'Băng keo vải 10cm',      'cuộn', 'consumable', 15, 10,  35000,  false, null),
('RTAPE1209003',  'Teflon tape',            'Bao keo non',            'cuộn', 'consumable', 20, 25,  6000,   false, null),
('MMV1003012',    'Paper tape 5cm',         'Băng keo giấy 5cm',      'cuộn', 'consumable', 10, 1,   18000,  false, null),
('MMV10060040',   'Paper tape 2.5cm',       'Băng keo giấy 2.5cm',    'cuộn', 'consumable', 10, 0,   14000,  false, null),
('ETAPE09050041', 'Insulating tape',        'Băng keo điện',          'cuộn', 'consumable', 20, 56,  9000,   false, null),
('DSTAPE1209003', 'Double-side tape',       'Băng keo 2 mặt',         'cuộn', 'consumable', 10, 1,   25000,  false, null),
('MMV10050033',   'Clear tape 5cm',         'Băng keo trong 5cm',     'cuộn', 'consumable', 20, 32,  12000,  false, null),
('MMV100100052',  'Clear tape 2.5cm',       'Băng keo trong 2.5cm',   'cuộn', 'consumable', 20, 36,  10000,  false, null),
('MMV1003011',    'Brown tape 5cm',         'Băng keo vàng',          'cuộn', 'consumable', 20, 24,  11000,  false, null),
('MMV-SIKA140',   'Sikaflex / Silicon',     'Sikaflex / Silicon',     'tuýp', 'consumable', 10, 4,   180000, true,  '2027-02-01');

-- ---------------------------------------------------------------------
-- MATERIALS - 3 mã cuộn dài (category = 'roll')
-- ---------------------------------------------------------------------
insert into materials (code, description, description_vi, unit, category, min_stock, closing_qty, unit_price) values
('PF06060002',     'Plastic foil (4m)',            'Màng nhựa (cuộn 4m)',       'mtr', 'roll', 50, 272, 22000),
('YUL-SP-3-008-1', 'Retro-reflective tape',        'Băng phản quang',           'mtr', 'roll', 50, 464, 45000),
('CN-190321',      'Solas Reflective Tape (china)','Băng phản quang China (45m)','m',   'roll', 50, 731, 38000);

-- ---------------------------------------------------------------------
-- USERS - Toàn bộ công ty MMV (trừ kế toán), theo Org Chart
-- ---------------------------------------------------------------------
insert into users (name, role, pin, active) values
-- Workshop Manager
('Nguyen Khac Vinh',      'manager',   '2222', true),
-- Workshop: Senior Engineer / Supervisor
('Nguyen Thanh Vinh',     'ktv', '', true),
('Pham Van Huy',          'ktv', '', true),
('Le Van Quang',          'ktv', '', true),
('Tran Van Thuc',         'ktv', '', true),
('Le Hong Tu',            'ktv', '', true),
('Cao Minh Tuan',         'ktv', '', true),
('Le Duy Thang',          'ktv', '', true),
('Dao Ngan Lam',          'ktv', '', true),
-- Workshop: Engineer
('Duong Manh Hien',       'ktv', '', true),
('Nguyen Truc Tai',       'ktv', '', true),
('Le Truong Hau',         'ktv', '', true),
('Tran Xuan Hop',         'ktv', '', true),
('Nguyen Ngoc Minh',      'ktv', '', true),
-- Workshop: Technician
('Nguyen Hoang Phuc',     'ktv', '', true),
('Nguyen Anh Duc',        'ktv', '', true),
('Nguyen Van Cuong',      'ktv', '', true),
('Vu Duc Hanh',           'ktv', '', true),
('Luong Van Hai',         'ktv', '', true),
-- Workshop: 2 thành viên mới
('Le Quoc Khiem',         'ktv', '', true),
('Le Minh Hieu',          'ktv', '', true),
-- Engineering
('Pham Tu',               'ktv', '', true),
('Pham Huy',              'ktv', '', true),
('Pham Do',               'ktv', '', true),
('Le Quang',              'ktv', '', true),
-- Customs & Logistic / Procurement / Warehouse
('Tran Quyen',            'warehouse', '', true),
('Dao Dung',              'warehouse', '', true),
('Luong Thu',             'warehouse', '', true),
('Le Quoc Dat',           'warehouse', '1111', true),
-- Sales
('Tran Thi Dao Binh',     'sales', '', true),
('Nguyen Thi Van Anh',    'sales', '', true),
('Chu Thao Nguyen',       'sales', '', true),
('Bui Duc Nam',           'sales', '', true),
-- Bidding
('Nguyen Lan',            'sales', '', true),
('Nguyen Trang',          'sales', '', true),
('Duong Nhu',             'sales', '', true),
('Nguyen Tuan',           'sales', '', true),
-- Admin
('Admin 1', 'admin', 'mermaid123', true),
('Admin 2', 'admin', 'mermaid123', true),
('Admin 3', 'admin', 'mermaid123', true);

-- ---------------------------------------------------------------------
-- JOBS - 3 lệnh công việc mẫu
-- ---------------------------------------------------------------------
insert into jobs (job_code, customer, vessel, location, status, eta, etd) values
('WO26-0392', 'PV Trans',        'MV Ocean Star',  'Bãi 1', 'open', '2026-09-01', '2026-09-20'),
('WO26-0617', 'Vietsovpetro',    'MV Sea Dragon',  'Bãi 2', 'open', '2026-09-10', '2026-10-05'),
('WO26-0758', 'PTSC Marine',     'MV Blue Whale',  'Bãi 3', 'open', '2026-09-15', '2026-10-12');

-- ---------------------------------------------------------------------
-- ROLL_TRACKING - cuộn đang cắt dần (active)
-- ---------------------------------------------------------------------
insert into roll_tracking (material_code, roll_id, total_length, used_length, status) values
('PF06060002',     'PF-2026-01',  400, 128, 'active'),
('YUL-SP-3-008-1', 'YUL-2026-01', 500, 36,  'active'),
('CN-190321',      'CN-2026-01',  900, 169, 'active');
