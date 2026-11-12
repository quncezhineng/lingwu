-- LingWu 对话分享（Supabase）建表脚本
--
-- 用途：把「分享为链接」生成的公开页面存进 Supabase，让分享链接不再依赖本地数据库。
-- 使用：在 Supabase 控制台的 SQL Editor 里粘贴运行，或用 `supabase db push` 执行。
--
-- 为什么要单独的持久层：
--   本地数据目录（DATA_DIR）用的是嵌入式 PGlite，历史上出现过多次被判损坏后
--   整体重建（.lingwu/postgres.corrupt-*），每次重建都会让已经发出去的分享链接
--   永久失效。分享是「对外承诺长期有效」的链接，因此改为 Supabase 为主、本地为兜底：
--   服务端写入时双写，读取时本地未命中再回表，命中后回填本地。
--
-- 安全约定：
--   1. 写入只走服务端 service_role 密钥（绕过 RLS），客户端不直接插入；
--   2. 读取放开给 anon / authenticated —— 分享本身就是公开内容，id 由 12 字节
--      随机数生成（16 字符 base64url），无法枚举，也不需要登录；
--   3. 不开放 update / delete 策略：任何客户端都改不动、删不掉别人的分享。

-- ============================================================================
-- 1. 分享表 lingwu_shares
--    id 与本地 records 表共用同一套编码，URL 路径段直接就是主键。
-- ============================================================================
create table if not exists public.lingwu_shares (
  id text primary key,
  -- 创建者（Supabase 用户 id，或单一访问密钥模式下的 local-user）。
  owner text not null,
  -- 用户提问；会话首条就是助手回复时为空串。
  question text not null default '',
  -- 助手回复的原始 Markdown，服务端与前端各自渲染。
  answer text not null,
  created_at timestamptz not null default now()
);

alter table public.lingwu_shares enable row level security;

-- 只读放行：收件人未登录也要能读到正文。
drop policy if exists lingwu_shares_public_read on public.lingwu_shares;
create policy lingwu_shares_public_read
  on public.lingwu_shares
  for select
  to anon, authenticated
  using (true);

grant select on public.lingwu_shares to anon, authenticated;

-- 按时间倒序列出近期分享（清理过期数据、排查问题都用得上）。
create index if not exists lingwu_shares_created_at_idx
  on public.lingwu_shares (created_at desc);

comment on table public.lingwu_shares is
  '灵悟对话分享：公开只读，写入仅通过服务端 service_role。';
