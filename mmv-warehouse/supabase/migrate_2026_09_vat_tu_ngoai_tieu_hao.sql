-- =====================================================================
--  MMV WAREHOUSE - Migration: quản lý vật tư ngoài tiêu hao
--  Ngày: 2026-09-18
--
--  DÙNG FILE NÀY cho database ĐANG CHẠY. KHÔNG chạy lại schema.sql:
--  file đó mở đầu bằng "drop table ... cascade" nên sẽ xoá sạch dữ liệu
--  thật. schema.sql chỉ dành cho lần dựng database mới.
--
--  Chạy trong: Supabase Dashboard -> SQL Editor -> New query -> Run
--  Chạy MỘT LẦN. Chạy lại cũng không sao (mọi lệnh đều if not exists /
--  create or replace), nhưng không cần.
--
--  Sau file này, chạy tiếp seed_materials.sql để nạp 1501 mã vật tư.
--
--  Nội dung:
--    1. materials: thêm location, mat_type, remark, stock_status
--       + ràng buộc category in ('consumable','roll','general')
--    2. bảng stock_moves - admin nhập/xuất thẳng vật tư ngoài tiêu hao
--    3. RPC log_stock_move (mới)
--    4. RPC log_consumable  - chặn mã ngoài tiêu hao
--    5. RPC confirm_voucher - chặn non-admin duyệt phiếu có mã ngoài tiêu hao
--
--  Ba hàm ở mục 3-5 là bản sao NGUYÊN VĂN từ schema.sql. schema.sql là
--  bản chuẩn; nếu sau này sửa hàm thì sửa ở đó.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. materials - bốn cột lấy nguyên từ Material.xlsx
-- ---------------------------------------------------------------------
alter table materials add column if not exists location     text;
alter table materials add column if not exists mat_type     text;
alter table materials add column if not exists remark       text;
alter table materials add column if not exists stock_status text;

comment on column materials.location     is 'Cột Location trong Material.xlsx - vị trí kệ';
comment on column materials.mat_type     is 'Cột Type trong Material.xlsx - nhóm/hãng: VIK, ZODI, RFD...';
comment on column materials.remark       is 'Cột Remark trong Material.xlsx';
comment on column materials.stock_status is 'Cột Status trong Material.xlsx: fast | normal | low | no';
comment on column materials.category     is 'Quyền nhập/xuất: consumable (KTV) | roll (màn Cắt cuộn) | general (chỉ admin)';

-- Mã nào đang có category lạ thì đưa về 'general' trước khi siết ràng buộc,
-- nếu không lệnh add constraint bên dưới sẽ báo lỗi và dừng cả migration.
update materials
   set category = 'general'
 where coalesce(category, '') not in ('consumable', 'roll', 'general');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'materials_category_check'
  ) then
    alter table materials
      add constraint materials_category_check
      check (category in ('consumable','roll','general'));
  end if;
end $$;

create index if not exists idx_materials_type on materials(mat_type);

-- ---------------------------------------------------------------------
-- 2. stock_moves - chứng từ gốc cho mỗi lần admin nhập/xuất
-- ---------------------------------------------------------------------
create table if not exists stock_moves (
  id            serial primary key,
  user_id       int references users(id),
  material_code text references materials(code),
  type          text check (type in ('IN','OUT')),
  qty           numeric not null,
  job_code      text,
  vessel        text,
  note          text,
  timestamp     timestamptz default now()
);

create index if not exists idx_smoves_code on stock_moves(material_code);
create index if not exists idx_smoves_ts   on stock_moves(timestamp);

alter table stock_moves enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where tablename = 'stock_moves' and policyname = 'allow_all_stock_moves'
  ) then
    create policy "allow_all_stock_moves" on stock_moves
      for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. RPC log_stock_move (mới)
-- ---------------------------------------------------------------------
create or replace function log_stock_move(
  p_user_id       int,
  p_material_code text,
  p_type          text,
  p_qty           numeric,
  p_job_code      text default null,
  p_vessel        text default null,
  p_note          text default null,
  p_user_name     text default null,
  p_actor_role    text default null
)
returns jsonb
language plpgsql
as $$
declare
  m           materials%rowtype;
  mv          stock_moves%rowtype;
  new_closing numeric;
  warn        text;
begin
  if p_actor_role is not null and p_actor_role <> 'admin' then
    raise exception 'Chỉ admin được nhập/xuất vật tư ngoài tiêu hao';
  end if;
  if p_type is null or p_type not in ('IN', 'OUT') then
    raise exception 'Loại phiếu phải là IN hoặc OUT';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Số lượng phải lớn hơn 0';
  end if;

  select * into m from materials where code = p_material_code for update;
  if not found then
    raise exception 'Không tìm thấy mã vật tư %', p_material_code;
  end if;

  insert into stock_moves (user_id, material_code, type, qty, job_code, vessel, note)
  values (p_user_id, p_material_code, p_type, p_qty, p_job_code, p_vessel, p_note)
  returning * into mv;

  update materials
     set closing_qty = closing_qty + case when p_type = 'IN' then p_qty else -p_qty end
   where code = p_material_code
  returning closing_qty into new_closing;

  insert into movements (
    source_type, source_id, date, code, description, unit,
    receipt, issue, job_code, vessel, user_id, user_name, created_at
  ) values (
    'stock', mv.id,
    (mv.timestamp at time zone 'Asia/Ho_Chi_Minh')::date,
    p_material_code,
    coalesce(nullif(m.description, ''), nullif(m.description_vi, '')),
    m.unit,
    case when p_type = 'IN' then p_qty else 0 end,
    case when p_type = 'IN' then 0 else p_qty end,
    p_job_code, p_vessel, p_user_id,
    coalesce(p_user_name, (select name from users where id = p_user_id)),
    mv.timestamp
  );

  if new_closing < 0 then
    warn := 'TỒN ÂM: ' || coalesce(nullif(m.description_vi, ''), m.description, p_material_code)
            || ' còn ' || new_closing || ' ' || coalesce(m.unit, '');
  end if;

  return jsonb_build_object(
    'move', to_jsonb(mv),
    'closing_qty', new_closing,
    'warning', warn
  );
end;
$$;

grant execute on function log_stock_move(int, text, text, numeric, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC log_consumable - chặn mã ngoài tiêu hao
-- ---------------------------------------------------------------------
create or replace function log_consumable(
  p_user_id       int,
  p_material_code text,
  p_qty           numeric,
  p_job_code      text,
  p_notes         text default null,
  p_user_name     text default null,
  p_occurred_at   timestamptz default null
)
returns jsonb
language plpgsql
as $$
declare
  m           materials%rowtype;
  lg          consumable_logs%rowtype;
  ts          timestamptz;
  new_closing numeric;
  warn        text;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'Số lượng phải lớn hơn 0';
  end if;

  ts := coalesce(p_occurred_at, now());

  select * into m from materials where code = p_material_code for update;
  if not found then
    raise exception 'Không tìm thấy mã vật tư %', p_material_code;
  end if;

  -- Chỉ vật tư tiêu hao mới đi qua đường này. Vật tư 'general' (hàng
  -- ngoài tiêu hao) do admin nhập/xuất ở màn /stock, 'roll' thì ở màn
  -- Cắt cuộn. Chặn ngay tại đây để một lệnh gọi sai - dù từ UI cũ còn
  -- cache hay từ khoá anon - không lặng lẽ trừ kho hàng ngoài tiêu hao.
  if coalesce(m.category, 'general') <> 'consumable' then
    raise exception 'Mã % không phải vật tư tiêu hao (nhóm %). Chỉ admin nhập/xuất được ở màn Nhập/Xuất kho.',
      p_material_code, coalesce(m.category, 'general');
  end if;

  insert into consumable_logs (user_id, material_code, qty, job_code, notes, timestamp)
  values (p_user_id, p_material_code, p_qty, p_job_code, p_notes, ts)
  returning * into lg;

  update materials
     set closing_qty = closing_qty - p_qty
   where code = p_material_code
  returning closing_qty into new_closing;

  insert into movements (
    source_type, source_id, date, code, description, unit,
    receipt, issue, job_code, vessel, user_id, user_name, created_at
  ) values (
    'consumable', lg.id,
    (lg.timestamp at time zone 'Asia/Ho_Chi_Minh')::date,
    p_material_code,
    coalesce(nullif(m.description, ''), nullif(m.description_vi, '')),
    m.unit, 0, p_qty, p_job_code, null, p_user_id,
    coalesce(p_user_name, (select name from users where id = p_user_id)),
    ts
  );

  -- Tồn âm được phép, chỉ cảnh báo - đúng như bản cũ.
  if new_closing < 0 then
    warn := 'TỒN ÂM: ' || coalesce(m.description_vi, '') || ' còn '
            || new_closing || ' ' || coalesce(m.unit, '');
  end if;

  return jsonb_build_object(
    'log', to_jsonb(lg),
    'closing_qty', new_closing,
    'warning', warn
  );
end;
$$;

grant execute on function log_consumable(int, text, numeric, text, text, text, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC confirm_voucher - chặn non-admin duyệt phiếu có mã ngoài tiêu hao
--
--  Đổi chữ ký hàm (thêm p_actor_role) nên phải drop bản cũ trước.
-- ---------------------------------------------------------------------
drop function if exists confirm_voucher(int);
drop function if exists confirm_voucher(int, text);

create or replace function confirm_voucher(p_voucher_id int, p_actor_role text default null)
returns jsonb
language plpgsql
as $$
declare
  v            vouchers%rowtype;
  outsiders    text[] := '{}';
  it           record;
  q            numeric;
  creator_name text;
  n_items      int;
  skipped      text[] := '{}';
  created      text[] := '{}';
  parts        text[] := '{}';
  warn         text;
  m_desc       text;
  m_desc_vi    text;
  m_unit       text;
  nm           text;
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

  -- Vật tư ngoài tiêu hao: chỉ admin được duyệt. p_actor_role do client
  -- truyền vào (app đăng nhập bằng bảng users, không dùng Supabase Auth
  -- - xem chú thích RLS ở trên), nên đây là lớp chặn thứ hai, không
  -- phải lớp duy nhất; lớp thứ nhất nằm ở src/lib/api.ts. Bỏ trống
  -- p_actor_role thì giữ nguyên hành vi cũ, không kiểm.
  if p_actor_role is not null and p_actor_role <> 'admin' then
    select array_agg(distinct vi.material_code order by vi.material_code)
      into outsiders
      from voucher_items vi
      join materials m on m.code = vi.material_code
     where vi.voucher_id = p_voucher_id
       and coalesce(m.category, 'general') <> 'consumable';

    if array_length(outsiders, 1) > 0 then
      raise exception 'Phiếu có % mã ngoài vật tư tiêu hao (%), chỉ admin được duyệt.',
        array_length(outsiders, 1), array_to_string(outsiders, ', ');
    end if;
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
           m.unit           as m_unit,
           (m.code is not null) as has_material
      from voucher_items vi
      left join materials m on m.code = vi.material_code
     where vi.voucher_id = p_voucher_id
     order by vi.id
  loop
    q := coalesce(it.qty_actual, it.qty_theory, 0);

    -- Dòng thiếu mã hoặc số lượng <= 0: vẫn bỏ qua như cũ, nhưng nay
    -- có tên trong warning thay vì biến mất không dấu vết.
    if it.material_code is null or btrim(it.material_code) = '' or q <= 0 then
      skipped := skipped || coalesce(
        nullif(btrim(it.material_code), ''),
        nullif(btrim(it.description), ''),
        'dòng #' || it.id
      );
      continue;
    end if;

    m_desc    := it.m_description;
    m_desc_vi := it.m_description_vi;
    m_unit    := it.m_unit;

    if not it.has_material then
      nm := coalesce(nullif(btrim(it.description), ''), it.material_code);

      -- on conflict: hai dòng cùng một mã lạ trong cùng phiếu thì dòng
      -- sau không làm hỏng transaction.
      insert into materials (
        code, description, description_vi, unit, category,
        min_stock, closing_qty, lead_time_days, has_expiry, expiry_date, unit_price
      ) values (
        it.material_code, nm, nm, nullif(btrim(it.unit), ''), 'consumable',
        0, 0, 0, false, null, 0
      )
      on conflict (code) do nothing;

      if found then
        created := created || it.material_code;
      end if;

      m_desc    := nm;
      m_desc_vi := nm;
      m_unit    := nullif(btrim(it.unit), '');
    end if;

    insert into movements (
      source_type, source_id, date, code, description, unit,
      receipt, issue, job_code, vessel, user_id, user_name
    ) values (
      'voucher', v.id, v.date, it.material_code,
      coalesce(nullif(m_desc, ''),
               nullif(m_desc_vi, ''),
               nullif(it.description, '')),
      coalesce(nullif(it.unit, ''), nullif(m_unit, '')),
      case when v.type = 'IN' then q else 0 end,
      case when v.type = 'IN' then 0 else q end,
      v.job_code, v.vessel, v.created_by, creator_name
    );

    -- Mã nào cũng đã có trong materials ở bước trên, nên lệnh này luôn
    -- chạm đúng một dòng: sổ cái và tồn kho không còn lệch nhau nữa.
    update materials
       set closing_qty = closing_qty + case when v.type = 'IN' then q else -q end
     where code = it.material_code;
  end loop;

  update vouchers set status = 'confirmed' where id = p_voucher_id
  returning * into v;

  if array_length(skipped, 1) > 0 then
    parts := parts || ('Bỏ qua ' || array_length(skipped, 1)
             || ' dòng thiếu mã hoặc số lượng <= 0: ' || array_to_string(skipped, ', '));
  end if;
  if array_length(created, 1) > 0 then
    parts := parts || ('Tự tạo ' || array_length(created, 1)
             || ' mã chưa có trong danh mục, cần bổ sung thông tin và kiểm lại tồn: '
             || array_to_string(created, ', '));
  end if;
  warn := nullif(array_to_string(parts, ' · '), '');

  return jsonb_build_object('voucher', to_jsonb(v), 'warning', warn);
end;
$$;

grant execute on function confirm_voucher(int, text) to anon, authenticated;

-- =====================================================================
--  Kiểm tra sau khi chạy
-- =====================================================================
--  select column_name from information_schema.columns
--   where table_name = 'materials'
--     and column_name in ('location','mat_type','remark','stock_status');
--  -> phải ra đủ 4 dòng
--
--  select proname, pronargs from pg_proc
--   where proname in ('log_stock_move','log_consumable','confirm_voucher');
--  -> log_stock_move 9 / log_consumable 7 / confirm_voucher 2
