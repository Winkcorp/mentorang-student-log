-- =============================================================
-- Phase 2 — 인증 프로필 + 역할(Role)
--
--  * auth.users 생성 시 DB 트리거(handle_new_user)로 profiles 자동 생성
--    (애플리케이션 코드에서 수동 생성 금지)
--  * role 기본값 null = 승인 대기 — admin이 수동으로 부여
--  * profiles만 이 시점에 RLS 활성화 (역할 게이트가 동작해야 하므로).
--    나머지 테이블 RLS는 Phase 4에서 활성화.
-- =============================================================

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text check (role in ('admin', 'mentor', 'parent')),
  mentor_id  uuid references public.mentors (id) on delete set null,
  parent_id  uuid references public.parents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- role과 연결 FK 정합성: mentor면 mentor_id, parent면 parent_id가 있어야 함
  constraint profiles_role_link check (
    role is null
    or (role = 'admin')
    or (role = 'mentor' and mentor_id is not null)
    or (role = 'parent' and parent_id is not null)
  )
);

create index idx_profiles_mentor_id on public.profiles (mentor_id);
create index idx_profiles_parent_id on public.profiles (parent_id);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------
-- auth.users 생성 → profiles 자동 생성 트리거
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -------------------------------------------------------------
-- 역할 조회 헬퍼 (security definer — RLS 정책 안에서 재귀 없이 사용,
-- Phase 4의 테이블별 RLS 정책에서도 재사용)
-- -------------------------------------------------------------
create or replace function public.get_my_role()
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(public.get_my_role() = 'admin', false);
$$;

create or replace function public.my_mentor_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select mentor_id from public.profiles where id = auth.uid();
$$;

create or replace function public.my_parent_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select parent_id from public.profiles where id = auth.uid();
$$;

-- -------------------------------------------------------------
-- profiles RLS
--  * 본인: 자기 row 조회만 가능 (role 셀프 변경 불가 — update 정책 없음)
--  * admin: 전체 조회/수정 가능 (role 부여는 admin만)
--  * insert는 트리거(security definer)로만 이루어지므로 정책 불필요
-- -------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_admin_select"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
