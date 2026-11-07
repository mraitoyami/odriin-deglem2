// RLS ба серверийн функцуудын тест.
// PGlite (WASM Postgres) дээр Supabase-ийн auth.uid()-г дуурайж migration-ийг бүтнээр нь ажиллуулна.
// Ажиллуулах: npm install && npm run test:rls
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(join(here, "../migrations/0001_init.sql"), "utf8");
const db = new PGlite();

// Supabase-ийн орчныг дуурайна: роль, auth schema, auth.uid()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`);
await db.exec(migration);

const U = {
  stu: "00000000-0000-0000-0000-000000000001",
  stu2: "00000000-0000-0000-0000-000000000002",
  tea: "00000000-0000-0000-0000-000000000003",
  par: "00000000-0000-0000-0000-000000000004",
  tea2: "00000000-0000-0000-0000-000000000006",
  nobody: "00000000-0000-0000-0000-000000000005",
};
// Админы үйлдэл (superuser = service role): хэрэглэгч, role, холбоос
for (const [k, id] of Object.entries(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [id, `${k}@t.mn`, JSON.stringify({ full_name: k, role: "teacher" })]); // metadata-д role бичсэн ч тооцохгүй
await db.exec(`
  update profiles set role = 'student' where id in ('${U.stu}', '${U.stu2}');
  update profiles set role = 'teacher' where id in ('${U.tea}', '${U.tea2}');
  update profiles set role = 'guardian' where id = '${U.par}';
  insert into student_teacher_assignments values ('${U.stu}', '${U.tea}');
  insert into student_teacher_assignments values ('${U.stu2}', '${U.tea2}');
  insert into parent_student_assignments values ('${U.par}', '${U.stu}');
  select seed_student_plan('${U.stu}');
  select seed_student_plan('${U.stu2}');
`);

let pass = 0, fail = 0;
async function as(uid, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ""}', false); set role ${uid ? "authenticated" : "anon"};`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
}
async function ok(name, q, params = [], check) {
  try {
    const r = await db.query(q, params); const good = check ? check(r) : true;
    good ? pass++ : fail++; console.log(good ? "  ✓" : "  ✗", name, good ? "" : JSON.stringify(r.rows).slice(0, 160));
  } catch (e) { fail++; console.log("  ✗", name, "→", e.message); }
}
async function denied(name, q, params = []) {
  try {
    const r = await db.query(q, params);
    const d = r.affectedRows === 0 || r.rows.length === 0;
    d ? pass++ : fail++; console.log(d ? "  ✓" : "  ✗", name, d ? "(хоосон)" : "ЗӨВШӨӨРӨГДЛӨӨ: " + JSON.stringify(r.rows).slice(0, 120));
  } catch (e) { pass++; console.log("  ✓", name, `(татгалзсан: ${e.message.slice(0, 70)})`); }
}
const one = async (q, p = []) => (await db.query(q, p)).rows[0];
const today = (await one(`select today_ub()::text d`)).d;
const yesterday = (await one(`select (today_ub() - 1)::text d`)).d;
const old = (await one(`select (today_ub() - 30)::text d`)).d;
const task = async (sid, title) => (await one(`select id, points from tasks where student_id = $1 and title = $2`, [sid, title]));
const t1 = await task(U.stu, "Цүнх, хэрэгслээ шалгах");          // 5 оноо
const tM = await task(U.stu, "Монгол хэлний унших-бичих ажил");  // 10 оноо
const t2 = await task(U.stu2, "Цүнх, хэрэгслээ шалгах");
const bal = (r) => r.rows[0].s.balance;

console.log("Профайл ба role");
await as(U.nobody, async () => {
  await ok("metadata-д role бичсэн ч role хоосон", `select role from profiles where id = $1`, [U.nobody], (r) => r.rows[0].role === null);
  await denied("өөрийн role-ийг teacher болгох", `update profiles set role = 'teacher' where id = $1`, [U.nobody]);
  await ok("verify_login_role(teacher) = false", `select verify_login_role('teacher') v`, [], (r) => r.rows[0].v === false);
  await denied("өөрийгөө багшаар холбох", `insert into student_teacher_assignments values ($1, $2)`, [U.stu, U.nobody]);
  await denied("ямар ч сурагч харахгүй", `select * from profiles where id <> $1`, [U.nobody]);
});
await as(U.stu, async () => {
  await ok("сурагч: verify_login_role(student)", `select verify_login_role('student') v`, [], (r) => r.rows[0].v === true);
  await ok("сурагч: verify_login_role(teacher) = false", `select verify_login_role('teacher') v`, [], (r) => r.rows[0].v === false);
  await denied("сурагч өөрийгөө эцэг эх болгох", `update profiles set role = 'guardian' where id = $1`, [U.stu]);
  await denied("сурагч өөрийгөө өөр сурагчийн эцэг эхээр холбох", `insert into parent_student_assignments values ($1, $2)`, [U.stu, U.stu2]);
});

console.log("Сурагч");
await as(U.stu, async () => {
  await ok("зөвхөн өөрийн профайл", `select id from profiles`, [], (r) => r.rows.length === 1 && r.rows[0].id === U.stu);
  await ok("өөрийн даалгавар 18", `select count(*)::int n from tasks`, [], (r) => r.rows[0].n === 18);
  await ok("даалгавар тэмдэглэх", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done')`, [U.stu, t1.id, today]);
  await ok("оноо сервер тогтоосон (5), updated_by = сурагч", `select points, updated_by from task_completions where task_id = $1`, [t1.id], (r) => r.rows[0].points === 5 && r.rows[0].updated_by === U.stu);
  await ok("хуурамч оноо бичих гэсэн ч 5 хэвээр", `update task_completions set points = 999 where task_id = $1 and log_date = $2 returning points`, [t1.id, today], (r) => r.rows[0].points === 5);
  await ok("ижил даалгаврыг дахин тэмдэглэхэд давхардахгүй",
    `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done') on conflict (task_id, log_date) do update set status = 'done'`, [U.stu, t1.id, today]);
  await ok("оноо = 5", `select points_summary($1) s`, [U.stu], (r) => bal(r) === 5);
  await ok("өчигдрийн бүртгэл тусдаа мөр", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'partial')`, [U.stu, t1.id, yesterday]);
  await ok("хэсэгчлэн оноо өгөхгүй", `select points_summary($1) s`, [U.stu], (r) => bal(r) === 5);
  await ok("өнөөдрийн мөр хэвээр", `select status from task_completions where task_id = $1 and log_date = $2`, [t1.id, today], (r) => r.rows[0].status === "done");
  await denied("30 хоногийн өмнөх өдөр засах", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done')`, [U.stu, t1.id, old]);
  await denied("өөр сурагчийн даалгавар тэмдэглэх", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done')`, [U.stu2, t2.id, today]);
  await denied("өөрийн id-гаар бусдын даалгавар тэмдэглэх", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done')`, [U.stu, t2.id, today]);
  await ok("өдрийн бүртгэл: тэмдэглэл, дэлгэц, хөдөлгөөн, унтах цаг",
    `insert into daily_logs (student_id, log_date, note, screen_minutes, movement_minutes, bed_time, wake_time) values ($1, $2, 'Сайхан өдөр', 60, 20, '21:30', '07:00')`, [U.stu, today]);
  await ok("өчигдрийн бүртгэл өнөөдрийнхийг дарахгүй", `insert into daily_logs (student_id, log_date, note) values ($1, $2, 'Өчигдөр')`, [U.stu, yesterday]);
  await ok("хоёр өдөр тусдаа", `select count(*)::int n from daily_logs`, [], (r) => r.rows[0].n === 2);
  await denied("даалгавар засах", `update tasks set title = 'x' where student_id = $1`, [U.stu]);
  await denied("өөрийн даалгаврын оноо өсгөх", `update tasks set points = 100 where student_id = $1`, [U.stu]);
  await denied("багшийн тэмдэглэл харах", `select * from teacher_notes`);
  await denied("зорилгын хувиа өөрчлөх", `update student_profiles set goal_pct = 10 where student_id = $1`, [U.stu]);
  await denied("онооны гүйлгээ шууд бичих", `insert into reward_transactions (student_id, kind, points) values ($1, 'adjust', 1000)`, [U.stu]);
  await denied("өөртөө оноо нэмэх (adjust_points)", `select adjust_points($1, 500, 'x')`, [U.stu]);
  await denied("seed_student_plan дуудах", `select seed_student_plan($1)`, [U.stu]);
  await ok("theme хадгалах", `insert into user_settings (user_id, theme) values ($1, 'dark')`, [U.stu]);
  await denied("бусдын тохиргоо бичих", `insert into user_settings (user_id, theme) values ($1, 'dark')`, [U.tea]);
});

console.log("Шагнал ба оноо");
await as(U.stu, async () => {
  await ok("Монгол хэл хийхэд +10", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done')`, [U.stu, tM.id, today]);
  await ok("оноо = 15", `select points_summary($1) s`, [U.stu], (r) => bal(r) === 15);
  await denied("оноо хүрэхгүй шагнал (80)", `select redeem_reward(id) from rewards where student_id = $1 and cost = 80`, [U.stu]);
});
await as(U.tea, async () => {
  await ok("багш +70 тохируулга", `select (adjust_points($1, 70, 'Долоо хоногийн идэвх')).points p`, [U.stu], (r) => r.rows[0].p === 70);
  await denied("шалтгаангүй тохируулга", `select adjust_points($1, 5, '')`, [U.stu]);
  await denied("оноог сөрөг болгох", `select adjust_points($1, -500, 'x')`, [U.stu]);
});
await as(U.stu, async () => {
  await ok("оноо = 85", `select points_summary($1) s`, [U.stu], (r) => bal(r) === 85 && r.rows[0].s.adjusted === 70);
  await ok("80 онооны шагнал авах", `select (redeem_reward(id)).points p from rewards where student_id = $1 and cost = 80`, [U.stu], (r) => r.rows[0].p === -80);
  await ok("оноо = 5, зарцуулсан 80", `select points_summary($1) s`, [U.stu], (r) => bal(r) === 5 && r.rows[0].s.spent === 80);
  await denied("дахин авах (оноо хүрэлцэхгүй)", `select redeem_reward(id) from rewards where student_id = $1 and cost = 80`, [U.stu]);
  await denied("зарцуулсан оноотой даалгаврыг буцаах", `delete from task_completions where task_id = $1 and log_date = $2`, [tM.id, today]);
  await ok("шагналын түүх хадгалагдсан", `select count(*)::int n from reward_transactions where kind = 'redeem'`, [], (r) => r.rows[0].n === 1);
  await denied("бусдын шагнал авах", `select redeem_reward(id) from rewards where student_id = $1 limit 1`, [U.stu2]);
  await denied("бусдын оноо харах", `select points_summary($1)`, [U.stu2]);
});

console.log("Багш");
await as(U.tea, async () => {
  await ok("зөвхөн хариуцсан сурагч", `select id from profiles where role = 'student'`, [], (r) => r.rows.length === 1 && r.rows[0].id === U.stu);
  await ok("сурагчийн бүртгэл харна", `select * from task_completions`, [], (r) => r.rows.length === 3);
  await ok("өдрийн бүртгэл харна", `select * from daily_logs`, [], (r) => r.rows.length === 2);
  await ok("даалгавар нэмэх", `insert into tasks (student_id, category, title, points) values ($1, 'study', 'Шинэ', 7)`, [U.stu]);
  await ok("зорилгын хувь өөрчлөх", `update student_profiles set goal_pct = 70 where student_id = $1`, [U.stu], (r) => r.affectedRows === 1);
  await denied("сурагчийн нэр өөрчлөх", `update profiles set full_name = 'x' where id = $1`, [U.stu]);
  await denied("хариуцаагүй сурагчид даалгавар нэмэх", `insert into tasks (student_id, category, title) values ($1, 'study', 'x')`, [U.stu2]);
  await denied("даалгаврыг өөр сурагч руу шилжүүлэх", `update tasks set student_id = $2 where student_id = $1`, [U.stu, U.stu2]);
  await denied("хариуцаагүй сурагчид оноо нэмэх", `select adjust_points($1, 10, 'x')`, [U.stu2]);
  await denied("сурагчийн оронд даалгавар тэмдэглэх", `update task_completions set status = 'help'`);
  await ok("тэмдэглэл бичих (хуваалцсан)", `insert into teacher_notes (student_id, body) values ($1, 'Сайн ахицтай')`, [U.stu]);
  await ok("тэмдэглэл бичих (дотоод)", `insert into teacher_notes (student_id, body, share_with_parent) values ($1, 'Дотоод', false)`, [U.stu]);
  await ok("зохиогч сервер талд тогтоогдсон", `select author_id from teacher_notes limit 1`, [], (r) => r.rows[0].author_id === U.tea);
  await ok("өдрийн зорилго", `insert into day_goals (student_id, log_date, goal) values ($1, $2, '2 өгүүлбэр бичих')`, [U.stu, today]);
  await ok("шагнал нэмэх", `insert into rewards (student_id, title, cost) values ($1, 'Тест', 5)`, [U.stu]);
  await ok("шагналын оноо өөрчлөх", `update rewards set cost = 150 where student_id = $1 and cost = 200`, [U.stu], (r) => r.affectedRows === 1);
  await ok("хуваарь засах", `update schedule_items set start_time = '07:15' where student_id = $1 and sort = 10`, [U.stu], (r) => r.affectedRows === 1);
  await denied("өдрийн бүртгэл бичих", `insert into daily_logs (student_id, log_date) values ($1, $2)`, [U.stu, (await one(`select (today_ub() - 2)::text d`)).d]);
  await denied("өөрийгөө өөр сурагчид холбох", `insert into student_teacher_assignments values ($1, $2)`, [U.stu2, U.tea]);
});
await as(U.tea2, async () => {
  await denied("өөр багш Батыг харахгүй", `select * from daily_logs where student_id = $1`, [U.stu]);
  await denied("өөр багш Батын тэмдэглэлийг харахгүй", `select * from teacher_notes where student_id = $1`, [U.stu]);
});

console.log("Эцэг эх");
await as(U.par, async () => {
  await ok("зөвхөн өөрийн хүүхэд", `select id from profiles where role = 'student'`, [], (r) => r.rows.length === 1 && r.rows[0].id === U.stu);
  await ok("хуваалцсан тэмдэглэлийг л харна", `select body from teacher_notes`, [], (r) => r.rows.length === 1 && r.rows[0].body === "Сайн ахицтай");
  await ok("өдрийн бүртгэлд дэлгэц, хөдөлгөөн засах", `update daily_logs set screen_minutes = 45, movement_minutes = 30 where student_id = $1 and log_date = $2`, [U.stu, today], (r) => r.affectedRows === 1);
  await ok("хүүхдийн тэмдэглэлийг дарж чадахгүй", `update daily_logs set note = 'эцэг эх' where student_id = $1 and log_date = $2 returning note`, [U.stu, today], (r) => r.rows[0].note === "Сайхан өдөр");
  await ok("шинэ өдөр бөглөхөд note хоосон", `insert into daily_logs (student_id, log_date, note, screen_minutes) values ($1, $2, 'x', 30) returning note`, [U.stu, (await one(`select (today_ub() - 3)::text d`)).d], (r) => r.rows[0].note === "");
  await ok("хүүхдийн оноо, шагналын түүх харна", `select points_summary($1) s`, [U.stu], (r) => bal(r) === 5);
  await denied("даалгавар нэмэх", `insert into tasks (student_id, category, title) values ($1, 'study', 'x')`, [U.stu]);
  await denied("хүүхдийн оронд даалгавар тэмдэглэх", `insert into task_completions (student_id, task_id, log_date, status) values ($1, $2, $3, 'done')`, [U.stu, t1.id, (await one(`select (today_ub() - 2)::text d`)).d]);
  await denied("шагнал засах", `update rewards set cost = 1 where student_id = $1`, [U.stu]);
  await denied("хүүхдийн нэрийн өмнөөс шагнал авах", `select redeem_reward(id) from rewards where student_id = $1 and cost = 5`, [U.stu]);
  await denied("оноо нэмэх", `select adjust_points($1, 10, 'x')`, [U.stu]);
  await denied("бусдын хүүхэд", `select * from daily_logs where student_id = $1`, [U.stu2]);
});

console.log("Нэвтрээгүй (anon)");
await as(null, async () => {
  await denied("профайл унших", `select * from profiles`);
  await denied("даалгавар унших", `select * from tasks`);
  await denied("verify_login_role", `select verify_login_role('student')`);
  await denied("redeem_reward", `select redeem_reward(gen_random_uuid())`);
});

console.log(`\n${pass} тэнцсэн, ${fail} унасан`);
process.exit(fail ? 1 : 0);
