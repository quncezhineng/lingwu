-- LingWu 用户账号（Supabase）建表脚本
--
-- 用途：创建灵悟账号体系依赖的三张表、头像私有存储桶，以及「注册即建档案」的触发器。
-- 使用：在 Supabase 控制台的 SQL Editor 里粘贴运行，或用 `supabase db push` 执行。
--
-- 命名一致性（重要）：本脚本里的索引名、函数名都**刻意与线上库保持一致**。
-- lingwu_*，本脚本同步对齐，避免「重跑脚本时因名字不同而多建一套重复索引、
-- 或把触发器改绑到另一个同名函数」。
-- 已知差异（本脚本未涵盖、线上另有）：索引 lingwu_audit_logs_action_idx /
-- lingwu_resources_type_idx，以及三张表上的 select_own 只读 RLS 策略。
--
-- 说明：
--   1. 灵悟把所有 Supabase 读写都走服务端 service_role 密钥（绕过 RLS），
--      用户端不直接访问 Supabase，因此下面的表启用 RLS 后默认对用户端完全隐藏。
--   2. 邮箱直接来自 auth.users，不单独存表；昵称/简介/头像统一由 user_profiles 维护。

-- ============================================================================
-- 1. 用户资料表 user_profiles
--    头像、昵称、简介统一由这张表维护；邮箱来自 auth.users，不在这里存。
-- ============================================================================
create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  bio text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- ============================================================================
-- 2. 操作行为日志表 lingwu_audit_logs
--    记录注册/登录/退出/远程下线等安全相关事件；旁路写入，失败不影响主流程。
-- ============================================================================
create table if not exists public.lingwu_audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  resource_type text,
  resource_id text,
  metadata jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.lingwu_audit_logs enable row level security;

create index if not exists lingwu_audit_logs_user_created_idx
  on public.lingwu_audit_logs (user_id, created_at desc);

-- ============================================================================
-- 3. 业务资源索引表 lingwu_resources
--    记录「某资源属于某用户」，用于快速定位归属；旁路写入。
-- ============================================================================
create table if not exists public.lingwu_resources (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  resource_type text not null,
  resource_id text not null,
  created_at timestamptz not null default now()
);

alter table public.lingwu_resources enable row level security;

create unique index if not exists lingwu_resources_user_id_resource_type_resource_id_key
  on public.lingwu_resources (user_id, resource_type, resource_id);

-- ============================================================================
-- 4. 头像私有存储桶 user-avatars
--    头像存于私有桶，前端无法直接读取；服务端用 service_role 签名后下发临时地址。
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('user-avatars', 'user-avatars', false)
on conflict (id) do nothing;

-- ============================================================================
-- 5. 「注册即建档案」触发器
--    Supabase Auth 新建用户后，自动在 user_profiles 里补一行：
--    昵称按 nickname → display_name → 邮箱前缀 依次回退，并写入头像地址；
--    已存在则补齐缺失字段（不覆盖用户后来自己改过的值）。
--    注意：函数体内容刻意与线上库逐字符一致（含 coalesce 的单行写法），
--    这样重跑本脚本才是真正的 no-op；改动函数体请先确认线上是否需要同步。
-- ============================================================================
create or replace function public.user_profiles_handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, nickname, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set nickname = coalesce(excluded.nickname, public.user_profiles.nickname),
        avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.user_profiles_handle_new_user();
