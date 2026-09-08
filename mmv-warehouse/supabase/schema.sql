-- =====================================================================
--  MMV WAREHOUSE - PostgreSQL schema (Supabase)
--  Chạy trong: Supabase Dashboard -> SQL Editor -> New query -> Run
-- =====================================================================

-- Xoá bảng cũ (nếu chạy lại) - theo thứ tự phụ thuộc
drop table if exists roll_cuts cascade;
drop table if exists roll_tracking cascade;
drop table if exists movements cascade;
drop table if exists voucher_items cascade;
drop table if exists vouchers cascade;
drop table if exists consumable_logs cascade;
drop table if exists jobs cascade;
drop table if exists users cascade;
drop table if exists materials cascade;

-- ---------------------------------------------------------------------
-- 1. materials - danh mục vật tư
-- ---------------------------------------------------------------------
create table materials (
  id            serial primary key,
  code          text unique not null,
  description   text,
  description_vi text,
  unit          text,
  category      text default 'general',
  min_stock     int default 20,
  closing_qty   numeric default 0,
  lead_time_days int default 60,
  has_expiry    boolean default false,
  expiry_date   date,            -- HSD (dùng cho cảnh báo hạn sử dụng)
  unit_price    numeric default 0, -- đơn giá (dùng tính cost theo JOB)
  created_at    timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 2. jobs - lệnh công việc (Work Order)
-- ---------------------------------------------------------------------
create table jobs (
  id        serial primary key,
  job_code  text unique not null,
  customer  text,
  vessel    text,
  location  text,
  status    text default 'open',
  eta       date,
  etd       date
);

-- ---------------------------------------------------------------------
-- 3. users - người dùng nội bộ
-- ---------------------------------------------------------------------
create table users (
  id     serial primary key,
  name   text not null,
  role   text check (role in ('ktv','warehouse','manager','sales','admin')),
  pin    text default '0000',
  active boolean default true
);

-- ---------------------------------------------------------------------
-- 4. consumable_logs - nhật ký KTV lấy vật tư tiêu hao
-- ---------------------------------------------------------------------
create table consumable_logs (
  id            serial primary key,
  user_id       int references users(id),
  material_code text references materials(code),
  qty           numeric not null,
  job_code      text references jobs(job_code),
  timestamp     timestamptz default now(),
  notes         text
);

-- ---------------------------------------------------------------------
-- 5. vouchers - phiếu xuất/nhập kho
-- ---------------------------------------------------------------------
create table vouchers (
  id         serial primary key,
  voucher_no text unique not null,
  type       text check (type in ('IN','OUT')),
  date       date not null,
  receiver   text,
  supplier   text,
  vessel     text,
  job_code   text,
  status     text default 'draft',   -- draft | confirmed
  created_by int references users(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 6. voucher_items - dòng hàng của phiếu
-- ---------------------------------------------------------------------
create table voucher_items (
  id            serial primary key,
  voucher_id    int references vouchers(id) on delete cascade,
  material_code text references materials(code),
  qty_theory    numeric,
  qty_actual    numeric,
  unit          text,
  remarks       text
);

-- ---------------------------------------------------------------------
-- 7. movements - sổ nhật ký xuất nhập tổng hợp (sheet Movement)
-- ---------------------------------------------------------------------
create table movements (
  id          serial primary key,
  source_type text,   -- 'voucher' | 'consumable' | 'roll'
  source_id   int,
  date        date,
  code        text,
  description text,
  unit        text,
  receipt     numeric default 0,
  issue       numeric default 0,
  job_code    text,
  vessel      text,
  created_at  timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 8. roll_tracking - theo dõi cuộn dài cắt dần
-- ---------------------------------------------------------------------
create table roll_tracking (
  id            serial primary key,
  material_code text references materials(code),
  roll_id       text unique,
  total_length  numeric,
  used_length   numeric default 0,
  status        text default 'active',   -- active | finished
  started_at    timestamptz default now()
);

-- ---------------------------------------------------------------------
-- 9. roll_cuts - lịch sử cắt cuộn
-- ---------------------------------------------------------------------
create table roll_cuts (
  id          serial primary key,
  roll_id     text references roll_tracking(roll_id),
  user_id     int references users(id),
  job_code    text,
  length_used numeric,
  timestamp   timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Indexes cho truy vấn nhanh
-- ---------------------------------------------------------------------
create index idx_clogs_user     on consumable_logs(user_id);
create index idx_clogs_job      on consumable_logs(job_code);
create index idx_clogs_ts       on consumable_logs(timestamp);
create index idx_movements_date on movements(date);
create index idx_movements_code on movements(code);
create index idx_movements_job  on movements(job_code);
create index idx_vitems_voucher on voucher_items(voucher_id);
create index idx_vouchers_no    on vouchers(voucher_no);
create index idx_materials_cat  on materials(category);

-- =====================================================================
--  ROW LEVEL SECURITY
--  App nội bộ, đăng nhập bằng bảng users (không dùng Supabase Auth),
--  nên mở quyền cho khóa anon. SIẾT LẠI khi lên production.
-- =====================================================================
alter table materials       enable row level security;
alter table jobs            enable row level security;
alter table users           enable row level security;
alter table consumable_logs enable row level security;
alter table vouchers        enable row level security;
alter table voucher_items   enable row level security;
alter table movements       enable row level security;
alter table roll_tracking   enable row level security;
alter table roll_cuts       enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'materials','jobs','users','consumable_logs','vouchers',
    'voucher_items','movements','roll_tracking','roll_cuts'
  ]
  loop
    execute format(
      'create policy "allow_all_%1$s" on %1$s for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
