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
-- material_code KHONG rang buoc khoa ngoai: cho phep nhap tay ma/ten
-- hang tuy y (khong bat buoc co san trong danh muc materials)
create table voucher_items (
  id            serial primary key,
  voucher_id    int references vouchers(id) on delete cascade,
  material_code text,
  description   text,
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
  user_id     int references users(id),
  user_name   text,   -- luu ten luc ghi nhan, de bao cao khong doi khi doi ten sau nay
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

-- =====================================================================
--  RPC: confirm_voucher - duyệt phiếu IN/OUT trong MỘT transaction
--
--  Trước đây client (src/lib/api.ts) ghi tay từng lệnh rời rạc cho mỗi
--  dòng hàng: insert movements, rồi update materials.closing_qty, cuối
--  cùng update vouchers.status. Không có transaction bao ngoài, nên lỗi
--  giữa chừng để lại phiếu vẫn 'draft' trong khi kho đã bị trừ một phần
--  -- bấm "Xác nhận & Trừ kho" lần nữa là ghi trùng toàn bộ.
--
--  Hàm này giữ NGUYÊN ngữ nghĩa cũ, chỉ đổi ba điểm:
--    1. Cả khối chạy trong một transaction: hoặc xong hết, hoặc không
--       ghi gì.
--    2. SELECT ... FOR UPDATE khóa phiếu, chặn hai người duyệt cùng lúc.
--    3. closing_qty = closing_qty +/- q là phép cộng nguyên tử, thay cho
--       đọc-rồi-ghi-đè (hai người thao tác cùng lúc sẽ mất một lần trừ).
-- =====================================================================
create or replace function confirm_voucher(p_voucher_id int)
returns vouchers
language plpgsql
as $$
declare
  v            vouchers%rowtype;
  it           record;
  q            numeric;
  creator_name text;
  n_items      int;
begin
  select * into v from vouchers where id = p_voucher_id for update;
  if not found then
    raise exception 'Không tìm thấy phiếu';
  end if;
  if v.status = 'confirmed' then
    raise exception 'Phiếu đã được duyệt trước đó';
  end if;

  select count(*) into n_items from voucher_items where voucher_id = p_voucher_id;
  if n_items = 0 then
    raise exception 'Phiếu chưa có dòng hàng';
  end if;

  -- Tên người thực hiện: ưu tiên tên trong bảng users, không có thì lấy
  -- ô receiver của phiếu. Ghi thẳng vào movements để báo cáo cũ không
  -- đổi khi sau này user đổi tên.
  select u.name into creator_name from users u where u.id = v.created_by;
  creator_name := coalesce(creator_name, v.receiver);

  for it in
    select vi.*,
           m.description    as m_description,
           m.description_vi as m_description_vi,
           m.unit           as m_unit
      from voucher_items vi
      left join materials m on m.code = vi.material_code
     where vi.voucher_id = p_voucher_id
     order by vi.id
  loop
    q := coalesce(it.qty_actual, it.qty_theory, 0);

    -- Bỏ qua dòng thiếu mã hoặc số lượng <= 0, đúng như bản JS cũ.
    continue when it.material_code is null or it.material_code = '' or q <= 0;

    insert into movements (
      source_type, source_id, date, code, description, unit,
      receipt, issue, job_code, vessel, user_id, user_name
    ) values (
      'voucher', v.id, v.date, it.material_code,
      coalesce(nullif(it.m_description, ''),
               nullif(it.m_description_vi, ''),
               nullif(it.description, '')),
      coalesce(nullif(it.unit, ''), nullif(it.m_unit, '')),
      case when v.type = 'IN' then q else 0 end,
      case when v.type = 'IN' then 0 else q end,
      v.job_code, v.vessel, v.created_by, creator_name
    );

    -- Mã không có trong materials thì lệnh này không chạm dòng nào,
    -- giữ đúng hành vi cũ (guard `if (mat)` bên JS).
    update materials
       set closing_qty = closing_qty + case when v.type = 'IN' then q else -q end
     where code = it.material_code;
  end loop;

  update vouchers set status = 'confirmed' where id = p_voucher_id
  returning * into v;

  return v;
end;
$$;

grant execute on function confirm_voucher(int) to anon, authenticated;

-- =====================================================================
--  RPC: log_roll_cut - ghi một lần cắt cuộn trong MỘT transaction
--
--  Bản cũ ở client ghi 4 lệnh rời rạc: insert roll_cuts, update
--  roll_tracking.used_length, update materials.closing_qty, insert
--  movements. Cả used_length lẫn closing_qty đều cập nhật kiểu
--  đọc-rồi-ghi-đè, nên hai KTV cắt cùng một cuộn cùng lúc sẽ mất một
--  lần ghi: cuộn bị ghi nhận thiếu số mét đã dùng.
--
--  Hàm này giữ nguyên ngữ nghĩa cũ, chỉ đổi:
--    1. Một transaction cho cả 4 lệnh.
--    2. SELECT ... FOR UPDATE khóa cuộn.
--    3. used_length và closing_qty cộng trừ nguyên tử.
--
--  Ba khác biệt CÓ CHỦ Ý so với nhánh Supabase cũ, đều là chỗ nhánh đó
--  lệch với nhánh mock; nay thống nhất theo nhánh mock:
--    - Không tìm thấy cuộn: báo "Không tìm thấy cuộn <id>" thay vì để
--      lỗi thô của PostgREST lọt ra.
--    - user_name: nếu client không truyền thì tra bảng users.
--    - date: lấy theo giờ Việt Nam ở phía server, thay vì ngày local
--      của máy tablet (đồng hồ tablet sai thì ghi sai ngày).
-- =====================================================================
create or replace function log_roll_cut(
  p_roll_id     text,
  p_user_id     int,
  p_job_code    text,
  p_length_used numeric,
  p_user_name   text default null
)
returns jsonb
language plpgsql
as $$
declare
  r         roll_tracking%rowtype;
  m         materials%rowtype;
  new_used  numeric;
  remaining numeric;
  finished  boolean;
  uname     text;
begin
  if p_length_used is null or p_length_used <= 0 then
    raise exception 'Số mét cắt phải lớn hơn 0';
  end if;

  select * into r from roll_tracking where roll_id = p_roll_id for update;
  if not found then
    raise exception 'Không tìm thấy cuộn %', p_roll_id;
  end if;

  insert into roll_cuts (roll_id, user_id, job_code, length_used)
  values (p_roll_id, p_user_id, p_job_code, p_length_used);

  new_used  := coalesce(r.used_length, 0) + p_length_used;
  remaining := coalesce(r.total_length, 0) - new_used;
  finished  := remaining <= 0;

  -- Cộng nguyên tử. status quay lại 'active' khi chưa hết cuộn, đúng
  -- như bản cũ.
  update roll_tracking
     set used_length = coalesce(used_length, 0) + p_length_used,
         status      = case when finished then 'finished' else 'active' end
   where roll_id = p_roll_id;

  -- Chỉ trừ kho VÀ ghi movements khi mã vật tư của cuộn có thật trong
  -- danh mục - khác confirm_voucher, nơi movements luôn được ghi.
  if r.material_code is not null then
    select * into m from materials where code = r.material_code;
    if found then
      update materials
         set closing_qty = closing_qty - p_length_used
       where code = r.material_code;

      uname := coalesce(p_user_name, (select name from users where id = p_user_id));

      insert into movements (
        source_type, source_id, date, code, description, unit,
        receipt, issue, job_code, vessel, user_id, user_name
      ) values (
        'roll', r.id,
        (now() at time zone 'Asia/Ho_Chi_Minh')::date,
        r.material_code,
        coalesce(nullif(m.description, ''), nullif(m.description_vi, '')),
        m.unit, 0, p_length_used, p_job_code, null, p_user_id, uname
      );
    end if;
  end if;

  -- remaining KHÔNG kẹp về 0, giữ đúng bản Supabase cũ.
  return jsonb_build_object('remaining', remaining, 'finished', finished);
end;
$$;

grant execute on function log_roll_cut(text, int, text, numeric, text) to anon, authenticated;
