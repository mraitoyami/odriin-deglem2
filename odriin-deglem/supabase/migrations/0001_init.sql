-- =====================================================================
-- Өдрийн дэглэм · 51 дүгээр сургууль — database schema
-- Supabase → SQL Editor-т бүтнээр нь нэг удаа ажиллуулна.
--
-- Аюулгүй байдлын зарчим:
--  * Бүх хүснэгтэд Row Level Security идэвхтэй.
--  * Role-ийг (сурагч/багш/эцэг эх) хэрэглэгч өөрөө өөрчилж чадахгүй. Зөвхөн админ
--    (scripts/admin.mjs эсвэл SQL Editor, service role) онооно.
--  * Оноо, шагналын тооцоог серверийн функц хийнэ. Клиент оноо "бичих" боломжгүй.
-- =====================================================================

create type public.app_role as enum ('student', 'teacher', 'guardian', 'admin');
create type public.task_status as enum ('done', 'partial', 'help');
create type public.task_category as enum ('study', 'home', 'health', 'rest', 'interest');
create type public.tx_kind as enum ('redeem', 'adjust');

-- Улаанбаатарын цагаар өнөөдрийн огноо
create or replace function public.today_ub() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Ulaanbaatar')::date
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

-- =====================================================================
-- Хүснэгтүүд
-- =====================================================================

-- Хэрэглэгч бүрийн профайл. role = null бол эрх олгогдоогүй (нэвтэрч чадахгүй).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role,
  full_name text not null default '' check (char_length(full_name) <= 80),
  username text unique check (username ~ '^[a-z0-9._-]{2,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Сурагчийн нэмэлт мэдээлэл ба тохиргоо (багш засна)
create table public.student_profiles (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  class_name text check (char_length(class_name) <= 40),
  goal_pct int not null default 80 check (goal_pct between 10 and 100),
  screen_limit_min int not null default 90 check (screen_limit_min between 0 and 600),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.student_teacher_assignments (
  student_id uuid not null references public.profiles (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, teacher_id)
);

create table public.parent_student_assignments (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  category public.task_category not null,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 200),
  minutes int not null default 0 check (minutes between 0 and 180),
  slot text not null default 'after' check (slot in ('morning', 'school', 'after', 'evening')),
  points int not null default 5 check (points between 0 and 100),   -- «хийсэн» үед өгөх оноо
  sort int not null default 0,
  active boolean not null default true,                              -- устгахгүй, түр зогсооно
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id)
);

-- Даалгаврын өдөр тутмын төлөв. (даалгавар, өдөр) бүрт ганц мөр → давхар оноо гарахгүй.
create table public.task_completions (
  task_id uuid not null,
  student_id uuid not null,
  log_date date not null,
  status public.task_status not null,
  points int not null default 0,              -- trigger тогтооно: done бол даалгаврын оноо, бусад үед 0
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (task_id, log_date),
  foreign key (task_id, student_id) references public.tasks (id, student_id) on delete cascade
);

-- Өдрийн бүртгэл: өдөр бүр тусдаа мөр (нэг өдөр нөгөөгөө дарахгүй)
create table public.daily_logs (
  student_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  note text not null default '' check (char_length(note) <= 500),           -- зөвхөн сурагч өөрөө бичнэ
  screen_minutes int check (screen_minutes between 0 and 960),             -- гараар оруулна
  movement_minutes int check (movement_minutes between 0 and 600),
  offscreen text[] not null default '{}',
  chore text not null default '' check (char_length(chore) <= 160),
  hygiene_morning boolean not null default false,
  hygiene_evening boolean not null default false,
  hygiene_reminded boolean not null default false,
  bed_time time,
  wake_time time,
  mood text check (mood in ('great', 'ok', 'tired', 'upset')),
  sleep_note text not null default '' check (char_length(sleep_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (student_id, log_date)
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  start_time time,
  period text not null default '' check (char_length(period) <= 80),
  activity text not null check (char_length(activity) between 1 and 160),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.day_goals (
  student_id uuid not null references public.profiles (id) on delete cascade,
  log_date date not null,
  goal text not null check (char_length(goal) between 1 and 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  primary key (student_id, log_date)
);

create table public.teacher_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  log_date date not null default public.today_ub(),
  body text not null check (char_length(body) between 1 and 1000),
  share_with_parent boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Шагнал: бодит худалдан авалт биш, эцэг эх/багштай тохиролцох урамшуулал
create table public.rewards (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 160),
  icon text not null default 'gift' check (icon in ('glove', 'ball', 'socks', 'timer', 'palette', 'gift', 'star')),
  cost int not null check (cost between 1 and 10000),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Онооны гүйлгээ: шагнал авсан (сөрөг) эсвэл багшийн тохируулга (±). Засагдахгүй, зөвхөн нэмэгдэнэ.
create table public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  kind public.tx_kind not null,
  points int not null check (points <> 0),
  reward_id uuid references public.rewards (id) on delete set null,
  title text not null default '',
  icon text not null default 'gift',
  note text not null default '' check (char_length(note) <= 160),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check ((kind = 'redeem' and points < 0) or kind = 'adjust')
);

-- Хэрэглэгчийн тохиргоо (одоогоор өдөр/шөнийн горим)
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'light' check (theme in ('light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.student_teacher_assignments (teacher_id);
create index on public.parent_student_assignments (student_id);
create index on public.tasks (student_id);
create index on public.task_completions (student_id, log_date);
create index on public.schedule_items (student_id);
create index on public.teacher_notes (student_id, created_at);
create index on public.rewards (student_id);
create index on public.reward_transactions (student_id);

-- updated_at автоматаар
do $$
declare t text;
begin
  foreach t in array array['profiles','student_profiles','tasks','task_completions','daily_logs','schedule_items',
                           'day_goals','teacher_notes','rewards','user_settings'] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- =====================================================================
-- Эрх шалгах функцууд (RLS-д ашиглана). Бүгд auth.uid()-д тулгуурлана.
-- =====================================================================

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function public.is_self(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = sid and id = auth.uid() and role = 'student')
$$;

create or replace function public.is_teacher_of(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.student_teacher_assignments a join public.profiles p on p.id = a.teacher_id
    where a.student_id = sid and a.teacher_id = auth.uid() and p.role = 'teacher')
$$;

create or replace function public.is_parent_of(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.parent_student_assignments a join public.profiles p on p.id = a.parent_id
    where a.student_id = sid and a.parent_id = auth.uid() and p.role = 'guardian')
$$;

create or replace function public.can_read_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_self(sid) or public.is_teacher_of(sid) or public.is_parent_of(sid) or public.is_admin()
$$;

-- Сүүлийн 7 хоногийн бүртгэлийг л засна
create or replace function public.editable_day(d date) returns boolean
language sql stable set search_path = public as $$
  select d between public.today_ub() - 7 and public.today_ub()
$$;

-- =====================================================================
-- Trigger-ууд
-- =====================================================================

-- Шинэ auth хэрэглэгчид профайл үүсгэнэ. Role-ийг metadata-аас АВАХГҮЙ (хэрэглэгч өөрөө бичиж чадна).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'full_name', 80), ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Хэн өөрчилснийг сервер тогтооно
create or replace function public.stamp_updated_by() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_by := coalesce(auth.uid(), new.updated_by); return new; end $$;
create trigger stamp_by before insert or update on public.task_completions for each row execute function public.stamp_updated_by();
create trigger stamp_by before insert or update on public.daily_logs for each row execute function public.stamp_updated_by();
create trigger stamp_by before insert or update on public.day_goals for each row execute function public.stamp_updated_by();

-- Багшийн тэмдэглэлийн зохиогчийг хуурамчаар бичихээс сэргийлнэ
create or replace function public.stamp_author() returns trigger
language plpgsql set search_path = public as $$
begin if auth.uid() is not null then new.author_id := auth.uid(); end if; return new; end $$;
create trigger stamp_author before insert or update on public.teacher_notes for each row execute function public.stamp_author();

-- Өдрийн тэмдэглэлийг (note) зөвхөн сурагч өөрөө бичнэ; эцэг эх бусад талбарыг бөглөнө
create or replace function public.guard_daily_note() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_self(new.student_id) then
    new.note := case when tg_op = 'UPDATE' then old.note else '' end;
  end if;
  return new;
end $$;
create trigger guard_note before insert or update on public.daily_logs for each row execute function public.guard_daily_note();

-- Даалгаврын оноог тэмдэглэх үед хадгална (багш дараа нь оноог өөрчилсөн ч түүх өөрчлөгдөхгүй)
create or replace function public.stamp_completion_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.points := case when new.status = 'done'
    then coalesce((select points from public.tasks where id = new.task_id), 0) else 0 end;
  return new;
end $$;
create trigger stamp_points before insert or update on public.task_completions
  for each row execute function public.stamp_completion_points();

-- Оноо = даалгаврын оноо + гүйлгээ (шагнал −, тохируулга ±)
create or replace function public.points_raw(sid uuid) returns int
language sql stable security definer set search_path = public as $$
  select (select coalesce(sum(points), 0) from public.task_completions where student_id = sid)
       + (select coalesce(sum(points), 0) from public.reward_transactions where student_id = sid)
$$;

-- Шагналд зарцуулсан оноотой даалгаврыг буцаахыг хориглоно (оноо сөрөг болохгүй)
create or replace function public.guard_balance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.points_raw(old.student_id) < 0 then
    raise exception 'Энэ даалгаврын оноог шагналд зарцуулсан тул буцаах боломжгүй.' using errcode = 'P0001';
  end if;
  return null;
end $$;
create trigger guard_balance after update or delete on public.task_completions
  for each row execute function public.guard_balance();

-- =====================================================================
-- Эрх (grant) ба Row Level Security
-- =====================================================================

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

grant update (class_name, goal_pct, screen_limit_min) on public.student_profiles to authenticated;
grant insert on public.tasks to authenticated;
grant update (category, title, description, minutes, slot, points, sort, active) on public.tasks to authenticated;
grant insert, update, delete on public.task_completions to authenticated;
grant insert, update on public.daily_logs to authenticated;
grant insert, update, delete on public.schedule_items, public.day_goals, public.teacher_notes to authenticated;
grant insert on public.rewards to authenticated;
grant update (title, description, icon, cost, active, sort) on public.rewards to authenticated;
grant insert, update on public.user_settings to authenticated;
-- profiles, assignments, reward_transactions-д хэрэглэгч шууд бичих эрхгүй.

do $$
declare t text;
begin
  foreach t in array array['profiles','student_profiles','student_teacher_assignments','parent_student_assignments',
    'tasks','task_completions','daily_logs','schedule_items','day_goals','teacher_notes','rewards',
    'reward_transactions','user_settings'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- profiles: өөрийгөө, эсвэл унших эрхтэй сурагчаа
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_read_student(id) or public.is_admin());

create policy sp_read on public.student_profiles for select to authenticated using (public.can_read_student(student_id));
create policy sp_teacher_update on public.student_profiles for update to authenticated
  using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));

create policy sta_read on public.student_teacher_assignments for select to authenticated
  using (teacher_id = auth.uid() or public.is_self(student_id) or public.is_admin());
create policy psa_read on public.parent_student_assignments for select to authenticated
  using (parent_id = auth.uid() or public.is_admin());

-- tasks: уншина бүгд, нэмэх/засах зөвхөн хариуцсан багш
create policy tasks_read on public.tasks for select to authenticated using (public.can_read_student(student_id));
create policy tasks_insert on public.tasks for insert to authenticated with check (public.is_teacher_of(student_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));

-- task_completions: зөвхөн сурагч өөрөө, сүүлийн 7 хоногт
create policy tc_read on public.task_completions for select to authenticated using (public.can_read_student(student_id));
create policy tc_insert on public.task_completions for insert to authenticated
  with check (public.is_self(student_id) and public.editable_day(log_date));
create policy tc_update on public.task_completions for update to authenticated
  using (public.is_self(student_id) and public.editable_day(log_date))
  with check (public.is_self(student_id) and public.editable_day(log_date));
create policy tc_delete on public.task_completions for delete to authenticated
  using (public.is_self(student_id) and public.editable_day(log_date));

-- daily_logs: сурагч болон эцэг эх бөглөнө (сүүлийн 7 хоног), багш уншина
create policy dl_read on public.daily_logs for select to authenticated using (public.can_read_student(student_id));
create policy dl_insert on public.daily_logs for insert to authenticated
  with check ((public.is_self(student_id) or public.is_parent_of(student_id)) and public.editable_day(log_date));
create policy dl_update on public.daily_logs for update to authenticated
  using ((public.is_self(student_id) or public.is_parent_of(student_id)) and public.editable_day(log_date))
  with check ((public.is_self(student_id) or public.is_parent_of(student_id)) and public.editable_day(log_date));

-- schedule, day_goals: багш
create policy sch_read on public.schedule_items for select to authenticated using (public.can_read_student(student_id));
create policy sch_insert on public.schedule_items for insert to authenticated with check (public.is_teacher_of(student_id));
create policy sch_update on public.schedule_items for update to authenticated
  using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));
create policy sch_delete on public.schedule_items for delete to authenticated using (public.is_teacher_of(student_id));

create policy goals_read on public.day_goals for select to authenticated using (public.can_read_student(student_id));
create policy goals_insert on public.day_goals for insert to authenticated with check (public.is_teacher_of(student_id));
create policy goals_update on public.day_goals for update to authenticated
  using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));
create policy goals_delete on public.day_goals for delete to authenticated using (public.is_teacher_of(student_id));

-- teacher_notes: багш бичнэ; эцэг эх хуваалцсаныг уншина; сурагч харахгүй
create policy tn_read on public.teacher_notes for select to authenticated
  using (public.is_teacher_of(student_id) or public.is_admin() or (share_with_parent and public.is_parent_of(student_id)));
create policy tn_insert on public.teacher_notes for insert to authenticated
  with check (public.is_teacher_of(student_id) and author_id = auth.uid());
create policy tn_update on public.teacher_notes for update to authenticated
  using (author_id = auth.uid() and public.is_teacher_of(student_id))
  with check (author_id = auth.uid() and public.is_teacher_of(student_id));
create policy tn_delete on public.teacher_notes for delete to authenticated
  using (author_id = auth.uid() and public.is_teacher_of(student_id));

-- rewards: багш удирдана
create policy rw_read on public.rewards for select to authenticated using (public.can_read_student(student_id));
create policy rw_insert on public.rewards for insert to authenticated with check (public.is_teacher_of(student_id));
create policy rw_update on public.rewards for update to authenticated
  using (public.is_teacher_of(student_id)) with check (public.is_teacher_of(student_id));

-- reward_transactions: зөвхөн уншина; бичих нь redeem_reward / adjust_points функцээр
create policy rt_read on public.reward_transactions for select to authenticated using (public.can_read_student(student_id));

-- user_settings: зөвхөн өөрийнх
create policy us_read on public.user_settings for select to authenticated using (user_id = auth.uid());
create policy us_insert on public.user_settings for insert to authenticated with check (user_id = auth.uid());
create policy us_update on public.user_settings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
-- Серверийн функцууд (RPC)
-- =====================================================================

-- Нэвтрэх үед сонгосон төрөл бодит эрхтэй таарч буйг шалгана
create or replace function public.verify_login_role(requested public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = requested)
$$;

create or replace function public.points_summary(sid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e int; r int; a int;
begin
  if not public.can_read_student(sid) then raise exception 'Энэ үйлдлийг хийх эрх танд алга.' using errcode = '42501'; end if;
  select coalesce(sum(points), 0) into e from public.task_completions where student_id = sid;
  select coalesce(-sum(points), 0) into r from public.reward_transactions where student_id = sid and kind = 'redeem';
  select coalesce(sum(points), 0) into a from public.reward_transactions where student_id = sid and kind = 'adjust';
  return jsonb_build_object('earned', e, 'spent', r, 'adjusted', a, 'balance', e - r + a);
end $$;

-- Шагнал авах: зөвхөн сурагч өөрөө, оноо хүрэлцэх үед. Давхар дарахаас сэргийлж түгжинэ.
create or replace function public.redeem_reward(rid uuid) returns public.reward_transactions
language plpgsql security definer set search_path = public as $$
declare rw public.rewards; out_row public.reward_transactions;
begin
  select * into rw from public.rewards where id = rid and active;
  if not found then raise exception 'Шагнал олдсонгүй.' using errcode = 'P0001'; end if;
  if not public.is_self(rw.student_id) then raise exception 'Энэ үйлдлийг хийх эрх танд алга.' using errcode = '42501'; end if;
  perform 1 from public.profiles where id = rw.student_id for update;
  if public.points_raw(rw.student_id) < rw.cost then
    raise exception 'Оноо хүрэлцэхгүй байна.' using errcode = 'P0001';
  end if;
  insert into public.reward_transactions (student_id, kind, points, reward_id, title, icon, created_by)
  values (rw.student_id, 'redeem', -rw.cost, rw.id, rw.title, rw.icon, auth.uid()) returning * into out_row;
  return out_row;
end $$;

-- Багшийн онооны тохируулга (жишээ нь алдаа засах). Оноо сөрөг болохгүй.
create or replace function public.adjust_points(sid uuid, delta int, reason text) returns public.reward_transactions
language plpgsql security definer set search_path = public as $$
declare out_row public.reward_transactions;
begin
  if not public.is_teacher_of(sid) then raise exception 'Энэ үйлдлийг хийх эрх танд алга.' using errcode = '42501'; end if;
  if delta = 0 or delta not between -1000 and 1000 then raise exception 'Тохируулга −1000…1000 хооронд, 0-ээс өөр байна.' using errcode = 'P0001'; end if;
  if coalesce(trim(reason), '') = '' then raise exception 'Шалтгаанаа бичнэ үү.' using errcode = 'P0001'; end if;
  perform 1 from public.profiles where id = sid for update;
  if public.points_raw(sid) + delta < 0 then raise exception 'Оноо сөрөг болох тул хасах боломжгүй.' using errcode = 'P0001'; end if;
  insert into public.reward_transactions (student_id, kind, points, title, note, created_by)
  values (sid, 'adjust', delta, 'Багшийн тохируулга', left(trim(reason), 160), auth.uid()) returning * into out_row;
  return out_row;
end $$;

-- 51 дүгээр сургуулийн төлөвлөгөөний анхны даалгавар, хуваарь, шагналыг ачаална (хоосон үед л)
create or replace function public.seed_student_plan(sid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_tasks int := 0; n_sched int := 0; n_rw int := 0;
begin
  if auth.uid() is not null and not (public.is_teacher_of(sid) or public.is_admin()) then
    raise exception 'Энэ үйлдлийг хийх эрх танд алга.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = sid and role = 'student') then
    raise exception 'Сурагч олдсонгүй.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.tasks where student_id = sid) then
    insert into public.tasks (student_id, category, title, description, minutes, slot, points, sort) values
      (sid,'study','Цүнх, хэрэгслээ шалгах','Сургууль явахын өмнө жагсаалтаараа шалга.',5,'morning',5,10),
      (sid,'study','Хичээлдээ оролцох','Багшийн зааврыг сонсоод идэвхтэй оролц.',0,'school',10,20),
      (sid,'study','Монгол хэлний унших-бичих ажил','10–15 минут. Хэцүү бол 5 минутаар хоёр хуваана.',15,'after',10,30),
      (sid,'study','Уншсанаа ойлгох','Уншсан зүйлээсээ 2–3 асуултад хариул.',5,'after',5,40),
      (sid,'home','Эд зүйлсээ байранд нь хураах','Харандаа, зураг, тоглоомоо хайрцагт нь хий.',5,'evening',5,10),
      (sid,'home','Маргаашийн цүнхээ бэлдэх','Ном, дэвтэр, харандаагаа цүнхэндээ хий.',5,'evening',5,20),
      (sid,'home','Гэр бүлдээ туслах','Аяга угаах, ширээ засах зэрэг нэг жижиг ажил.',10,'evening',5,30),
      (sid,'health','Нүүр, гараа угаах','Өглөө сэрээд.',3,'morning',5,10),
      (sid,'health','Шүдээ угаах','Өглөө ба орой.',3,'morning',5,20),
      (sid,'health','Өглөөний цайгаа уух','',15,'morning',5,30),
      (sid,'health','Хангалттай ус уух','Сургууль дээр ч, гэртээ ч.',0,'school',5,40),
      (sid,'health','Оройн ариун цэвэр','Гараа угааж, шүдээ угаана.',5,'evening',5,50),
      (sid,'health','Унтахын өмнө дэлгэцээ унтраах','Унтахаас 45–60 минутын өмнө.',0,'evening',5,60),
      (sid,'rest','Бөмбөгтэй дасгал эсвэл алхалт','15–20 минут хөдөлгөөн.',20,'after',5,10),
      (sid,'rest','Дэлгэцгүй бүтээл','Зураг зурах эсвэл шавраар бүтээл хийх.',25,'after',5,20),
      (sid,'rest','Дэлгэцийн цагаа хянах','Тохирсон цаг дуусахад өөрөө унтраа.',0,'after',5,30),
      (sid,'interest','Хөлбөмбөгийн сэдвээр өгүүлбэр бичих','«Хаалгач бөмбөг барив» гэх мэт 2 өгүүлбэр.',10,'after',5,10),
      (sid,'interest','Газрын зургаас нэр унших','Нэг газрын нэр уншаад чиглэлийг нь хэл.',10,'after',5,20);
    get diagnostics n_tasks = row_count;
  end if;
  if not exists (select 1 from public.schedule_items where student_id = sid) then
    insert into public.schedule_items (student_id, start_time, period, activity, sort) values
      (sid,'07:00','Өглөө сэрснээс сургууль явах хүртэл','Ариун цэвэр, өглөөний цай, хувцаслах, цүнх шалгах',10),
      (sid,'08:00','Сургуулийн цаг','Хичээл, завсарлага, ус уух, хөдөлгөөн',20),
      (sid,'13:30','Сургуулиас ирээд 20–30 минут','Амрах, тайвшрах, ус уух',30),
      (sid,'14:00','15–20 минут','Бөмбөгтэй дасгал, алхалт эсвэл хөдөлгөөнт тоглоом',40),
      (sid,'14:20','10–15 минут','Монгол хэлний унших-бичих богино ажил',50),
      (sid,'14:40','20–30 минут','Зураг зурах, шавар урлал, бүтээл хийх',60),
      (sid,'15:10','5–10 минут','Эд зүйлсээ хураах, маргаашийн цүнх бэлдэх',70),
      (sid,'19:00','Орой','Гэр бүлийн хоол, ярилцах, ариун цэвэр',80),
      (sid,'20:30','Унтахаас 45–60 минутын өмнө','Дэлгэцээ унтраах, тайван амрах, унтах бэлтгэл',90);
    get diagnostics n_sched = row_count;
  end if;
  if not exists (select 1 from public.rewards where student_id = sid) then
    insert into public.rewards (student_id, title, description, icon, cost, sort) values
      (sid,'Хаалгачийн бээлий','Гол шагнал. Эцэг эх/багштай тохиролцож авна.','glove',600,10),
      (sid,'Хөлбөмбөгийн бөмбөг','Эцэг эх/багштай тохиролцож авна.','ball',350,20),
      (sid,'Хөлбөмбөгийн оймс','Эцэг эх/багштай тохиролцож авна.','socks',200,30),
      (sid,'Дасгалын нэмэлт 15 минут','Хөлбөмбөгийн дасгалд нэмэлт цаг. Эцэг эх/багштай тохиролцоно.','timer',80,40),
      (sid,'Бүтээлч ажлаа өөрөө сонгох','Зураг, шавар эсвэл газрын зураг. Эцэг эх/багштай тохиролцоно.','palette',120,50);
    get diagnostics n_rw = row_count;
  end if;
  insert into public.student_profiles (student_id) values (sid) on conflict do nothing;
  return jsonb_build_object('tasks', n_tasks, 'schedule', n_sched, 'rewards', n_rw);
end $$;

-- Функцуудыг anon/public-ээс хааж, нэвтэрсэн хэрэглэгчид л өгнө
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.today_ub(), public.my_role(), public.is_admin(), public.is_self(uuid), public.is_teacher_of(uuid),
  public.is_parent_of(uuid), public.can_read_student(uuid), public.editable_day(date),
  public.verify_login_role(public.app_role), public.points_summary(uuid), public.redeem_reward(uuid),
  public.adjust_points(uuid, int, text), public.seed_student_plan(uuid)
to authenticated;
