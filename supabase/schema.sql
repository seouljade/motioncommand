-- MotionCommand 훈련 기록 테이블
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요.

create table if not exists public.mc_attempts (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  rank         text not null check (char_length(rank) <= 10),
  name         text not null check (char_length(name) between 1 and 20),
  mission      text not null check (mission in ('M1','M2','M3','M4')),
  success      boolean not null,
  score        smallint not null check (score between 0 and 100),
  duration_s   real not null,
  e1 smallint not null default 0,  -- 제스처 오인식(기대와 다른 명령)
  e2 smallint not null default 0,  -- 유지 시간 미달
  e3 smallint not null default 0,  -- 공중 전원차단 시도
  e4 smallint not null default 0,  -- 훈련 구역 이탈
  e5 smallint not null default 0,  -- 시간 초과
  e6 smallint not null default 0,  -- 손 인식 이탈
  confusions   jsonb not null default '[]'::jsonb,  -- [{expected, got}]
  input_mode   text not null default 'camera' check (input_mode in ('camera','keyboard')),
  device       text,
  track        jsonb  -- 사후검토 3D 재생용 비행 궤적·수신호 기록 (카메라 영상은 저장하지 않음)
);

-- 이전 버전에서 만든 테이블에도 재생용 칸 추가
alter table public.mc_attempts add column if not exists track jsonb;
alter table public.mc_attempts drop constraint if exists mc_attempts_track_size;
alter table public.mc_attempts add constraint mc_attempts_track_size check (track is null or pg_column_size(track) < 200000);

create index if not exists mc_attempts_created_idx on public.mc_attempts (created_at desc);
create index if not exists mc_attempts_trainee_idx on public.mc_attempts (rank, name);

-- 행 단위 보안(RLS): 누구나 기록 추가·조회 가능, 수정·삭제는 불가(대시보드에서 관리자만)
alter table public.mc_attempts enable row level security;

drop policy if exists "mc insert" on public.mc_attempts;
create policy "mc insert" on public.mc_attempts
  for insert to anon, authenticated with check (true);

drop policy if exists "mc select" on public.mc_attempts;
create policy "mc select" on public.mc_attempts
  for select to anon, authenticated using (true);

-- 주의: anon 키로 모든 기록을 읽을 수 있으므로 군번·소속 등 식별정보는 저장하지 않습니다.
