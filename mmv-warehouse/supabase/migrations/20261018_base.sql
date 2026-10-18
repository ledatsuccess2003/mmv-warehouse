-- Fresh-project bootstrap ONLY. Deliberately no DROP, demo data or credentials.
-- Run in one transaction together with the approval migration before granting UI access.
create table if not exists public.materials (
 id serial primary key, code text unique not null, description text, description_vi text,
 unit text, category text default 'general' check(category in ('consumable','roll','general')),
 min_stock numeric default 0,closing_qty numeric default 0,lead_time_days integer default 60,
 has_expiry boolean default false,expiry_date date,unit_price numeric default 0,
 location text,mat_type text,remark text,stock_status text,created_at timestamptz default now()
);
create table if not exists public.users (
 id serial primary key,name text not null,role text check(role in ('ktv','warehouse','manager','sales','admin')),
 pin text,active boolean default true
);
create table if not exists public.jobs (
 id serial primary key,job_code text unique not null,customer text,vessel text,location text,
 status text default 'open',eta date,etd date
);
create table if not exists public.movements (
 id serial primary key,source_type text,source_id integer,date date,code text,description text,unit text,
 receipt numeric default 0,issue numeric default 0,job_code text,vessel text,
 user_id integer references public.users(id),user_name text,created_at timestamptz default now()
);
create table if not exists public.consumable_logs (
 id serial primary key,user_id integer references public.users(id),material_code text references public.materials(code),
 qty numeric not null,job_code text references public.jobs(job_code),timestamp timestamptz default now(),notes text
);
alter table public.materials enable row level security;
alter table public.users enable row level security;
alter table public.jobs enable row level security;
alter table public.movements enable row level security;
alter table public.consumable_logs enable row level security;
revoke all on public.materials,public.users,public.jobs,public.movements,public.consumable_logs from public,anon,authenticated;
