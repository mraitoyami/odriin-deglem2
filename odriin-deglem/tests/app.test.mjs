// Апп-ын бүх урсгалын тест: jsdom дотор public/app.js-ийг жинхэнээр нь ажиллуулж,
// Supabase-ийг tests/mock-supabase.mjs-ээр орлуулна.
// Ажиллуулах: npm test
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createMockSupabase } from "./mock-supabase.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public/index.html"), "utf8").replace(/<script src=[^>]*><\/script>/g, "").replace(/<link[^>]*>/g, "");
const appJs = readFileSync(join(root, "public/app.js"), "utf8");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? "  ✓" : "  ✗", m); };

// ---- Нэг "сервер" (mock) — хоёр өөр "төхөөрөмж" (jsdom цонх) хуваалцана
const server = createMockSupabase({ today });
const { admin } = server;
const bat = admin.user("bat@students.51.local", "batpass123", "student", "Бат");
const nomin = admin.user("nomin@students.51.local", "nominpass1", "student", "Номин");
const bagsh = admin.user("saraa@51.mn", "teacher123", "teacher", "Сараа багш");
const eej = admin.user("dulmaa@gmail.com", "parent1234", "guardian", "Дулмаа");
admin.user("noRole@51.mn", "norole1234", null, "Эрхгүй");
admin.link("student_teacher_assignments", { student_id: bat, teacher_id: bagsh });
admin.link("student_teacher_assignments", { student_id: nomin, teacher_id: bagsh });
admin.link("parent_student_assignments", { parent_id: eej, student_id: bat });
admin.seed(bat);   // Номинд төлөвлөгөө ачаалаагүй: хоосон төлөвийг шалгана

function device(config = { SUPABASE_URL: "https://abc.supabase.co", SUPABASE_ANON_KEY: "anon", USERNAME_DOMAIN: "students.51.local" }) {
  const dom = new JSDOM(html, { url: "https://school.example/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.scrollTo = () => {};
  w.APP_CONFIG = config;
  w.supabase = { createClient: () => server.client };
  w.eval(appJs);
  return w;
}
const settle = (w, ms = 30) => new Promise((r) => w.setTimeout(r, ms));
const $ = (w, s) => w.document.querySelector(s);
const $$ = (w, s) => [...w.document.querySelectorAll(s)];
const text = (w) => w.document.body.textContent;
const byText = (w, sel, t) => $$(w, sel).find((e) => e.textContent.includes(t));
async function click(w, el) { el.dispatchEvent(new w.MouseEvent("click", { bubbles: true })); await settle(w); }
async function submit(w, f) { f.dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true })); await settle(w, 60); }
async function login(w, role, id, pw) {
  await click(w, $(w, `#role-${role}`));
  $(w, "#login-id").value = id; $(w, "#login-pw").value = pw;
  await submit(w, $(w, 'form[data-form="login"]'));
  await settle(w, 60);
}
async function logout(w) { await click(w, $(w, "[data-action=logout]")); await settle(w); }
const pts = (w) => Number($(w, "#my-points").textContent);
const pct = (w) => Number($(w, '[role=progressbar][aria-label="Өдрийн ахиц"]').getAttribute("aria-valuenow"));

console.log("Тохиргоогүй үед");
{
  const w = device({});
  await settle(w);
  ok(byText(w, "h1", "Сервер тохируулаагүй байна") && !$(w, "#login-id"), "тохиргоо дутуу: ажиллаж байгаа мэт харуулахгүй, заавар гарна");
}

console.log("Нэвтрэх");
const A = device();   // 1-р төхөөрөмж
await settle(A);
ok($(A, "h1").textContent === "Нэвтрэх" && !text(A).includes("Demo") && !text(A).includes("demo123"), "login хуудас, demo текст байхгүй");
ok($(A, ".brand-mark svg"), "logo: бөмбөгийн SVG");
ok($(A, "button[type=submit]").disabled, "role сонгоогүй үед товч идэвхгүй");
await login(A, "teacher", "bat", "batpass123");
ok(byText(A, ".alert.error", "«Багш» эрхгүй") && !server.getSession(), "буруу role: татгалзаж, session хаагдсан");
await login(A, "student", "bat", "wrong");
ok(byText(A, ".alert.error", "нууц үг буруу"), "буруу нууц үг");
await login(A, "student", "noRole@51.mn", "norole1234");
ok(byText(A, ".alert.error", "эрхгүй") && !server.getSession(), "эрхгүй аккаунт нэвтэрч чадахгүй");
await login(A, "student", "bat", "batpass123");
ok(A.location.hash === "#/s" && byText(A, "p", "Өдрийн ахиц"), "сурагч нэвтэрч, dashboard гарсан");
ok(server.calls.includes("rpc:verify_login_role"), "role-ийг сервер дээр шалгасан");
ok(!text(A).includes("Demo") && !text(A).includes("жишээ мэдээлэл"), "dashboard дээр demo шошго байхгүй");

console.log("Сурагч: даалгавар, оноо");
ok(pct(A) === 0 && pts(A) === 0, "шинэ аккаунт: 0%, 0 оноо (зохиомол статистик байхгүй)");
const firstId = $(A, ".check").id.slice(4);
await click(A, $(A, "#chk-" + firstId)); await settle(A, 60);
ok(pts(A) === 5 && pct(A) === 20, "хийсэн: +5 оноо, 20%");
ok(server.D.task_completions.length === 1 && server.D.task_completions[0].log_date === today, "database-д огноотой хадгалагдсан");
for (let i = 0; i < 3; i++) { await click(A, $(A, "#chk-" + firstId)); await settle(A, 60); }
ok(pts(A) === 0 && server.D.task_completions.length === 0, "3 дахин дарсан (арилгах→тэмдэглэх→арилгах): 0 оноо, мөр алга");
await click(A, $(A, "#chk-" + firstId)); await settle(A, 60);
ok(pts(A) === 5 && server.D.task_completions.length === 1, "нэг даалгавар = нэг мөр, 5 оноо (давхардаагүй)");
await click(A, $(A, "#hlp-" + firstId)); await settle(A, 60);
ok(pts(A) === 0 && server.D.task_completions[0].status === "help", "«дэмжлэг хэрэгтэй»: оноо 0");
await click(A, $(A, "#chk-" + firstId)); await settle(A, 60);
const mongol = server.D.tasks.find((t) => t.student_id === bat && t.title.startsWith("Монгол"));
// Монгол хэлний бүлэг хаалттай байж болно: шууд товчийг олно
const g = $$(A, ".group-toggle").find((b) => b.textContent.includes("Хичээл"));
if (g && g.getAttribute("aria-expanded") === "false") await click(A, g);
await click(A, $(A, "#chk-" + mongol.id)); await settle(A, 60);
ok(pts(A) === 15, "Монгол хэл +10 → 15 оноо");

console.log("Сурагч: тэмдэглэл, өдрийн бүртгэл");
$(A, "#day-note").value = "Бөмбөгтэй дасгал хийлээ";
await submit(A, $(A, 'form[data-form="note"]'));
ok($(A, 'form[data-form="note"] .save-status.ok'), "тэмдэглэл: «Хадгалагдсан»");
let f = $(A, 'form[data-form="daily"]');
f.querySelector("[name=h]").value = "1"; f.querySelector("[name=m]").value = "70";
await submit(A, f);
ok(byText(A, ".error-text", "0–59") && !server.D.daily_logs.some((l) => l.screen_minutes != null), "буруу минут: алдаа, хадгалаагүй");
f = $(A, 'form[data-form="daily"]');
ok(f.querySelector("[name=h]").value === "1", "алдааны дараа бичсэн утга хэвээр");
f.querySelector("[name=m]").value = "20"; f.querySelector("[name=move]").value = "30";
f.querySelector("[name=bed]").value = "21:30"; f.querySelector("[name=wake]").value = "07:00";
f.querySelector("[name=hm]").checked = true; f.querySelector("[name=mood][value=great]").checked = true;
await submit(A, f);
const dl = server.D.daily_logs.find((l) => l.student_id === bat && l.log_date === today);
ok($(A, 'form[data-form="daily"] .save-status.ok') && dl.screen_minutes === 80 && dl.movement_minutes === 30 && dl.bed_time === "21:30" && dl.note === "Бөмбөгтэй дасгал хийлээ",
  "өдрийн бүртгэл хадгалагдсан, тэмдэглэлийг дараагүй");
ok(text(A).includes("Гараар оруулна. Сайт утас, компьютерийн хэрэглээг өөрөө хянадаггүй."), "дэлгэцийн цагийг гараар оруулдаг гэж тодорхой");

console.log("Хадгалалт амжилтгүй үед");
const realFrom = server.client.from;
server.client.from = (t) => { const q = realFrom(t); if (t === "daily_logs") q.exec = () => ({ data: null, error: { message: "Failed to fetch" } }); return q; };
$(A, "#day-note").value = "Сүлжээгүй үед";
await submit(A, $(A, 'form[data-form="note"]'));
ok(byText(A, ".save-status.err", "Сервертэй холбогдож чадсангүй") && !byText(A, 'form[data-form="note"] .save-status', "Хадгалагдсан ·"), "алдааг харуулж, амжилттай мэт дүр эсгээгүй");
ok($(A, "#day-note").value === "Сүлжээгүй үед", "бичсэн текст алдагдаагүй");
server.client.from = realFrom;
const chk2 = $(A, ".check:not([aria-pressed=true])");
server.client.from = (t) => { const q = realFrom(t); if (t === "task_completions") { const orig = q.exec.bind(q); q.exec = () => (q.op === "select" ? orig() : { data: null, error: { message: "Failed to fetch" } }); } return q; };
const beforeCount = server.D.task_completions.length;
await click(A, chk2); await settle(A, 60);
ok(byText(A, ".alert.error", "Хадгалагдсангүй") && $(A, "#" + chk2.id).getAttribute("aria-pressed") === "false" && pts(A) === 15, "даалгавар хадгалагдаагүй бол тэмдэглэгээ, оноо буцсан");
ok(server.D.task_completions.length === beforeCount, "database өөрчлөгдөөгүй");
server.client.from = realFrom;

console.log("Шагнал");
A.location.hash = "#/s/rewards"; await settle(A);
const bal = () => Number($(A, "#balance").textContent);
ok(bal() === 15, "үлдэгдэл 15");
const glove = $$(A, "[data-action=pick-reward]").find((b) => b.getAttribute("aria-label").startsWith("Хаалгачийн бээлий"));
ok(glove.disabled && byText(A, "p", "Оноо хүрэлцэхгүй байна"), "бээлий: оноо хүрэхгүй, товч идэвхгүй");
ok(text(A).includes("худалдан авалт биш"), "шагнал бол тохиролцох урамшуулал гэж бичсэн");
await click(A, $$(A, "[data-action=pick-reward]").find((b) => b.getAttribute("aria-label") === "Дасгалын нэмэлт 15 минут авах"));
ok($(A, "[role=dialog]") && A.document.activeElement.id === "dlg-cancel", "баталгаажуулах dialog");
await click(A, $(A, "[data-action=confirm-reward]")); await settle(A, 60);
ok(bal() === 5, "оноо 10 хасагдаж 5 үлдсэн");
ok($(A, ".alert.success") && $$(A, "#got .list-row").length === 1, "«Авсан шагналууд»-д нэмэгдсэн");
ok(server.D.reward_transactions.length === 1 && server.D.reward_transactions[0].points === -10, "гүйлгээ database-д");
A.location.hash = "#/s"; await settle(A);
{ const g2 = $$(A, ".group-toggle").find((b) => b.textContent.includes("Хичээл")); if (g2.getAttribute("aria-expanded") === "false") await click(A, g2); }
await click(A, $(A, "#chk-" + mongol.id)); await settle(A, 60);
ok(byText(A, ".alert.error", "шагналд зарцуулсан") && pts(A) === 5 && $(A, "#chk-" + mongol.id).getAttribute("aria-pressed") === "true", "зарцуулсан оноотой даалгаврыг буцаахгүй, оноо 5 хэвээр");

console.log("Refresh ба өөр төхөөрөмж");
const A2 = device(); await settle(A2, 80);   // ижил төхөөрөмжийг refresh хийсэн мэт (session хэвээр)
ok(A2.location.hash === "#/s" && $(A2, "#day-note").value === "Бөмбөгтэй дасгал хийлээ", "refresh: нэвтэрсэн хэвээр, тэмдэглэл хэвээр");
ok(pct(A2) > 0, "refresh: ахиц хэвээр");
A2.location.hash = "#/t"; await settle(A2);
ok(A2.location.hash === "#/s", "сурагч URL-аар багшийн хуудас руу орж чадахгүй");
await click(A2, $(A2, '[data-action="theme"]')); await settle(A2, 60);
ok(A2.document.documentElement.dataset.theme === "dark" && server.D.user_settings.find((s) => s.user_id === bat)?.theme === "dark", "theme database-д хадгалагдсан");
await logout(A2);
ok($(A2, "h1").textContent === "Нэвтрэх" && !server.getSession(), "гарсан");
const B = device(); await settle(B);   // өөр утас: localStorage хоосон
await login(B, "student", "bat", "batpass123");
ok(B.document.documentElement.dataset.theme === "dark", "өөр төхөөрөмж: theme синк хийгдсэн");
ok($(B, "#day-note").value === "Бөмбөгтэй дасгал хийлээ" && pts(B) === 5, "өөр төхөөрөмж: тэмдэглэл, оноо (5) синк хийгдсэн");
await click(B, $(B, '[data-action="theme"]')); await settle(B, 60);
await logout(B);

console.log("Багш");
const T = device(); await settle(T);
await login(T, "teacher", "saraa@51.mn", "teacher123");
ok(byText(T, "h1", "Хариуцсан сурагчид") && $$(T, "a.list-row").length === 2, "2 хариуцсан сурагч");
ok(byText(T, "a.list-row", "Номин").textContent.includes("Даалгаваргүй"), "Номин: даалгаваргүй гэж үнэн харуулсан");
T.location.hash = `#/t/student/${nomin}`; await settle(T);
ok(byText(T, ".empty", "Даалгавар алга"), "хоосон төлөв: анхны төлөвлөгөө ачаалах санал");
await click(T, $(T, "[data-action=seed]")); await settle(T, 80);
ok(server.D.tasks.filter((t) => t.student_id === nomin).length === 5 && byText(T, "h2", "Өнөөдөр"), "төлөвлөгөө ачаалагдсан");
T.location.hash = `#/t/student/${bat}`; await settle(T);
ok(byText(T, ".note-box", "Бөмбөгтэй дасгал хийлээ") && byText(T, "h2", "Дэмжлэг хэрэгтэй"), "сурагчийн тэмдэглэл, тойм");
ok(byText(T, "dd", "21:30"), "сурагчийн унтсан цаг багшид харагдана");
await click(T, $(T, "#tab-tasks")); await settle(T);
const t0 = server.D.tasks.find((t) => t.student_id === bat && t.title === "Цүнх, хэрэгслээ шалгах");
await click(T, $(T, "#ed-" + t0.id));
$(T, `#tf-title-${t0.id}`).value = "Цүнх, харандаагаа шалгах"; $(T, `#tf-pts-${t0.id}`).value = "abc";
await submit(T, $(T, 'form[data-form="task"]'));
ok(byText(T, ".error-text", "0–100"), "оноо буруу үед алдаа");
$(T, `#tf-pts-${t0.id}`).value = "7";
await submit(T, $(T, 'form[data-form="task"]'));
ok(server.D.tasks.find((t) => t.id === t0.id).title === "Цүнх, харандаагаа шалгах" && byText(T, "p", "7 оноо"), "даалгавар database-д засагдсан");
await click(T, $(T, "[data-action=edit][data-key='task:new']"));
$(T, "#tf-title-new").value = "Ном унших"; $(T, "#tf-min-new").value = "15"; $(T, "#tf-pts-new").value = "5";
await submit(T, $(T, 'form[data-form="task"]'));
ok(server.D.tasks.some((t) => t.student_id === bat && t.title === "Ном унших"), "шинэ даалгавар нэмэгдсэн");
await click(T, $(T, "#tab-schedule")); await settle(T);
await click(T, $(T, "[data-action=sched-add]"));
const acts = $$(T, ".sched-edit .activity"); acts[acts.length - 1].value = "Унших цаг";
const times = $$(T, ".sched-edit input[type=time]"); times[times.length - 1].value = "21:00";
await submit(T, $(T, 'form[data-form="schedule"]')); await settle(T, 60);
ok(server.D.schedule_items.filter((r) => r.student_id === bat).length === 3 && $(T, ".save-status.ok"), "хуваарьт мөр нэмэгдсэн");
await click(T, $(T, "#tab-rewards")); await settle(T);
$(T, "#adj-delta").value = "50"; $(T, "#adj-reason").value = "";
await submit(T, $(T, 'form[data-form="adjust"]'));
ok(byText(T, ".error-text", "Шалтгаан"), "шалтгаангүй тохируулгыг татгалзсан");
$(T, "#adj-reason").value = "Долоо хоногийн идэвх";
await submit(T, $(T, 'form[data-form="adjust"]'));
ok(server.D.reward_transactions.some((t) => t.kind === "adjust" && t.points === 50) && byText(T, ".list-row", "Долоо хоногийн идэвх"), "оноо тохируулсан, түүхэд харагдана");
const socks = server.D.rewards.find((r) => r.student_id === bat && r.icon === "socks");
await click(T, $(T, "#er-" + socks.id)); $(T, `#rf-cost-${socks.id}`).value = "150";
await submit(T, $(T, 'form[data-form="reward"]'));
ok(server.D.rewards.find((r) => r.id === socks.id).cost === 150, "шагналын оноо засагдсан");
await click(T, $(T, "#tab-notes")); await settle(T);
$(T, "#tn-body").value = "Өнөөдөр идэвхтэй байлаа";
await submit(T, $(T, 'form[data-form="tnote"]'));
$(T, "#tn-body").value = "Зөвхөн багшид"; $(T, 'input[name=share]').checked = false;
await submit(T, $(T, 'form[data-form="tnote"]'));
$(T, "#goal-t").value = "Хоёр өгүүлбэр бичих";
await submit(T, $(T, 'form[data-form="goals"]'));
ok(server.D.teacher_notes.length === 2 && server.D.day_goals.some((g) => g.goal === "Хоёр өгүүлбэр бичих"), "тэмдэглэл, зорилго хадгалагдсан");
await click(T, $(T, "#tab-settings")); await settle(T);
ok(!text(T).includes("Хуучин хувилбараас"), "хуучин импорт байхгүй");
$(T, "#st-goal").value = "70";
await submit(T, $(T, 'form[data-form="settings"]'));
ok(server.D.student_profiles.find((s) => s.student_id === bat).goal_pct === 70, "зорилгын хувь хадгалагдсан");
await logout(T);

console.log("Эцэг эх");
const P = device(); await settle(P);
await login(P, "guardian", "dulmaa@gmail.com", "parent1234");
ok(byText(P, "h1", "Өнөөдрийн бүртгэл") && !text(P).includes("Номин"), "зөвхөн өөрийн хүүхэд (Номин харагдахгүй)");
ok(byText(P, "p", "Өнөөдөр идэвхтэй байлаа") && !text(P).includes("Зөвхөн багшид"), "зөвхөн хуваалцсан тэмдэглэл");
ok(!$(P, ".check") && text(P).includes("Цүнх, харандаагаа шалгах"), "даалгавар зөвхөн харна; багшийн засвар харагдана");
ok(byText(P, "span", "Хоёр өгүүлбэр бичих"), "багшийн тохируулсан зорилго харагдана");
f = $(P, 'form[data-form="daily"]');
ok(f.querySelector("[name=h]").value === "1" && f.querySelector("[name=bed]").value === "21:30", "сурагчийн оруулсан бүртгэл харагдана");
f.querySelector("[name=move]").value = "45";
await submit(P, f);
const dl2 = server.D.daily_logs.find((l) => l.student_id === bat && l.log_date === today);
ok(dl2.movement_minutes === 45 && dl2.note === "Бөмбөгтэй дасгал хийлээ", "эцэг эх засварлав, хүүхдийн тэмдэглэл хэвээр");
P.location.hash = "#/p/week"; await settle(P);
const row = $$(P, "tbody tr").find((tr) => tr.textContent.includes("Өнөөдөр"));
ok(row && row.textContent.includes("1 ц 20 мин") && row.textContent.includes("45 мин") && row.textContent.includes("21:30"), "долоо хоногийн хүснэгт");
await logout(P);

console.log("Нэвтрэлт өөр газар дууссан үед");
const S = device(); await settle(S);
await login(S, "student", "bat", "batpass123");
await server.client.auth.signOut(); await settle(S, 60);
ok($(S, "h1").textContent === "Нэвтрэх" && byText(S, ".alert.error", "хугацаа дууссан"), "login руу буцаж, шалтгааныг хэлсэн");

console.log(`\n${pass} тэнцсэн, ${fail} унасан`);
process.exit(fail ? 1 : 0);
