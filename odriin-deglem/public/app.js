/* =========================================================
   Өдрийн дэглэм · 51 дүгээр сургууль
   HTML + CSS + JavaScript, өгөгдөл ба нэвтрэлт: Supabase.

   Аюулгүй байдал:
   - Нэвтрэлтийг Supabase Auth хийнэ. Сонгосон role-ийг сервер дээр verify_login_role()-оор шалгана.
   - Хэн юуг харах, засахыг database-ийн Row Level Security шийднэ. Энэ файл дахь
     role-оор ялгасан харагдац нь зөвхөн UI; хамгаалалт нь сервер дээр.
   - Энд зөвхөн нийтэд ил байх зориулалттай anon (publishable) түлхүүр ашиглана (config.js).
     service_role түлхүүр энэ файлд, браузерт хэзээ ч орохгүй.

   Кодын бүтэц:
     1. Тогтмол утга
     2. Огноо
     3. Supabase холболт ба өгөгдөл ачаалах
     4. Өгөгдөл өөрчлөх үйлдлүүд
     5. Нэвтрэлт
     6. Theme
     7. Туслах HTML функц, icon
     8. Дэлгэцүүд
     9. Чиглүүлэлт ба event
   ========================================================= */
(function () {
  "use strict";

  /* ================= 1. ТОГТМОЛ УТГА ================= */

  const THEME_KEY = "odriin-deglem.theme";
  const CATEGORIES = [
    { id: "study", label: "Хичээл, сургалт" },
    { id: "home", label: "Гэрийн ажил, бие даах чадвар" },
    { id: "health", label: "Эрүүл ахуй, хооллолт, нойр" },
    { id: "rest", label: "Амралт, хөдөлгөөн, дэлгэц" },
    { id: "interest", label: "Сонирхол" },
  ];
  const SLOTS = { morning: "Өглөө", school: "Сургууль дээр", after: "Хичээлийн дараа", evening: "Орой" };
  const ROLES = {
    student: { label: "Сурагч", desc: "Өдрийн хийх зүйлсээ тэмдэглэнэ", home: "/s", icon: "graduation" },
    teacher: { label: "Багш", desc: "Хариуцсан сурагчийн ахицыг хянана", home: "/t", icon: "users" },
    guardian: { label: "Эцэг эх / Асран хамгаалагч", desc: "Хүүхдийнхээ бүртгэлийг харна", home: "/p", icon: "heart" },
  };
  const MOODS = [["great", "Баяртай"], ["ok", "Тайван"], ["tired", "Ядарсан"], ["upset", "Бухимдсан"]];
  const OFFSCREEN = [["draw", "Зураг"], ["clay", "Шавар"], ["ball", "Бөмбөг"], ["geo", "Газарзүй"], ["other", "Бусад"]];
  const REWARD_ICONS = [["glove", "Бээлий"], ["ball", "Бөмбөг"], ["socks", "Оймс"], ["timer", "Нэмэлт цаг"], ["palette", "Бүтээлч ажил"], ["gift", "Бэлэг"], ["star", "Од"]];
  const HISTORY_DAYS = 60; // ачаалах түүхийн хугацаа

  /* ================= 2. ОГНОО (Улаанбаатарын цагаар, сервер талын today_ub()-тэй таарна) ================= */

  const TZ = "Asia/Ulaanbaatar";
  const WEEKDAYS = ["Ням", "Даваа", "Мягмар", "Лхагва", "Пүрэв", "Баасан", "Бямба"];
  const WEEKDAYS_SHORT = ["Ня", "Да", "Мя", "Лх", "Пү", "Ба", "Бя"];

  function today() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
  function nowMinutes() {
    const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
    return (h % 24) * 60 + m;
  }
  function parseDate(d) { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); }
  function addDays(d, n) { const x = parseDate(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function formatLong(d) { const x = parseDate(d); return `${x.getUTCMonth() + 1}-р сарын ${x.getUTCDate()}, ${WEEKDAYS[x.getUTCDay()]}`; }
  function formatShort(d) { const x = parseDate(d); return `${x.getUTCMonth() + 1}/${x.getUTCDate()} ${WEEKDAYS_SHORT[x.getUTCDay()]}`; }
  function lastDays(n, end) { return Array.from({ length: n }, (_, i) => addDays(end, -(n - 1 - i))); }
  /** Сүүлийн 7 хоногийн бүртгэлийг л засна (сервер ч ижил дүрэмтэй) */
  function isEditable(d) { const t = today(); return d <= t && d >= addDays(t, -7); }
  function greeting() { const m = nowMinutes(); return m < 660 ? "Өглөөний мэнд" : m < 1080 ? "Өдрийн мэнд" : "Оройн мэнд"; }
  function fmtMinutes(m) { if (m == null) return "—"; const h = Math.floor(m / 60), r = m % 60; return h ? `${h} ц ${r} мин` : `${r} мин`; }
  function clock() { return new Date().toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit" }); }
  const hhmm = (t) => (t ? String(t).slice(0, 5) : "");
  const dateOfTs = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

  /* ================= 3. SUPABASE ХОЛБОЛТ БА ӨГӨГДӨЛ АЧААЛАХ ================= */

  const CFG = window.APP_CONFIG || {};
  const configured = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && !/YOUR-PROJECT/i.test(CFG.SUPABASE_URL));
  const libLoaded = !!(window.supabase && window.supabase.createClient);
  const sb = configured && libLoaded
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;
  const USERNAME_DOMAIN = String(CFG.USERNAME_DOMAIN || "").trim();

  /** Апп-ын төлөв: setup | boot | login | loading | ready | error */
  const state = { phase: "boot", user: null, notice: "", loadError: "" };

  function emptyDb() {
    return { students: [], tasks: [], task_logs: [], schedule: [], daily_logs: [], teacher_notes: [], day_goals: [], rewards: [], transactions: [], points: {},
      parent_tasks: [], parent_responses: [], parents: [], parentFeature: true };
  }
  let db = emptyDb();

  /** Supabase-ийн алдааг хэрэглэгчид ойлгомжтой болгоно */
  function friendlyError(e) {
    const msg = String((e && e.message) || e || "");
    const code = e && e.code;
    if (/Failed to fetch|NetworkError|network|Load failed/i.test(msg)) return "Сервертэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу.";
    if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "Энэ үйлдлийг хийх эрх танд алга.";
    if (/JWT|expired|refresh token/i.test(msg)) return "Нэвтрэлтийн хугацаа дууссан. Дахин нэвтэрнэ үү.";
    if (code === "23514") return "Оруулсан утга зөвшөөрөгдөх хязгаараас гарсан байна.";
    if (code === "23505") return "Ийм бүртгэл аль хэдийн байна.";
    return msg || "Тодорхойгүй алдаа гарлаа.";
  }
  /** Хариуг шалгана. Бичих үйлдэл 0 мөр өөрчилсөн бол (RLS татгалзсан) амжилттай гэж үзэхгүй. */
  async function must(promise, { rows = false } = {}) {
    const { data, error } = await promise;
    if (error) throw error;
    if (rows && (!data || (Array.isArray(data) && !data.length))) throw Object.assign(new Error("Хадгалагдсангүй: эрх хүрэлцэхгүй эсвэл бүртгэл олдсонгүй."), { code: "42501" });
    return data;
  }

  /** Хэрэглэгчийн харах эрхтэй бүх өгөгдлийг ачаална. RLS нь зөвхөн зөвшөөрөгдсөн мөрийг буцаана. */
  // Даалгаврын төлөв өөрчлөх бүрт нэмэгдэнэ. Ачаалал эхэлснээс хойш өөрчлөлт хийгдсэн бол
  // хуучин хариугаар шинэ төлөвийг дарахгүй (check/uncheck буцаж харагдах алдаанаас сэргийлнэ).
  let taskSeq = 0;
  const pointsSeq = {};
  const isMissingRelation = (e) => ["42P01", "42883", "PGRST200", "PGRST202", "PGRST205"].includes(e && e.code)
    || /does not exist|schema cache|Could not find/i.test(String((e && e.message) || ""));

  /** 14_parent_tasks.sql ажиллаагүй database дээр сайтын бусад хэсэг хэвийн ажиллана */
  async function loadParentData() {
    try {
      const [tasks, resp] = await Promise.all([
        must(sb.from("parent_tasks").select("id, student_id, parent_id, title, description, due_date, active, created_at").order("created_at", { ascending: false })),
        must(sb.from("parent_task_responses").select("task_id, parent_id, done, comment, done_at, updated_at")),
      ]);
      const parents = state.user && state.user.role === "teacher" ? await must(sb.rpc("teacher_parents")) : [];
      return { ok: true, tasks, resp, parents: parents || [] };
    } catch (e) {
      if (isMissingRelation(e)) return { ok: false, tasks: [], resp: [], parents: [] };
      throw e;
    }
  }

  async function loadData() {
    const t = today(), from = addDays(t, -HISTORY_DAYS), to = addDays(t, 1), seq = taskSeq;
    const [profiles, sps, tasks, comps, sched, logs, notes, goals, rewards, txs] = await Promise.all([
      must(sb.from("profiles").select("id, full_name").eq("role", "student")),
      must(sb.from("student_profiles").select("student_id, class_name, goal_pct, screen_limit_min")),
      must(sb.from("tasks").select("id, student_id, category, title, description, minutes, slot, points, sort, active")),
      must(sb.from("task_completions").select("task_id, student_id, log_date, status, points").gte("log_date", from).lte("log_date", to)),
      must(sb.from("schedule_items").select("id, student_id, start_time, period, activity, sort")),
      must(sb.from("daily_logs").select("*").gte("log_date", from).lte("log_date", to)),
      must(sb.from("teacher_notes").select("id, student_id, author_id, log_date, body, share_with_parent, created_at").order("created_at", { ascending: false }).limit(300)),
      must(sb.from("day_goals").select("student_id, log_date, goal").gte("log_date", from).lte("log_date", to)),
      must(sb.from("rewards").select("id, student_id, title, description, icon, cost, active, sort")),
      must(sb.from("reward_transactions").select("id, student_id, kind, points, reward_id, title, icon, note, created_at").order("created_at", { ascending: false }).limit(300)),
    ]);
    const spBy = Object.fromEntries(sps.map((s) => [s.student_id, s]));
    const next = emptyDb();
    next.students = profiles.map((p) => ({ id: p.id, full_name: p.full_name || "Нэргүй сурагч", class_name: spBy[p.id]?.class_name || "",
      goal_pct: spBy[p.id]?.goal_pct ?? 80, screen_limit_min: spBy[p.id]?.screen_limit_min ?? 90 }));
    next.tasks = tasks;
    next.task_logs = comps;
    next.schedule = sched.map((r) => ({ ...r, start_time: hhmm(r.start_time) }));
    next.daily_logs = logs.map((l) => ({ ...l, bed_time: hhmm(l.bed_time), wake_time: hhmm(l.wake_time), offscreen: l.offscreen || [] }));
    next.teacher_notes = notes;
    next.day_goals = goals;
    next.rewards = rewards;
    next.transactions = txs;
    const par = await loadParentData();
    next.parentFeature = par.ok; next.parent_tasks = par.tasks; next.parent_responses = par.resp; next.parents = par.parents;
    // Оноог сервер бүх түүхээс тооцно
    const sums = await Promise.all(next.students.map((s) => must(sb.rpc("points_summary", { sid: s.id }))));
    next.students.forEach((s, i) => { next.points[s.id] = sums[i]; });
    if (seq !== taskSeq || ui.pending.size) {
      // Ачааллын явцад даалгаврын төлөв өөрчлөгдсөн: тэр өөрчлөлтийг хадгалж, хуучин хариуг хэрэглэхгүй
      next.task_logs = db.task_logs; next.points = { ...next.points, ...db.points };
    }
    db = next;
  }
  async function refreshPoints(sid) {
    const mine = (pointsSeq[sid] = (pointsSeq[sid] || 0) + 1);
    const p = await must(sb.rpc("points_summary", { sid }));
    if (pointsSeq[sid] === mine) db.points[sid] = p;   // сүүлийн хүсэлтийн хариуг л хэрэглэнэ
  }

  const myStudents = () => db.students.slice().sort((a, b) => a.full_name.localeCompare(b.full_name));
  const getStudent = (id) => db.students.find((s) => s.id === id) || null;
  const catOrder = (c) => CATEGORIES.findIndex((x) => x.id === c);
  const tasksOf = (sid, all = false) => db.tasks.filter((t) => t.student_id === sid && (all || t.active)).sort((a, b) => catOrder(a.category) - catOrder(b.category) || a.sort - b.sort);
  const statusMap = (sid, date) => new Map(db.task_logs.filter((l) => l.student_id === sid && l.log_date === date).map((l) => [l.task_id, l.status]));
  const dailyLog = (sid, date) => db.daily_logs.find((h) => h.student_id === sid && h.log_date === date);
  const studentNote = (sid, date) => dailyLog(sid, date)?.note || "";
  const dayGoal = (sid, date) => db.day_goals.find((g) => g.student_id === sid && g.log_date === date)?.goal || "";
  const points = (sid) => db.points[sid] || { earned: 0, spent: 0, adjusted: 0, balance: 0 };

  /** Ахиц: хийсэн = 1, хэсэгчлэн = 0.5, дэмжлэг хэрэгтэй = 0 */
  function progress(sid, date) {
    const tasks = tasksOf(sid), st = statusMap(sid, date);
    let score = 0, done = 0, help = 0;
    const byCat = {};
    for (const t of tasks) {
      const s = st.get(t.id), v = s === "done" ? 1 : s === "partial" ? 0.5 : 0;
      score += v; if (s === "done") done++; if (s === "help") help++;
      byCat[t.category] = byCat[t.category] || { score: 0, total: 0 };
      byCat[t.category].score += v; byCat[t.category].total++;
    }
    return { total: tasks.length, done, help, pct: tasks.length ? Math.round((score / tasks.length) * 100) : 0, byCat, statuses: st };
  }

  /* ================= 4. ӨГӨГДӨЛ ӨӨРЧЛӨХ ҮЙЛДЛҮҮД ================= */

  const api = {
    /** Даалгаврын төлөв. Оноог сервер тогтооно; (даалгавар, өдөр) давтагдашгүй тул давхар оноо гарахгүй. */
    async setTask(sid, taskId, date, status) {
      if (status) {
        const row = await must(sb.from("task_completions")
          .upsert({ task_id: taskId, student_id: sid, log_date: date, status }, { onConflict: "task_id,log_date" })
          .select("task_id, student_id, log_date, status, points").single(), { rows: true });
        db.task_logs = db.task_logs.filter((l) => !(l.task_id === taskId && l.log_date === date)).concat(row);
      } else {
        const del = await must(sb.from("task_completions").delete().eq("task_id", taskId).eq("log_date", date).select("task_id"));
        if (!del || !del.length) {
          // 0 мөр устсан: мөр үнэхээр байхгүй бол зүгээр, байгаа бол сервер татгалзсан — амжилттай мэт харуулахгүй
          const still = await must(sb.from("task_completions").select("task_id").eq("task_id", taskId).eq("log_date", date));
          if (still && still.length) throw Object.assign(new Error(isEditable(date)
            ? "Хадгалагдсангүй: энэ даалгаврыг буцаах эрх хүрэлцэхгүй байна."
            : "Энэ өдрийн бүртгэлийг засах хугацаа (7 хоног) дууссан тул буцаах боломжгүй."), { code: "P0001" });
        }
        db.task_logs = db.task_logs.filter((l) => !(l.task_id === taskId && l.log_date === date));
      }
      await refreshPoints(sid);
    },
    /** Өдрийн бүртгэл: зөвхөн дамжуулсан талбаруудыг шинэчилнэ, бусдыг хадгална */
    saveDailyLog: (sid, date, fields) => must(sb.from("daily_logs")
      .upsert({ student_id: sid, log_date: date, ...fields }, { onConflict: "student_id,log_date" }).select("student_id").single(), { rows: true }),
    redeem: (rid) => must(sb.rpc("redeem_reward", { rid })),
    adjustPoints: (sid, delta, reason) => must(sb.rpc("adjust_points", { sid, delta, reason })),
    seedPlan: (sid) => must(sb.rpc("seed_student_plan", { sid })),
    createTask: (row) => must(sb.from("tasks").insert(row).select("id").single(), { rows: true }),
    updateTask: (id, v) => must(sb.from("tasks").update(v).eq("id", id).select("id"), { rows: true }),
    createReward: (row) => must(sb.from("rewards").insert(row).select("id").single(), { rows: true }),
    updateReward: (id, v) => must(sb.from("rewards").update(v).eq("id", id).select("id"), { rows: true }),
    async saveSchedule(sid, rows, removed) {
      if (removed.length) await must(sb.from("schedule_items").delete().in("id", removed).select("id"));
      const existing = rows.filter((r) => !r.id.startsWith("new-")).map((r) => ({ id: r.id, student_id: sid, start_time: r.start_time || null, period: r.period, activity: r.activity, sort: r.sort }));
      const added = rows.filter((r) => r.id.startsWith("new-")).map((r) => ({ student_id: sid, start_time: r.start_time || null, period: r.period, activity: r.activity, sort: r.sort }));
      if (existing.length) await must(sb.from("schedule_items").upsert(existing).select("id"), { rows: true });
      if (added.length) await must(sb.from("schedule_items").insert(added).select("id"), { rows: true });
    },
    saveGoal: (sid, date, goal) => (goal
      ? must(sb.from("day_goals").upsert({ student_id: sid, log_date: date, goal }, { onConflict: "student_id,log_date" }).select("log_date"), { rows: true })
      : must(sb.from("day_goals").delete().eq("student_id", sid).eq("log_date", date).select("log_date"))),
    addNote: (sid, body, share) => must(sb.from("teacher_notes").insert({ student_id: sid, body, share_with_parent: share }).select("id").single(), { rows: true }),
    deleteNote: (id) => must(sb.from("teacher_notes").delete().eq("id", id).select("id"), { rows: true }),
    saveSettings: (sid, v) => must(sb.from("student_profiles").update(v).eq("student_id", sid).select("student_id"), { rows: true }),
    saveTheme: (uid, theme) => must(sb.from("user_settings").upsert({ user_id: uid, theme }, { onConflict: "user_id" }).select("user_id")),
    /** Нэг ч удаа тэмдэглэгдээгүй даалгаврыг л устгана (сервер шалгана). Түүхтэй бол түр зогсооно. */
    async deleteTask(id) {
      const r = await must(sb.from("tasks").delete().eq("id", id).select("id"));
      if (!r || !r.length) throw Object.assign(new Error("Энэ даалгаврыг сурагч тэмдэглэж байсан тул устгах боломжгүй. Оноо, түүх хадгалагдахын тулд «Түр зогсоох»-ыг ашиглана уу."), { code: "P0001" });
    },
    /* ---- Эцэг эхийн даалгавар (сурагчийн даалгавраас тусдаа) ---- */
    createParentTask: (row) => must(sb.from("parent_tasks").insert(row).select("id").single(), { rows: true }),
    updateParentTask: (id, v) => must(sb.from("parent_tasks").update(v).eq("id", id).select("id"), { rows: true }),
    async deleteParentTask(id) {
      const r = await must(sb.from("parent_tasks").delete().eq("id", id).select("id"));
      if (!r || !r.length) throw Object.assign(new Error("Эцэг эх биелүүлсэн даалгаврыг устгах боломжгүй. «Архивлах»-ыг ашиглана уу."), { code: "P0001" });
    },
    /** Эцэг эхийн хариу: байхгүй бол нэмнэ, байвал шинэчилнэ (нэг даалгаварт нэг мөр) */
    async saveParentResponse(taskId, v, exists = db.parent_responses.some((r) => r.task_id === taskId)) {
      if (!exists) {
        const { error } = await sb.from("parent_task_responses").insert({ task_id: taskId, ...v }).select("task_id").single();
        if (!error) return;
        if (error.code !== "23505") throw error;   // өөр төхөөрөмжөөс зэрэг үүссэн бол шинэчилнэ
      }
      await must(sb.from("parent_task_responses").update(v).eq("task_id", taskId).select("task_id"), { rows: true });
    },
  };

  /* ================= 5. НЭВТРЭЛТ ================= */

  async function boot() {
    if (!configured || !sb) { state.phase = "setup"; return render(); }
    state.phase = "boot"; render();
    try {
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      if (!data.session) { state.phase = "login"; return render(); }
      await afterSignIn(null);
    } catch (e) {
      state.phase = "login"; state.notice = friendlyError(e); render();
    }
  }

  /** Нэвтэрсний дараа: эрхийг database-ээс уншиж, өгөгдлөө ачаална */
  async function afterSignIn(requestedRole) {
    const { data: sess } = await sb.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) throw new Error("Нэвтрэлт амжилтгүй боллоо. Дахин оролдоно уу.");
    const profile = await must(sb.from("profiles").select("id, role, full_name").eq("id", uid).maybeSingle());
    if (!profile || !ROLES[profile.role]) {
      await sb.auth.signOut();
      state.phase = "login"; state.user = null;
      state.notice = "Энэ аккаунтад эрх олгогдоогүй байна. Сургуулийн админд хандана уу.";
      return render();
    }
    if (requestedRole && profile.role !== requestedRole) {
      await sb.auth.signOut();
      throw new Error(`Энэ аккаунт «${ROLES[requestedRole].label}» эрхгүй байна. Зөв төрлөө сонгоод дахин оролдоно уу.`);
    }
    state.user = profile; state.notice = "";
    // Хадгалсан theme-ийг хэрэглэгчийн тохиргооноос сэргээнэ
    try {
      const s = await must(sb.from("user_settings").select("theme").eq("user_id", profile.id).maybeSingle());
      if (s && s.theme) setTheme(s.theme, false);
    } catch (e) { /* theme ачаалж чадаагүй бол одоогийнхоор үргэлжлүүлнэ */ }
    await loadAndShow();
    const home = ROLES[profile.role].home;
    const { path } = route();
    if (!(path === home || path.startsWith(home + "/"))) go(home); else render();
  }

  async function loadAndShow() {
    state.phase = "loading"; render();
    try { await loadData(); state.phase = "ready"; state.loadError = ""; }
    catch (e) { state.phase = "error"; state.loadError = friendlyError(e); }
    render();
  }

  async function signIn(role, identifier, password) {
    const id = String(identifier || "").trim();
    if (!role) return "Эхлээд нэвтрэх төрлөө сонгоно уу.";
    if (!id || !password) return "Нэвтрэх нэр болон нууц үгээ оруулна уу.";
    let email = id;
    if (!id.includes("@")) {
      if (!USERNAME_DOMAIN) return "И-мэйл хаягаа бүтнээр нь оруулна уу.";
      email = `${id.toLowerCase()}@${USERNAME_DOMAIN}`;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      if (/invalid login credentials/i.test(error.message)) return "Нэвтрэх нэр эсвэл нууц үг буруу байна.";
      if (/email not confirmed/i.test(error.message)) return "И-мэйл баталгаажаагүй байна. Сургуулийн админд хандана уу.";
      return friendlyError(error);
    }
    // Сонгосон role аккаунтын бодит эрхтэй таарч буйг сервер шалгана
    try {
      const ok = await must(sb.rpc("verify_login_role", { requested: role }));
      if (ok !== true) { await sb.auth.signOut(); return `Энэ аккаунт «${ROLES[role].label}» эрхгүй байна. Зөв төрлөө сонгоод дахин оролдоно уу.`; }
      await afterSignIn(role);
      return null;
    } catch (e) {
      await sb.auth.signOut().catch(() => {});
      state.phase = "login"; state.user = null;
      return friendlyError(e);
    }
  }

  async function signOut(notice) {
    // state.user-ийг эхэлж цэвэрлэнэ: SIGNED_OUT event дахин signOut дуудахгүй
    state.user = null; state.phase = "login"; state.notice = notice || "";
    if (sb) await sb.auth.signOut().catch(() => {});
    db = emptyDb();
    Object.assign(ui, { loginRole: null, loginPw: "", loginError: "", drafts: {}, status: {}, errors: {}, editing: null, pickReward: null, schedule: null, open: {} });
    go("/login");
  }

  /* ================= 6. THEME ================= */

  function currentTheme() { return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"; }
  function setTheme(t, persist = true) {
    document.documentElement.setAttribute("data-theme", t);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t === "dark" ? "#16171a" : "#fafaf7");
    try { localStorage.setItem(THEME_KEY, t); } catch (e) { /* энэ төхөөрөмж дээр хадгалах боломжгүй */ }
    // Нэвтэрсэн бол бусад төхөөрөмж дээр ч хэвээр байхаар database-д хадгална
    if (persist && state.user && sb) api.saveTheme(state.user.id, t).catch((e) => console.warn("Theme хадгалагдсангүй:", friendlyError(e)));
  }

  /* ================= 7. ТУСЛАХ HTML ФУНКЦ, ICON ================= */

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const PATHS = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    chevLeft: '<path d="m15 18-6-6 6-6"/>',
    chevRight: '<path d="m9 18 6-6-6-6"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    graduation: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    glove: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    socks: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
    timer: '<path d="M10 2h4M12 14l3-3"/><circle cx="12" cy="14" r="8"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.65-.75 1.65-1.69 0-.44-.18-.84-.44-1.13-.29-.29-.44-.65-.44-1.13a1.64 1.64 0 0 1 1.67-1.67h2c3.05 0 5.56-2.5 5.56-5.55C21.97 6.01 17.46 2 12 2z"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    // Хөлбөмбөгийн бөмбөг: зөвхөн logo, сонирхлын хэсэг, шагнал ба background watermark-д
    ball: '<circle cx="12" cy="12" r="9.5"/><path d="M12 7.6l4 2.9-1.5 4.7h-5L8 10.5z" fill="currentColor" stroke="none"/><path d="M12 7.6V2.6M16 10.5l4.6-1.6M14.5 15.2l2.8 4.1M9.5 15.2l-2.8 4.1M8 10.5L3.4 8.9"/>',
  };
  const icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || PATHS.gift}</svg>`;

  const brand = (compact) => `
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">${icon("ball")}</span>
      <div><p class="brand-name">Өдрийн дэглэм</p>${compact ? "" : '<p class="brand-sub">51 дүгээр сургууль</p>'}</div>
    </div>`;
  const themeBtn = () => {
    const dark = currentTheme() === "dark";
    return `<button type="button" class="icon-btn" data-action="theme" aria-pressed="${dark}"
      aria-label="${dark ? "Өдрийн горимд шилжих" : "Шөнийн горимд шилжих"}" title="${dark ? "Өдрийн горим" : "Шөнийн горим"}">${icon(dark ? "sun" : "moon")}</button>`;
  };
  const progressBar = (pct, label, thin) =>
    `<div class="progress${thin ? " thin" : ""}" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><div style="width:${pct}%"></div></div>`;
  const statusPill = (s) => !s ? '<span class="status none">Хийгээгүй</span>'
    : `<span class="status ${s}">${{ done: "Хийсэн", partial: "Хэсэгчлэн", help: "Дэмжлэг хэрэгтэй" }[s]}</span>`;
  const empty = (title, text = "") => `<div class="empty"><p>${esc(title)}</p>${text ? `<p>${text}</p>` : ""}</div>`;
  const errorAlert = (text) => `<div class="alert error" role="alert">${icon("alert")}<p>${esc(text)}</p></div>`;
  const pageHead = (title, eyebrow, lead) =>
    `<header class="page-head">${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}<h1>${esc(title)}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</header>`;
  const field = (label, id, control, { hint, error } = {}) =>
    `<div class="field"><label for="${id}">${label}</label>${control}${error ? `<p class="error-text" role="alert">${esc(error)}</p>` : hint ? `<p class="hint">${hint}</p>` : ""}</div>`;

  /* ---- UI төлөв (хадгалагдахгүй) ---- */
  const ui = {
    loginRole: null, loginId: "", loginPw: "", loginError: "", loginBusy: false, showPw: false,
    open: {}, drafts: {}, status: {}, errors: {}, editing: null, pickReward: null, schedule: null, pending: new Set(), confirm: null,
  };
  const draft = (key, fallback) => (key in ui.drafts ? ui.drafts[key] : fallback);
  const clearDrafts = (prefix) => { for (const k of Object.keys(ui.drafts)) if (k.startsWith(prefix)) delete ui.drafts[k]; };
  const busy = (key) => !!ui.status[key]?.saving;
  const dis = (key) => (busy(key) ? "disabled" : "");
  function saveStatus(key) {
    const s = ui.status[key];
    if (!s) return '<span class="save-status" aria-live="polite"></span>';
    if (s.saving) return `<span class="save-status" aria-live="polite"><span class="spinner sm" aria-hidden="true"></span>Хадгалж байна…</span>`;
    return s.ok
      ? `<span class="save-status ok" aria-live="polite">${icon("checkCircle", "sm")}Хадгалагдсан · ${s.at}</span>`
      : `<span class="save-status err" role="alert">${icon("alert", "sm")}Хадгалагдсангүй: ${esc(s.text)}</span>`;
  }
  /**
   * Хадгалах үйлдлийг ажиллуулна: «Хадгалж байна» → сервер хариулах → «Хадгалагдсан» эсвэл алдаа.
   * Алдаа гарвал хэзээ ч амжилттай болсон мэт харуулахгүй. reload=true бол дараа нь өгөгдлийг дахин ачаална.
   */
  async function run(key, fn, { onOk, reload = true } = {}) {
    captureDrafts();
    ui.status[key] = { saving: true }; render();
    try {
      const result = await fn();
      if (reload) await loadData();
      captureDrafts();
      ui.status[key] = { ok: true, at: clock() };
      if (onOk) onOk(result);
    } catch (e) {
      captureDrafts();
      ui.status[key] = { ok: false, text: friendlyError(e) };
    }
    render();
  }

  /* ================= 8. ДЭЛГЭЦҮҮД ================= */

  function viewCenter(content) {
    return `<div class="login"><div class="login-inner"><div class="row between">${brand()}${themeBtn()}</div>${content}</div></div>`;
  }
  const viewBoot = (text = "Ачаалж байна…") => viewCenter(`<div class="center-msg" role="status"><span class="spinner" aria-hidden="true"></span><p>${text}</p></div>`);

  /** Supabase тохируулаагүй үед: ажиллаж байгаа мэт харуулахгүй */
  function viewSetup() {
    const reason = !libLoaded ? "Supabase-ийн сан ачаалагдсангүй. Интернэт холболтоо шалгана уу." : "Supabase-ийн холболтын тохиргоо (config.js) хийгдээгүй байна.";
    return viewCenter(`
      <h1>Сервер тохируулаагүй байна</h1>
      <p class="muted" style="margin-top:8px;font-size:15px">${reason} Тохиргоо дуустал нэвтрэх, мэдээлэл хадгалах боломжгүй.</p>
      <ol class="setup-steps">
        <li>supabase.com дээр төсөл үүсгэнэ.</li>
        <li>SQL Editor-т <code>supabase/migrations/0001_init.sql</code>-ийг ажиллуулна.</li>
        <li><code>.env.local</code> файлд Project URL болон anon (publishable) түлхүүрээ бичнэ.</li>
        <li><code>npm run config</code> командаар <code>public/config.js</code>-ийг үүсгэнэ.</li>
        <li>Аккаунтуудыг <code>npm run admin</code>-аар үүсгэнэ.</li>
      </ol>
      <p class="muted small" style="margin-top:12px">Дэлгэрэнгүй алхмуудыг README.md-ээс харна уу.</p>`);
  }
  function viewLoadError() {
    return viewCenter(`<div style="margin-top:40px" class="stack">
      ${errorAlert(state.loadError || "Мэдээлэл ачаалж чадсангүй.")}
      <div class="row"><button type="button" class="btn btn-primary" data-action="retry-load">Дахин оролдох</button>
        <button type="button" class="btn btn-ghost" data-action="logout">${icon("logout", "sm")}Гарах</button></div></div>`);
  }

  /* ---------- Login ---------- */
  function viewLogin() {
    const role = ui.loginRole, err = ui.loginError || state.notice;
    const idLabel = USERNAME_DOMAIN ? "И-мэйл эсвэл нэвтрэх нэр" : "И-мэйл";
    return `
    <div class="login"><div class="login-inner">
      <div class="row between">${brand()}${themeBtn()}</div>
      <h1>Нэвтрэх</h1>
      <p class="muted" style="margin-top:4px;font-size:15px">Суралцагчийн өдрийн дэглэм, дэмжлэгийн төлөвлөгөө</p>

      <form class="form" data-form="login" novalidate style="margin-top:32px;gap:24px">
        <fieldset style="border:0;margin:0;padding:0">
          <legend class="strong" style="font-size:15px">Та хэн бэ?</legend>
          <div class="roles" role="radiogroup">
            ${Object.entries(ROLES).map(([id, r]) => `
              <button type="button" class="role" role="radio" aria-checked="${role === id}" data-action="pick-role" data-role="${id}" id="role-${id}">
                <span class="role-icon">${icon(r.icon)}</span>
                <span class="grow"><span class="strong" style="display:block">${r.label}</span><span class="muted small" style="display:block">${r.desc}</span></span>
                <span class="role-dot" aria-hidden="true"></span>
              </button>`).join("")}
          </div>
        </fieldset>

        <div class="form login-fields" aria-disabled="${!role}">
          ${field(idLabel, "login-id", `<input class="input" id="login-id" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" inputmode="email" value="${esc(ui.loginId)}" ${role ? "" : "disabled"}>`)}
          <div class="field">
            <label for="login-pw">Нууц үг</label>
            <div class="pw-wrap">
              <input class="input" id="login-pw" name="password" type="${ui.showPw ? "text" : "password"}" autocomplete="current-password" value="${esc(ui.loginPw)}" ${role ? "" : "disabled"}>
              <button type="button" class="icon-btn" data-action="toggle-pw" aria-pressed="${ui.showPw}" aria-label="${ui.showPw ? "Нууц үгийг нуух" : "Нууц үгийг харуулах"}" ${role ? "" : "disabled"}>${icon(ui.showPw ? "eyeOff" : "eye")}</button>
            </div>
          </div>
        </div>

        ${err ? errorAlert(err) : ""}

        <button type="submit" class="btn btn-primary" ${role && !ui.loginBusy ? "" : "disabled"}>${ui.loginBusy ? '<span class="spinner sm" aria-hidden="true"></span>Нэвтэрч байна…' : "Нэвтрэх"}</button>
        <p class="muted small">Аккаунтыг сургууль үүсгэж олгоно. Нууц үгээ мартсан бол анги удирдсан багшдаа хандана уу.</p>
      </form>
    </div></div>`;
  }

  /* ---------- Shell ---------- */
  const NAV = {
    student: [["/s", "Өнөөдөр", "sun"], ["/s/rewards", "Шагнал", "gift"], ["/s/schedule", "Хуваарь", "calendar"], ["/s/history", "Түүх", "history"]],
    teacher: [["/t", "Сурагчид", "users"], ["/t/parents", "Эцэг эх", "heart"]],
    guardian: [["/p", "Өнөөдөр", "sun"], ["/p/tasks", "Миний даалгавар", "checkCircle"], ["/p/week", "Долоо хоног", "clipboard"]],
  };
  function shell(user, path, content) {
    const items = NAV[user.role];
    const active = (to) => (to === path || (to !== ROLES[user.role].home && path.startsWith(to)) || (path.startsWith("/s/day/") && to === "/s/history") || (path.startsWith("/t/student/") && to === "/t"));
    const links = (cls) => items.map(([to, label, ic]) =>
      `<a href="#${to}" ${active(to) ? 'aria-current="page"' : ""}>${cls === "bottom" ? `<span class="pill-icon">${icon(ic)}</span>` : icon(ic)}${label}</a>`).join("");
    return `
    <div class="layout">
      <aside class="sidebar">
        <div class="row between">${brand()}${themeBtn()}</div>
        <nav class="side-nav" aria-label="Үндсэн цэс">${links("side")}</nav>
        <div class="side-foot">
          <p class="strong" style="font-size:15px">${esc(user.full_name || "Хэрэглэгч")}</p>
          <p class="muted small">${ROLES[user.role].label}</p>
          <div><button type="button" class="btn btn-ghost btn-sm" data-action="logout" style="margin-top:8px;padding:0 8px">${icon("logout", "sm")}Гарах</button></div>
        </div>
      </aside>
      <header class="topbar"><div class="topbar-inner">
        ${brand(true)}
        <span class="topbar-role">${ROLES[user.role].label}</span>
        ${themeBtn()}
        <button type="button" class="icon-btn" data-action="logout" aria-label="Гарах">${icon("logout")}</button>
      </div></header>
      <main class="main${items.length > 1 ? " has-bottom-nav" : ""}" id="main">${content}</main>
      ${items.length > 1 ? `<nav class="bottom-nav" aria-label="Үндсэн цэс"><div class="bottom-nav-inner">${links("bottom")}</div></nav>` : ""}
    </div>`;
  }

  /* ---------- Даалгаврын жагсаалт ---------- */
  function taskGroups(sid, date, editable) {
    const tasks = tasksOf(sid), st = statusMap(sid, date);
    let openedFirst = false;
    return CATEGORIES.map((c) => {
      const items = tasks.filter((t) => t.category === c.id);
      if (!items.length) return "";
      const done = items.filter((t) => st.get(t.id) === "done").length;
      const unfinished = items.some((t) => !st.get(t.id));
      const key = `${sid}:${date}:${c.id}`;
      let open = ui.open[key];
      if (open === undefined) open = unfinished && !openedFirst;   // эхний дуусаагүй бүлгийг нээлттэй харуулна
      if (unfinished) openedFirst = true;
      return `
      <div class="group">
        <button type="button" class="group-toggle" data-action="toggle-group" data-key="${key}" aria-expanded="${open}" aria-controls="g-${key}" id="gt-${key}">
          ${c.id === "interest" ? `<span class="group-icon">${icon("ball")}</span>` : ""}
          <span class="grow">${c.label}</span>
          <span class="num small ${done === items.length ? "ok-text" : "muted"}">${done}/${items.length}</span>
          <span class="chev">${icon("chevDown")}</span>
        </button>
        <ul class="list" id="g-${key}" ${open ? "" : "hidden"} style="padding-bottom:8px">
          ${items.map((t) => taskRow(t, st.get(t.id) || null, editable)).join("")}
        </ul>
      </div>`;
    }).join("");
  }
  function taskRow(t, status, editable) {
    const done = status === "done", wait = ui.pending.has(t.id) ? "disabled" : "";
    const meta = [SLOTS[t.slot], t.minutes ? `${t.minutes} мин` : "", t.points ? `${t.points} оноо` : ""].filter(Boolean).join(" · ");
    return `
    <li class="task${done ? " done" : ""}" style="border:0">
      ${editable ? `<button type="button" class="check" id="chk-${t.id}" data-action="task" data-id="${t.id}" data-status="${done ? "" : "done"}" aria-pressed="${done}" ${wait}
          aria-label="${esc(t.title)}: ${done ? "хийсэн тэмдэглэгээг арилгах" : "хийсэн гэж тэмдэглэх"}">${icon("check")}</button>` : ""}
      <div class="grow">
        <p class="task-title">${esc(t.title)}</p>
        ${t.description ? `<p class="task-desc">${esc(t.description)}</p>` : ""}
        <p class="task-meta">${meta}</p>
        ${editable ? `<div class="task-opts">
          <button type="button" class="opt-btn partial" id="par-${t.id}" data-action="task" data-id="${t.id}" data-status="${status === "partial" ? "" : "partial"}" aria-pressed="${status === "partial"}" ${wait}>Хэсэгчлэн хийсэн</button>
          <button type="button" class="opt-btn help" id="hlp-${t.id}" data-action="task" data-id="${t.id}" data-status="${status === "help" ? "" : "help"}" aria-pressed="${status === "help"}" ${wait}>Дэмжлэг хэрэгтэй</button>
        </div>` : ""}
      </div>
      ${editable ? "" : statusPill(status)}
    </li>`;
  }

  /* ---------- Өдрийн бүртгэлийн форм (сурагч ба эцэг эх) ---------- */
  function dailyLogForm(child, date, who) {
    const h = dailyLog(child.id, date) || {}, k = `dl:${child.id}:${date}`, e = ui.errors[k] || {}, editable = isEditable(date);
    const dv = (name, fb) => draft(`${k}:${name}`, fb);
    const scr = h.screen_minutes;
    const title = who === "student" ? "Өдрийн бүртгэл" : "Гэрийн хяналтын хуудас";
    return `<section class="card">
      <div class="card-head"><div><h2>${title}</h2><p>${formatShort(date)} · Дэлгэцийн хязгаар ${child.screen_limit_min} мин</p></div></div>
      <form class="form card-pad" data-form="daily" data-sid="${child.id}" data-date="${date}" novalidate style="gap:20px">
        <fieldset ${editable ? "" : "disabled"} style="border:0;margin:0;padding:0;display:grid;gap:20px">
          <div class="field"><span class="label">Дэлгэцийн нийт хэрэглээ</span>
            <div class="row"><input class="input w-sm" aria-label="Дэлгэц: цаг" name="h" data-draft="${k}:h" type="number" inputmode="numeric" min="0" max="16" value="${esc(dv("h", scr == null ? "" : Math.floor(scr / 60)))}" ${e.screen ? 'aria-invalid="true"' : ""}><span class="muted">цаг</span>
              <input class="input w-sm" aria-label="Дэлгэц: минут" name="m" data-draft="${k}:m" type="number" inputmode="numeric" min="0" max="59" value="${esc(dv("m", scr == null ? "" : scr % 60))}" ${e.screen ? 'aria-invalid="true"' : ""}><span class="muted">минут</span></div>
            ${e.screen ? `<p class="error-text" role="alert">${e.screen}</p>` : '<p class="hint">Гараар оруулна. Сайт утас, компьютерийн хэрэглээг өөрөө хянадаггүй.</p>'}</div>
          <div class="field"><label for="dl-move-${k}">Хөдөлгөөн</label>
            <div class="row"><input class="input w-sm" id="dl-move-${k}" name="move" data-draft="${k}:move" type="number" inputmode="numeric" min="0" max="600" value="${esc(dv("move", h.movement_minutes ?? ""))}" ${e.move ? 'aria-invalid="true"' : ""}><span class="muted">минут</span></div>
            ${e.move ? `<p class="error-text" role="alert">${e.move}</p>` : ""}</div>
          <div class="field"><span class="label">Ариун цэвэр</span><div class="row">
            ${[["hm", "hygiene_morning", "Өглөө"], ["he", "hygiene_evening", "Орой"], ["hr", "hygiene_reminded", "Сануулгатай"]].map(([n, f, l]) =>
              `<label class="choice"><input type="checkbox" name="${n}" data-draft="${k}:${n}" ${dv(n, !!h[f]) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
          <div class="grid-2">
            ${field("Унтсан цаг", `dl-bed-${k}`, `<input class="input" id="dl-bed-${k}" name="bed" type="time" data-draft="${k}:bed" value="${esc(dv("bed", h.bed_time || ""))}">`)}
            ${field("Сэрсэн цаг", `dl-wake-${k}`, `<input class="input" id="dl-wake-${k}" name="wake" type="time" data-draft="${k}:wake" value="${esc(dv("wake", h.wake_time || ""))}">`)}
          </div>
          <div class="field"><span class="label">Дэлгэцгүй үйл ажиллагаа</span><div class="row">
            ${OFFSCREEN.map(([id, l]) => `<label class="choice"><input type="checkbox" name="act" value="${id}" data-draft="${k}:act:${id}" ${dv("act:" + id, (h.offscreen || []).includes(id)) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
          ${field("Гэрийн жижиг ажил", `dl-chore-${k}`, `<input class="input" id="dl-chore-${k}" name="chore" data-draft="${k}:chore" maxlength="160" placeholder="Жишээ нь: аяга угаасан" value="${esc(dv("chore", h.chore || ""))}">`)}
          <div class="field"><span class="label" id="mood-l-${k}">Сэтгэл санаа</span><div class="row" role="radiogroup" aria-labelledby="mood-l-${k}">
            ${MOODS.map(([id, l]) => `<label class="choice"><input type="radio" name="mood" value="${id}" data-draft="${k}:mood:${id}" ${dv("mood:" + id, h.mood === id) ? "checked" : ""}><span>${l}</span></label>`).join("")}</div></div>
          ${field("Нойр, ажиглалт", `dl-sleep-${k}`, `<textarea class="input" id="dl-sleep-${k}" name="sleep" data-draft="${k}:sleep" maxlength="500" placeholder="Жишээ нь: өглөө эрч хүчтэй сэрсэн">${esc(dv("sleep", h.sleep_note || ""))}</textarea>`)}
        </fieldset>
        <div class="form-foot" style="border-top:1px solid var(--line);padding-top:16px">
          ${editable ? saveStatus(k) + `<button type="submit" class="btn btn-primary" ${dis(k)}>Хадгалах</button>` : '<p class="muted small">7 хоногоос өмнөх бүртгэлийг засах боломжгүй.</p>'}
        </div>
      </form>
    </section>`;
  }

  /* ---------- Сурагч: өдөр ---------- */
  function viewStudentDay(date) {
    const s = db.students.find((x) => x.id === state.user.id);
    if (!s) return `<div class="card">${empty("Сурагчийн бүртгэл олдсонгүй", "Анги удирдсан багшдаа хандана уу.")}</div>`;
    const t = today(), isToday = date === t, editable = isEditable(date);
    const p = progress(s.id, date), goal = dayGoal(s.id, date), pts = points(s.id);
    const noteKey = `note:${s.id}:${date}`, savedNote = studentNote(s.id, date);
    const head = isToday
      ? pageHead(`${greeting()}, ${s.full_name.split(" ")[0]}!`, formatLong(date))
      : `<a class="back" href="#/s/history">${icon("chevLeft", "sm")}Түүх</a>${pageHead(formatLong(date), "", editable ? "Энэ өдрийн бүртгэлээ засаж болно." : "Энэ өдрийн бүртгэлийг зөвхөн харах боломжтой.")}`;
    return `
    <div class="stack">
      <div>${head}</div>
      <section class="card card-pad">
        <div class="row between" style="align-items:baseline">
          <p class="strong">Өдрийн ахиц</p>
          <p class="num muted" style="font-size:15px"><span class="strong" style="color:var(--ink)">${p.done}</span> / ${p.total} хийсэн · ${p.pct}%</p>
        </div>
        <div style="margin-top:12px">${progressBar(p.pct, "Өдрийн ахиц")}</div>
        ${goal ? `<p class="row" style="margin-top:16px;align-items:flex-start;flex-wrap:nowrap;font-size:15px"><span class="group-icon">${icon("target")}</span><span><span class="muted">Өнөөдрийн жижиг зорилго: </span>${esc(goal)}</span></p>` : ""}
        ${p.total && p.done === p.total ? '<p class="ok-text strong" style="margin-top:12px;font-size:15px">Өнөөдрийн бүх зүйлээ хийлээ. Сайн байна!</p>' : ""}
        <a class="points-link" href="#/s/rewards"><span>Миний оноо: <b class="num" id="my-points">${pts.balance}</b></span><span class="go">Шагнал${icon("chevRight", "sm")}</span></a>
      </section>
      ${ui.status.task && ui.status.task.ok === false ? errorAlert("Хадгалагдсангүй: " + ui.status.task.text) : ""}
      <section class="card">
        <div class="card-head"><div><h2>Хийх зүйлс</h2><p>Хийснээ тэмдэглэ. Хэцүү байвал «Дэмжлэг хэрэгтэй»-г сонго.</p></div></div>
        <div class="card-body">${p.total ? taskGroups(s.id, date, editable) : empty("Даалгавар оноогдоогүй байна", "Багш тань даалгавар нэмэхэд энд харагдана.")}</div>
      </section>
      <section class="card card-pad">
        <form class="form" data-form="note" data-sid="${s.id}" data-date="${date}" novalidate>
          <div class="field">
            <label for="day-note">Өдрийн тэмдэглэл</label>
            <p class="hint">Өнөөдөр юу сайн болсон бэ? Юу хэцүү байсан бэ?</p>
            <textarea class="input" id="day-note" data-draft="${noteKey}" maxlength="500" ${editable ? "" : "disabled"}>${esc(draft(noteKey, savedNote))}</textarea>
          </div>
          <div class="form-foot">${saveStatus(noteKey)}${editable ? `<button type="submit" class="btn btn-primary btn-sm" ${dis(noteKey)}>Хадгалах</button>` : ""}</div>
        </form>
      </section>
      ${dailyLogForm(s, date, "student")}
    </div>`;
  }

  /* ---------- Сурагч: шагнал ---------- */
  function pointsLine(pts) {
    return `Цуглуулсан ${pts.earned}${pts.adjusted ? ` · Багшийн тохируулга ${pts.adjusted > 0 ? "+" : ""}${pts.adjusted}` : ""} · Зарцуулсан ${pts.spent}`;
  }
  function viewStudentRewards() {
    const s = db.students.find((x) => x.id === state.user.id);
    if (!s) return `<div class="card">${empty("Сурагчийн бүртгэл олдсонгүй")}</div>`;
    const pts = points(s.id);
    const rewards = db.rewards.filter((r) => r.student_id === s.id && r.active).sort((a, b) => a.cost - b.cost);
    const got = db.transactions.filter((r) => r.student_id === s.id && r.kind === "redeem");
    const msg = ui.status.reward;
    const pick = ui.pickReward && rewards.find((r) => r.id === ui.pickReward);
    return `
    <div class="stack">
      ${pageHead("Шагнал", "", "Хийсэн даалгавар бүр оноо өгнө. Шагнал бол худалдан авалт биш: эцэг эх, багштайгаа тохиролцож авна.")}
      <section class="card card-pad balance">
        <div><p class="muted" style="font-size:15px">Миний оноо</p><p class="balance-num num" id="balance" aria-live="polite">${pts.balance}</p></div>
        <p class="num muted small">${pointsLine(pts)}</p>
      </section>
      ${msg && !msg.saving ? (msg.ok ? `<div class="alert success" role="status">${esc(msg.text)}</div>` : errorAlert(msg.text)) : ""}
      ${rewards.length ? `<ul class="rewards">${rewards.map((r) => {
        const short = pts.balance < r.cost, pct = Math.min(100, Math.round((Math.max(0, pts.balance) / r.cost) * 100));
        return `<li><article class="card reward">
          <div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:12px">
            <span class="reward-icon${short ? " locked" : ""}">${icon(r.icon, "lg")}</span>
            <div class="grow"><h3 style="font-size:16px;font-weight:500">${esc(r.title)}</h3><p class="reward-cost num">${r.cost} оноо</p></div>
          </div>
          ${r.description ? `<p class="muted small" style="margin-top:12px">${esc(r.description)}</p>` : ""}
          <div class="reward-foot">
            ${short ? `<div style="margin-bottom:12px">${progressBar(pct, r.title + " хүртэл", true)}<p class="muted small" style="margin-top:6px">Оноо хүрэлцэхгүй байна · ${r.cost - pts.balance} дутуу</p></div>` : ""}
            <button type="button" class="btn btn-block ${short ? "btn-secondary" : "btn-primary"}" id="rw-${r.id}" data-action="pick-reward" data-id="${r.id}" ${short ? "disabled" : ""}
              aria-label="${esc(r.title)}${short ? ": оноо хүрэлцэхгүй байна" : " авах"}">Авах</button>
          </div>
        </article></li>`;
      }).join("")}</ul>` : `<div class="card">${empty("Шагнал алга", "Багш шагнал нэмэхэд энд харагдана.")}</div>`}
      <section class="card" id="got">
        <div class="card-head"><h2>Авсан шагналууд</h2></div>
        ${got.length ? `<ul class="list card-body">${got.map((r) => `
          <li class="list-row"><span class="reward-icon small">${icon(r.icon)}</span>
            <div class="grow"><p class="strong">${esc(r.title)}</p><p class="muted xs">${formatLong(dateOfTs(r.created_at))}</p></div>
            <span class="num muted small">${r.points}</span></li>`).join("")}</ul>`
          : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Одоогоор шагнал аваагүй байна.</p>'}
      </section>
      ${pick ? `<div class="scrim" data-action="close-dialog" data-self="1">
        <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
          <h2 id="dlg-h">Шагнал авах уу?</h2>
          <p>«${esc(pick.title)}» шагналд <b style="color:var(--ink)">${pick.cost} оноо</b> зарцуулна. Үлдэх оноо: ${pts.balance - pick.cost}.</p>
          <div class="row"><button type="button" class="btn btn-secondary btn-sm" data-action="close-dialog" id="dlg-cancel" ${dis("reward")}>Болих</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="confirm-reward" data-id="${pick.id}" ${dis("reward")}>${busy("reward") ? '<span class="spinner sm" aria-hidden="true"></span>' : ""}Тийм, авах</button></div>
        </div></div>` : ""}
    </div>`;
  }

  /* ---------- Сурагч: хуваарь, түүх ---------- */
  function scheduleList(sid) {
    const rows = db.schedule.filter((r) => r.student_id === sid).sort((a, b) => a.sort - b.sort);
    if (!rows.length) return empty("Хуваарь хоосон байна", "Багш хуваарь нэмэхэд энд харагдана.");
    const now = nowMinutes();
    let current = -1;
    rows.forEach((r, i) => { if (r.start_time) { const [h, m] = r.start_time.split(":").map(Number); if (h * 60 + m <= now) current = i; } });
    return `<ol class="list">${rows.map((r, i) => `
      <li class="sched-row${i === current ? " now" : ""}">
        <span class="sched-time num">${esc(r.start_time || "—")}</span>
        <div class="grow"><p class="muted small">${esc(r.period)}${i === current ? ' <span class="strong" style="color:var(--accent-ink)">· Одоо</span>' : ""}</p><p class="strong">${esc(r.activity)}</p></div>
      </li>`).join("")}</ol>`;
  }
  function viewStudentSchedule() {
    return `${pageHead("Өдрийн хуваарь", "", "Цагийг багш тань тохируулна.")}<section class="card">${scheduleList(state.user.id)}</section>`;
  }
  function viewStudentHistory() {
    const sid = state.user.id, t = today();
    const days = lastDays(14, t).reverse();
    const hasAny = days.some((d) => statusMap(sid, d).size || dailyLog(sid, d));
    return `${pageHead("Өмнөх өдрүүд", "", "Сүүлийн 14 хоног. Сүүлийн 7 хоногийн бүртгэлээ засаж болно.")}
    <section class="card">${hasAny ? `<ul class="list">${days.map((d) => {
      const p = progress(sid, d), note = studentNote(sid, d);
      return `<li><a class="list-row" href="#${d === t ? "/s" : "/s/day/" + d}">
        <div class="grow">
          <div class="row between" style="align-items:baseline"><p class="strong">${d === t ? "Өнөөдөр" : formatLong(d)}</p><p class="num muted small">${p.done}/${p.total}${p.help ? ` · ${p.help} дэмжлэг` : ""}</p></div>
          <div style="margin-top:8px">${progressBar(p.pct, d + " ахиц")}</div>
          ${note ? `<p class="muted small" style="margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(note)}</p>` : ""}
        </div>${icon("chevRight")}</a></li>`;
    }).join("")}</ul>` : empty("Бүртгэл алга", "Хийсэн зүйлээ тэмдэглэхэд энд өдөр өдрөөр харагдана.")}</section>`;
  }

  /* ---------- Хуваалцсан хэсгүүд ---------- */
  function categoryBars(sid, date) {
    const p = progress(sid, date);
    return `<div class="cat-bars">${CATEGORIES.filter((c) => p.byCat[c.id]).map((c) => {
      const v = p.byCat[c.id], pct = Math.round((v.score / v.total) * 100);
      return `<div class="cat-bar"><span style="font-size:15px">${c.label}</span><span class="num muted small right">${pct}%</span>${progressBar(pct, c.label)}</div>`;
    }).join("")}</div>`;
  }
  function weekTable(s) {
    const t = today();
    return `<div class="table-wrap"><table class="cardify">
      <thead><tr><th>Өдөр</th><th>Биелэлт</th><th class="right">Дэлгэц</th><th class="right">Хөдөлгөөн</th><th class="right">Унтсан</th></tr></thead>
      <tbody>${lastDays(7, t).reverse().map((d) => {
        const p = progress(s.id, d), h = dailyLog(s.id, d), over = h && h.screen_minutes != null && h.screen_minutes > s.screen_limit_min;
        return `<tr><td class="day-cell">${d === t ? "Өнөөдөр" : formatShort(d)}</td>
          <td data-label="Биелэлт"><div class="mini-bar">${progressBar(p.pct, d + " биелэлт")}<span class="num muted small">${p.pct}%</span></div></td>
          <td data-label="Дэлгэц" class="right num${over ? " warn-text strong" : ""}">${fmtMinutes(h ? h.screen_minutes : null)}</td>
          <td data-label="Хөдөлгөөн" class="right num">${h && h.movement_minutes != null ? h.movement_minutes + " мин" : "—"}</td>
          <td data-label="Унтсан" class="right num">${h && h.bed_time ? h.bed_time : "—"}</td></tr>`;
      }).join("")}</tbody></table></div>`;
  }
  function dailySummary(s, date) {
    const h = dailyLog(s.id, date);
    if (!h) return '<p class="muted" style="padding:0 20px 20px;font-size:15px">Энэ өдрийн бүртгэл бөглөгдөөгүй байна.</p>';
    const hyg = [h.hygiene_morning ? "өглөө" : "", h.hygiene_evening ? "орой" : ""].filter(Boolean).join(", ") + (h.hygiene_reminded ? " · сануулгатай" : "");
    const rows = [
      ["Дэлгэц", `${fmtMinutes(h.screen_minutes)}${h.screen_minutes != null ? ` (хязгаар ${fmtMinutes(s.screen_limit_min)})` : ""}`],
      ["Хөдөлгөөн", h.movement_minutes != null ? h.movement_minutes + " мин" : "—"],
      ["Ариун цэвэр", hyg || "—"],
      ["Унтсан / сэрсэн", h.bed_time || h.wake_time ? `${h.bed_time || "—"} / ${h.wake_time || "—"}` : "—"],
      ["Дэлгэцгүй үйл ажиллагаа", (h.offscreen || []).map((o) => (OFFSCREEN.find((x) => x[0] === o) || [o, o])[1]).join(", ") || "—"],
      ["Гэрийн ажил", h.chore || "—"],
      ["Сэтгэл санаа", (MOODS.find((m) => m[0] === h.mood) || [0, "—"])[1]],
      ["Нойр, ажиглалт", h.sleep_note || "—"],
    ];
    return `<dl class="facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  }

  /* ---------- Багш: сурагчдын жагсаалт ---------- */
  /** Сүүлийн 7 хоногийн өдөр бүрийн биелэлт (жижиг багана) */
  function miniWeek(s) {
    const t = today();
    return `<div class="mini-week" role="img" aria-label="Сүүлийн 7 хоногийн биелэлт">${lastDays(7, t).map((d) => {
      const p = progress(s.id, d), x = parseDate(d);
      return `<span class="mw-day" title="${formatShort(d)}: ${p.total ? p.pct + "%" : "—"}">
        <span class="mw-bar"><span style="height:${p.total ? Math.max(p.pct, 4) : 0}%"${p.help ? ' class="help"' : ""}></span></span>
        <span class="mw-lbl${d === t ? " strong" : ""}">${WEEKDAYS_SHORT[x.getUTCDay()]}</span></span>`;
    }).join("")}</div>`;
  }
  function viewTeacherHome() {
    const t = today(), list = myStudents();
    return `${pageHead("Хариуцсан сурагчид", formatLong(t), "Өнөөдрийн биелэлт, оноо, сүүлийн 7 хоног. Дэлгэрэнгүйг сурагч дээр дарж харна.")}
    <section class="card">${list.length ? `<ul class="list">${list.map((s) => {
      const p = progress(s.id, t), pts = points(s.id).balance, kids = db.parents.filter((x) => x.student_id === s.id).length;
      return `<li><a class="list-row student-row" href="#/t/student/${s.id}">
        <div class="grow">
          <div class="row between" style="align-items:baseline;gap:4px 12px">
            <p class="strong">${esc(s.full_name)} <span class="muted small" style="font-weight:400">${esc(s.class_name || "")}</span></p>
            <p class="num small"><span class="tag">${pts} оноо</span></p>
          </div>
          <p class="num muted small" style="margin-top:4px">Өнөөдөр: ${p.total ? `${p.pct}% · ${p.done}/${p.total} хийсэн` : "Даалгаваргүй"}${p.help ? ` <span class="status help">${p.help} дэмжлэг</span>` : ""}${db.parentFeature ? ` · эцэг эх ${kids}` : ""}</p>
          <div style="margin-top:8px">${progressBar(p.pct, s.full_name + " өнөөдрийн ахиц")}</div>
          ${p.total || tasksOf(s.id).length ? miniWeek(s) : ""}
        </div>${icon("chevRight")}</a></li>`;
    }).join("")}</ul>` : empty("Танд хариуцуулсан сурагч алга", "Сургуулийн админ таны аккаунтыг сурагчтай холбосны дараа энд харагдана.")}</section>`;
  }

  /* ---------- Багш: нэг сурагч ---------- */
  const TEACHER_TABS = [["overview", "Тойм"], ["tasks", "Даалгавар"], ["schedule", "Хуваарь"], ["rewards", "Шагнал"], ["notes", "Тэмдэглэл, зорилго"], ["settings", "Тохиргоо"]];
  function viewTeacherStudent(id, tab) {
    const s = getStudent(id);
    if (!s) return `<div class="card">${empty("Сурагч олдсонгүй", 'Энэ сурагч танд хариуцуулагдаагүй байна. <a href="#/t">Жагсаалт руу буцах</a>')}</div>`;
    const panel = { overview: tOverview, tasks: tTasks, schedule: tSchedule, rewards: tRewards, notes: tNotes, settings: tSettings }[tab] || tOverview;
    return `<a class="back" href="#/t">${icon("chevLeft", "sm")}Сурагчид</a>
      ${pageHead(s.full_name, "", esc(s.class_name || "51 дүгээр сургууль"))}
      <div class="pills" role="tablist" aria-label="Сурагчийн хэсгүүд">${TEACHER_TABS.map(([k, label]) =>
        `<button type="button" class="pill-btn" role="tab" id="tab-${k}" aria-selected="${tab === k}" data-action="tab" data-tab="${k}">${label}</button>`).join("")}</div>
      <div role="tabpanel">${panel(s)}</div>`;
  }

  function seedCard(s) {
    return `<section class="card">${empty("Даалгавар алга", "51 дүгээр сургуулийн төлөвлөгөөний анхны даалгавар, хуваарь, шагналыг ачаалж эхлэх боломжтой. Дараа нь засна.")}
      <div class="row" style="justify-content:center;padding:0 20px 24px;gap:12px">
        <button type="button" class="btn btn-primary" data-action="seed" data-id="${s.id}" ${dis("seed")}>Анхны төлөвлөгөөг ачаалах</button>
      </div>
      ${ui.status.seed && ui.status.seed.ok === false ? `<div style="padding:0 20px 20px">${errorAlert(ui.status.seed.text)}</div>` : ""}</section>`;
  }

  function tOverview(s) {
    const t = today(), p = progress(s.id, t), note = studentNote(s.id, t);
    if (!tasksOf(s.id, true).length) return seedCard(s);
    const helps = db.task_logs.filter((l) => l.student_id === s.id && l.status === "help" && l.log_date >= addDays(t, -6)).sort((a, b) => b.log_date.localeCompare(a.log_date));
    const title = (tid) => db.tasks.find((x) => x.id === tid)?.title || "Хасагдсан даалгавар";
    return `<div class="stack">
      <section class="card card-pad">
        <div class="row between" style="align-items:baseline"><h2 style="font-size:17px">Өнөөдөр</h2><p class="num muted" style="font-size:15px">${p.done}/${p.total} хийсэн · ${p.pct}% · зорилго ${s.goal_pct}%</p></div>
        <div style="margin-top:12px">${progressBar(p.pct, "Өнөөдрийн биелэлт")}</div>
        <div style="margin-top:20px">${categoryBars(s.id, t)}</div>
        ${note ? `<p class="note-box" style="margin-top:20px"><span class="muted">Сурагчийн тэмдэглэл: </span>${esc(note)}</p>` : ""}
        <p class="muted small" style="margin-top:16px">Оноо: <span class="num">${points(s.id).balance}</span></p>
      </section>
      <section class="card"><div class="card-head"><div><h2>Дэмжлэг хэрэгтэй гэж тэмдэглэсэн</h2><p>Сүүлийн 7 хоног</p></div></div>
        ${helps.length ? `<ul class="list card-body">${helps.map((h) => `<li class="list-row"><span class="grow">${esc(title(h.task_id))}</span><span class="num muted small">${formatShort(h.log_date)}</span></li>`).join("")}</ul>`
          : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Дэмжлэг хүссэн даалгавар алга.</p>'}</section>
      <section class="card"><div class="card-head"><div><h2>Долоо хоног</h2><p>Дэлгэц, хөдөлгөөнийг сурагч эсвэл эцэг эх гараар оруулна</p></div></div><div class="card-body">${weekTable(s)}</div></section>
      <section class="card"><div class="card-head"><div><h2>Өдрийн бүртгэл</h2><p>${formatLong(t)}</p></div></div><div style="margin-top:4px">${dailySummary(s, t)}</div></section>
      ${db.parentFeature ? parentsCard(s) : ""}
    </div>`;
  }
  function parentsCard(s) {
    const ps = db.parents.filter((x) => x.student_id === s.id);
    return `<section class="card"><div class="card-head"><div><h2>Эцэг эх / асран хамгаалагч</h2><p>${ps.length ? "Тэдэнд өгсөн даалгаврыг «Эцэг эх» хэсгээс удирдана" : "Холбогдоогүй"}</p></div>
        <a class="btn btn-secondary btn-sm" href="#/t/parents?c=${s.id}">Эцэг эх</a></div>
      ${ps.length ? `<ul class="list card-body">${ps.map((x) => {
        const tk = db.parent_tasks.filter((t) => t.parent_id === x.parent_id && t.student_id === s.id && t.active);
        const dn = tk.filter((t) => parentResp(t.id)?.done).length;
        return `<li class="list-row"><div class="grow"><p class="strong">${esc(x.full_name)}</p><p class="muted small wrap-any">${esc(x.email || "")}</p></div>
          <span class="num muted small">${tk.length ? `${dn}/${tk.length} биелсэн` : "Даалгаваргүй"}</span></li>`;
      }).join("")}</ul>` : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Энэ сурагчид эцэг эхийн бүртгэл холбогдоогүй байна. Сургуулийн админ холбоно.</p>'}</section>`;
  }

  function taskForm(s, task) {
    const k = task ? task.id : "new", e = ui.errors["task:" + k] || {};
    const v = (name, fb) => esc(draft(`tf:${k}:${name}`, fb));
    const d = task || { title: "", description: "", category: "study", slot: "after", minutes: 10, points: 5 };
    return `<form class="form" data-form="task" data-id="${task ? task.id : ""}" data-sid="${s.id}" novalidate>
      <div class="row between"><h3 style="font-size:16px">${task ? "Даалгавар засах" : "Шинэ даалгавар"}</h3>
        <button type="button" class="icon-btn" data-action="cancel-edit" aria-label="Болих">${icon("x")}</button></div>
      ${field("Нэр", `tf-title-${k}`, `<input class="input" id="tf-title-${k}" name="title" data-draft="tf:${k}:title" maxlength="80" value="${v("title", d.title)}" ${e.title ? 'aria-invalid="true"' : ""}>`, { error: e.title })}
      ${field("Товч тайлбар", `tf-desc-${k}`, `<input class="input" id="tf-desc-${k}" name="description" data-draft="tf:${k}:description" maxlength="200" value="${v("description", d.description)}">`, { hint: "Хүүхдэд ойлгомжтой, богино өгүүлбэр" })}
      <div class="grid-2">
        ${field("Бүлэг", `tf-cat-${k}`, `<select class="input" id="tf-cat-${k}" name="category" data-draft="tf:${k}:category">${CATEGORIES.map((c) => `<option value="${c.id}" ${draft(`tf:${k}:category`, d.category) === c.id ? "selected" : ""}>${c.label}</option>`).join("")}</select>`)}
        ${field("Үе", `tf-slot-${k}`, `<select class="input" id="tf-slot-${k}" name="slot" data-draft="tf:${k}:slot">${Object.entries(SLOTS).map(([id, l]) => `<option value="${id}" ${draft(`tf:${k}:slot`, d.slot) === id ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${field("Хугацаа, минут", `tf-min-${k}`, `<input class="input" id="tf-min-${k}" name="minutes" data-draft="tf:${k}:minutes" type="number" inputmode="numeric" value="${v("minutes", d.minutes)}" ${e.minutes ? 'aria-invalid="true"' : ""}>`, { error: e.minutes, hint: "0 бол харуулахгүй" })}
        ${field("Оноо", `tf-pts-${k}`, `<input class="input" id="tf-pts-${k}" name="points" data-draft="tf:${k}:points" type="number" inputmode="numeric" value="${v("points", d.points)}" ${e.points ? 'aria-invalid="true"' : ""}>`, { error: e.points, hint: "«Хийсэн» гэж тэмдэглэхэд өгнө" })}
      </div>
      ${ui.status.taskEdit && ui.status.taskEdit.ok === false ? errorAlert(ui.status.taskEdit.text) : ""}
      <div class="form-foot end"><button type="button" class="btn btn-secondary" data-action="cancel-edit">Болих</button><button type="submit" class="btn btn-primary" ${dis("taskEdit")}>${task ? "Хадгалах" : "Нэмэх"}</button></div>
    </form>`;
  }
  function tTasks(s) {
    const all = tasksOf(s.id, true);
    if (!all.length && ui.editing !== "task:new") return seedCard(s);
    return `<div class="stack">
      <div class="row between"><p class="muted" style="font-size:15px">Тэмдэглэгдэж байсан даалгаврыг устгахгүй, «Түр зогсоох»-ыг ашиглана. Өмнөх бүртгэл, оноо хадгалагдана.</p>
        <button type="button" class="btn btn-primary btn-sm" data-action="edit" data-key="task:new">${icon("plus", "sm")}Даалгавар нэмэх</button></div>
      ${ui.status.taskToggle && ui.status.taskToggle.ok === false ? errorAlert(ui.status.taskToggle.text) : ""}
      ${ui.editing === "task:new" ? `<section class="card card-pad">${taskForm(s, null)}</section>` : ""}
      ${CATEGORIES.map((c) => {
        const items = all.filter((t) => t.category === c.id);
        if (!items.length) return "";
        return `<section class="card"><div class="card-head"><div><h2>${c.label}</h2><p>${items.filter((t) => t.active).length} идэвхтэй</p></div></div>
          <ul class="list card-body">${items.map((t) => `<li>${ui.editing === "task:" + t.id ? `<div class="card-pad">${taskForm(s, t)}</div>` : `
            <div class="list-row admin-row"${t.active ? "" : ' style="opacity:.6"'}>
              <div class="grow"><p class="strong">${esc(t.title)}${t.active ? "" : ' <span class="muted small" style="font-weight:400">· түр зогссон</span>'}</p>
                <p class="muted small">${SLOTS[t.slot]}${t.minutes ? ` · ${t.minutes} мин` : ""} · ${t.points} оноо</p></div>
              <button type="button" class="icon-btn" id="ed-${t.id}" data-action="edit" data-key="task:${t.id}" aria-label="${esc(t.title)} засах">${icon("pencil", "sm")}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-task" data-id="${t.id}" ${dis("taskToggle")}>${t.active ? "Түр зогсоох" : "Сэргээх"}</button>
              <button type="button" class="icon-btn danger" id="del-${t.id}" data-action="ask-delete-task" data-id="${t.id}" aria-label="${esc(t.title)} устгах" ${dis("taskToggle")}>${icon("trash", "sm")}</button>
            </div>`}</li>`).join("")}</ul></section>`;
      }).join("")}
    </div>`;
  }

  function tSchedule(s) {
    // Засварлах хуулбар: «Хадгалах» дарах хүртэл database-д нөлөөлөхгүй
    if (!ui.schedule || ui.schedule.sid !== s.id) ui.schedule = { sid: s.id, rows: db.schedule.filter((r) => r.student_id === s.id).sort((a, b) => a.sort - b.sort).map((r) => ({ ...r })), removed: [] };
    const rows = ui.schedule.rows, err = ui.errors.schedule;
    return `<section class="card">
      <div class="card-head"><div><h2>Өдрийн хуваарь</h2><p>Сургуулийн бодит хуваарь, замын хугацаа, нойрны хэрэгцээтэй уялдуулна</p></div></div>
      <form data-form="schedule" data-sid="${s.id}" novalidate class="card-body">
        ${rows.length ? "" : empty("Хуваарь хоосон", "Мөр нэмнэ үү.")}
        <ul class="list">${rows.map((r, i) => `<li class="sched-edit" data-row="${r.id}">
          <input class="input" type="time" name="time" aria-label="Мөр ${i + 1}: цаг" data-draft="sc:${r.id}:time" value="${esc(draft(`sc:${r.id}:time`, r.start_time || ""))}">
          <input class="input" name="period" aria-label="Мөр ${i + 1}: үе" placeholder="Үе" maxlength="80" data-draft="sc:${r.id}:period" value="${esc(draft(`sc:${r.id}:period`, r.period))}">
          <input class="input activity" name="activity" aria-label="Мөр ${i + 1}: үйл ажиллагаа" placeholder="Үйл ажиллагаа" maxlength="160" data-draft="sc:${r.id}:activity" value="${esc(draft(`sc:${r.id}:activity`, r.activity))}">
          <button type="button" class="icon-btn danger" data-action="sched-del" data-id="${r.id}" aria-label="Мөр ${i + 1} хасах">${icon("trash", "sm")}</button>
        </li>`).join("")}</ul>
        <div class="form-foot" style="padding:16px 20px;border-top:1px solid var(--line)">
          <button type="button" class="btn btn-secondary btn-sm" data-action="sched-add">${icon("plus", "sm")}Мөр нэмэх</button>
          <div class="row">${err ? `<p class="error-text" role="alert">${esc(err)}</p>` : saveStatus("schedule")}<button type="submit" class="btn btn-primary btn-sm" ${dis("schedule")}>Хадгалах</button></div>
        </div>
      </form></section>`;
  }

  function rewardForm(s, r) {
    const k = r ? r.id : "new", e = ui.errors["reward:" + k] || {};
    const d = r || { title: "", description: "Эцэг эх/багштай тохиролцож авна.", icon: "gift", cost: 100 };
    const v = (name, fb) => esc(draft(`rf:${k}:${name}`, fb));
    return `<form class="form" data-form="reward" data-id="${r ? r.id : ""}" data-sid="${s.id}" novalidate>
      <div class="row between"><h3 style="font-size:16px">${r ? "Шагнал засах" : "Шинэ шагнал"}</h3>
        <button type="button" class="icon-btn" data-action="cancel-edit" aria-label="Болих">${icon("x")}</button></div>
      ${field("Нэр", `rf-title-${k}`, `<input class="input" id="rf-title-${k}" name="title" data-draft="rf:${k}:title" maxlength="60" value="${v("title", d.title)}" ${e.title ? 'aria-invalid="true"' : ""}>`, { error: e.title })}
      ${field("Тайлбар", `rf-desc-${k}`, `<input class="input" id="rf-desc-${k}" name="description" data-draft="rf:${k}:description" maxlength="160" value="${v("description", d.description)}">`)}
      <div class="grid-2">
        ${field("Дүрс", `rf-icon-${k}`, `<select class="input" id="rf-icon-${k}" name="icon" data-draft="rf:${k}:icon">${REWARD_ICONS.map(([id, l]) => `<option value="${id}" ${draft(`rf:${k}:icon`, d.icon) === id ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
        ${field("Шаардлагатай оноо", `rf-cost-${k}`, `<input class="input" id="rf-cost-${k}" name="cost" data-draft="rf:${k}:cost" type="number" inputmode="numeric" value="${v("cost", d.cost)}" ${e.cost ? 'aria-invalid="true"' : ""}>`, { error: e.cost })}
      </div>
      ${ui.status.rewardEdit && ui.status.rewardEdit.ok === false ? errorAlert(ui.status.rewardEdit.text) : ""}
      <div class="form-foot end"><button type="button" class="btn btn-secondary" data-action="cancel-edit">Болих</button><button type="submit" class="btn btn-primary" ${dis("rewardEdit")}>${r ? "Хадгалах" : "Нэмэх"}</button></div>
    </form>`;
  }
  function tRewards(s) {
    const pts = points(s.id), list = db.rewards.filter((r) => r.student_id === s.id).sort((a, b) => a.cost - b.cost);
    const txs = db.transactions.filter((r) => r.student_id === s.id);
    const e = ui.errors.adjust || {};
    return `<div class="stack">
      <section class="card card-pad balance"><div><p class="muted" style="font-size:15px">Сурагчийн оноо</p><p class="balance-num num" style="font-size:32px">${pts.balance}</p></div>
        <p class="num muted small">${pointsLine(pts)}</p></section>
      <div class="alert info">Даалгавар бүрийн оноог «Даалгавар» табаас засна. Шагнал бол эцэг эх, багштай тохиролцох урамшуулал бөгөөд сайт өөрөө юм худалдаж өгөхгүй.</div>
      <section class="card card-pad">
        <form class="form" data-form="adjust" data-sid="${s.id}" novalidate>
          <div><h2 style="font-size:17px">Оноо тохируулах</h2><p class="muted small" style="margin-top:2px">Алдаа засах эсвэл нэмэлт урамшуулалд. Хасах бол хасах тэмдэгтэй бичнэ (жишээ нь −10). Түүх хадгалагдана.</p></div>
          <div class="grid-2">
            ${field("Оноо", "adj-delta", `<input class="input" id="adj-delta" name="delta" data-draft="adj:${s.id}:delta" type="number" inputmode="numeric" value="${esc(draft(`adj:${s.id}:delta`, ""))}" ${e.delta ? 'aria-invalid="true"' : ""}>`, { error: e.delta })}
            ${field("Шалтгаан", "adj-reason", `<input class="input" id="adj-reason" name="reason" data-draft="adj:${s.id}:reason" maxlength="160" value="${esc(draft(`adj:${s.id}:reason`, ""))}" ${e.reason ? 'aria-invalid="true"' : ""}>`, { error: e.reason })}
          </div>
          <div class="form-foot">${saveStatus("adjust")}<button type="submit" class="btn btn-primary btn-sm" ${dis("adjust")}>Тохируулах</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><h2>Шагналын жагсаалт</h2><button type="button" class="btn btn-primary btn-sm" data-action="edit" data-key="reward:new">${icon("plus", "sm")}Шагнал нэмэх</button></div>
        <div class="card-body">
          ${ui.status.rewardToggle && ui.status.rewardToggle.ok === false ? `<div style="padding:12px 20px">${errorAlert(ui.status.rewardToggle.text)}</div>` : ""}
          ${ui.editing === "reward:new" ? `<div class="card-pad" style="border-bottom:1px solid var(--line)">${rewardForm(s, null)}</div>` : ""}
          <ul class="list">${list.map((r) => `<li>${ui.editing === "reward:" + r.id ? `<div class="card-pad">${rewardForm(s, r)}</div>` : `
            <div class="list-row admin-row"${r.active ? "" : ' style="opacity:.6"'}>
              <span class="reward-icon small">${icon(r.icon)}</span>
              <div class="grow"><p class="strong">${esc(r.title)}${r.active ? "" : ' <span class="muted small" style="font-weight:400">· нуусан</span>'}</p><p class="num muted small">${r.cost} оноо</p></div>
              <button type="button" class="icon-btn" id="er-${r.id}" data-action="edit" data-key="reward:${r.id}" aria-label="${esc(r.title)} засах">${icon("pencil", "sm")}</button>
              <button type="button" class="btn btn-ghost btn-sm" data-action="toggle-reward" data-id="${r.id}" ${dis("rewardToggle")}>${r.active ? "Нуух" : "Харуулах"}</button>
            </div>`}</li>`).join("")}</ul>
          ${list.length || ui.editing === "reward:new" ? "" : empty("Шагнал алга", "«Шагнал нэмэх» товчоор эхлүүлнэ үү.")}
        </div>
      </section>
      <section class="card"><div class="card-head"><h2>Онооны түүх</h2></div>
        ${txs.length ? `<ul class="list card-body">${txs.map((r) => `<li class="list-row"><span class="grow">${esc(r.kind === "redeem" ? r.title : "Тохируулга" + (r.note ? ": " + r.note : ""))}</span>
          <span class="num muted small">${formatShort(dateOfTs(r.created_at))} · ${r.points > 0 ? "+" : ""}${r.points}</span></li>`).join("")}</ul>`
          : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Одоогоор гүйлгээ алга.</p>'}</section>
    </div>`;
  }

  function tNotes(s) {
    const t = today(), tm = addDays(t, 1);
    const notes = db.teacher_notes.filter((n) => n.student_id === s.id);
    return `<div class="stack">
      <section class="card card-pad">
        <form class="form" data-form="goals" data-sid="${s.id}" novalidate>
          <div><h2 style="font-size:17px">Өдрийн жижиг зорилго</h2><p class="muted small" style="margin-top:2px">Сурагч болон эцэг эхийн нүүр хуудсанд харагдана.</p></div>
          ${field(`Өнөөдөр · ${formatShort(t)}`, "goal-t", `<input class="input" id="goal-t" name="today" data-draft="goal:${s.id}:${t}" maxlength="140" placeholder="Жишээ нь: Хоёр өгүүлбэр бие даан бичих" value="${esc(draft(`goal:${s.id}:${t}`, dayGoal(s.id, t)))}">`)}
          ${field(`Маргааш · ${formatShort(tm)}`, "goal-n", `<input class="input" id="goal-n" name="tomorrow" data-draft="goal:${s.id}:${tm}" maxlength="140" value="${esc(draft(`goal:${s.id}:${tm}`, dayGoal(s.id, tm)))}">`)}
          <div class="form-foot">${saveStatus("goals")}<button type="submit" class="btn btn-primary btn-sm" ${dis("goals")}>Зорилго хадгалах</button></div>
        </form>
      </section>
      <section class="card">
        <div class="card-head"><div><h2>Багшийн тэмдэглэл</h2><p>Сурагч харахгүй. Хуваалцсан тэмдэглэлийг эцэг эх харна.</p></div></div>
        <form class="form card-pad" data-form="tnote" data-sid="${s.id}" novalidate>
          <label for="tn-body" class="sr-only">Шинэ тэмдэглэл</label>
          <textarea class="input" id="tn-body" name="body" data-draft="tn:${s.id}" maxlength="1000" placeholder="Ахиц, ажиглалт, дараагийн алхам">${esc(draft(`tn:${s.id}`, ""))}</textarea>
          <div class="form-foot">
            <label class="choice"><input type="checkbox" name="share" data-draft="tn:${s.id}:share" ${draft(`tn:${s.id}:share`, true) ? "checked" : ""}><span>Эцэг эхтэй хуваалцах</span></label>
            <div class="row">${saveStatus("tnote")}<button type="submit" class="btn btn-primary btn-sm" ${dis("tnote")}>Нэмэх</button></div>
          </div>
        </form>
        ${notes.length ? `<ul class="list" style="border-top:1px solid var(--line)">${notes.map((n) => `
          <li class="list-row" style="align-items:flex-start">
            <div class="grow"><p style="white-space:pre-wrap;font-size:15px">${esc(n.body)}</p><p class="muted xs" style="margin-top:4px">${formatLong(n.log_date)} · ${n.share_with_parent ? "Эцэг эхтэй хуваалцсан" : "Зөвхөн багш"}</p></div>
            ${n.author_id === state.user.id ? `<button type="button" class="icon-btn danger" data-action="del-note" data-id="${n.id}" aria-label="Тэмдэглэл устгах" ${dis("tnote")}>${icon("trash", "sm")}</button>` : ""}
          </li>`).join("")}</ul>` : '<p class="muted" style="padding:16px 20px;border-top:1px solid var(--line);font-size:15px">Тэмдэглэл алга.</p>'}
      </section>
    </div>`;
  }

  function tSettings(s) {
    const e = ui.errors.settings || {};
    return `<section class="card card-pad">
      <h2 style="font-size:17px">Зорилго ба хязгаар</h2>
      <form class="form" data-form="settings" data-sid="${s.id}" novalidate style="margin-top:16px">
        <div class="grid-2">
          ${field("Өдрийн зорилго, %", "st-goal", `<input class="input" id="st-goal" name="goal" data-draft="st:${s.id}:goal" type="number" inputmode="numeric" value="${esc(draft(`st:${s.id}:goal`, s.goal_pct))}" ${e.goal ? 'aria-invalid="true"' : ""}>`, { error: e.goal, hint: "Эхэндээ бага зорилгоос эхэлж, аажмаар нэмнэ" })}
          ${field("Дэлгэцийн өдрийн хязгаар, минут", "st-lim", `<input class="input" id="st-lim" name="limit" data-draft="st:${s.id}:limit" type="number" inputmode="numeric" value="${esc(draft(`st:${s.id}:limit`, s.screen_limit_min))}" ${e.limit ? 'aria-invalid="true"' : ""}>`, { error: e.limit, hint: "Гэр бүлтэй тохирсон хэмжээ" })}
        </div>
        <div class="form-foot">${saveStatus("settings")}<button type="submit" class="btn btn-primary btn-sm" ${dis("settings")}>Хадгалах</button></div>
      </form>
    </section>`;
  }

  /* ---------- Эцэг эх ---------- */
  function childPicker(kids, child, base) {
    if (kids.length < 2) return "";
    return `<div class="pills" role="radiogroup" aria-label="Хүүхэд сонгох">${kids.map((k) =>
      `<a class="pill-btn outlined" role="radio" aria-checked="${k.id === child.id}" aria-pressed="${k.id === child.id}" href="#${base}?c=${k.id}">${esc(k.full_name)}</a>`).join("")}</div>`;
  }
  const noChild = () => `<div class="card">${empty("Хүүхдийн бүртгэл холбогдоогүй байна", "Таны аккаунтыг хүүхдийн бүртгэлтэй холбохын тулд анги удирдсан багшид хандана уу.")}</div>`;
  function viewParentToday(params) {
    const kids = myStudents(), child = kids.find((k) => k.id === params.get("c")) || kids[0];
    if (!child) return noChild();
    const t = today(), date = params.get("d") === "y" ? addDays(t, -1) : t;
    const p = progress(child.id, date), goal = dayGoal(child.id, date), snote = studentNote(child.id, date);
    const notes = db.teacher_notes.filter((n) => n.student_id === child.id && n.share_with_parent).slice(0, 5);
    const q = (d) => `#/p?c=${child.id}${d ? "&d=y" : ""}`;
    const myTasks = db.parent_tasks.filter((x) => x.parent_id === state.user.id && x.student_id === child.id && x.active);
    const open = myTasks.filter((x) => !parentResp(x.id)?.done).length;
    return `${childPicker(kids, child, "/p")}
    <div class="stack">
      ${myTasks.length ? `<a class="points-link" style="margin-top:0" href="#/p/tasks?c=${child.id}"><span>${open ? `Багшаас танд өгсөн <b>${open}</b> даалгавар хүлээгдэж байна` : "Багшаас өгсөн даалгавраа бүгдийг биелүүлсэн"}</span><span class="go">Харах${icon("chevRight", "sm")}</span></a>` : ""}
      <header class="page-head" style="margin:0"><p class="eyebrow">${esc(child.full_name)}</p><h1>${date === t ? "Өнөөдрийн бүртгэл" : formatLong(date)}</h1>
        <div class="row" style="margin-top:10px">
          <a class="pill-btn outlined" href="${q(false)}" aria-pressed="${date === t}">Өнөөдөр</a>
          <a class="pill-btn outlined" href="${q(true)}" aria-pressed="${date !== t}">Өчигдөр</a>
        </div></header>
      <section class="card card-pad">
        <div class="row between" style="align-items:baseline"><p class="strong">Даалгаврын биелэлт</p><p class="num muted" style="font-size:15px">${p.done}/${p.total} · ${p.pct}%</p></div>
        <div style="margin-top:12px">${progressBar(p.pct, "Даалгаврын биелэлт")}</div>
        ${p.help ? `<p class="bad-text" style="margin-top:12px;font-size:15px">${p.help} даалгаварт дэмжлэг хэрэгтэй гэж тэмдэглэсэн.</p>` : ""}
        ${goal ? `<p class="row" style="margin-top:16px;align-items:flex-start;flex-wrap:nowrap;font-size:15px"><span class="group-icon">${icon("target")}</span><span><span class="muted">Жижиг зорилго: </span>${esc(goal)}</span></p>` : ""}
        ${snote ? `<p class="note-box" style="margin-top:16px"><span class="muted">Хүүхдийн тэмдэглэл: </span>${esc(snote)}</p>` : ""}
        <p class="muted small" style="margin-top:16px">Оноо: <span class="num">${points(child.id).balance}</span></p>
      </section>
      <section class="card"><div class="card-head"><div><h2>Даалгавар</h2><p>Хүүхэд өөрөө тэмдэглэнэ</p></div></div>
        <div class="card-body">${p.total ? taskGroups(child.id, date, false) : empty("Даалгавар оноогдоогүй байна")}</div></section>
      ${dailyLogForm(child, date, "guardian")}
      <section class="card"><div class="card-head"><h2>Багшийн тэмдэглэл</h2></div>
        ${notes.length ? `<ul class="list card-body">${notes.map((n) => `<li class="list-row" style="align-items:flex-start"><span class="muted">${icon("message")}</span>
          <div class="grow"><p style="white-space:pre-wrap;font-size:15px">${esc(n.body)}</p><p class="muted xs" style="margin-top:4px">${formatLong(n.log_date)}</p></div></li>`).join("")}</ul>`
          : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Одоогоор тэмдэглэл алга.</p>'}</section>
    </div>`;
  }
  function viewParentWeek(params) {
    const kids = myStudents(), child = kids.find((k) => k.id === params.get("c")) || kids[0];
    if (!child) return noChild();
    const t = today();
    const obs = db.daily_logs.filter((h) => h.student_id === child.id && h.log_date >= addDays(t, -6) && (h.mood || h.sleep_note)).sort((a, b) => b.log_date.localeCompare(a.log_date));
    return `${childPicker(kids, child, "/p/week")}${pageHead("Сүүлийн 7 хоног", child.full_name)}
    <div class="stack">
      <section class="card" style="padding-top:8px">${weekTable(child)}</section>
      <section class="card"><div class="card-head"><h2>Нойр, сэтгэл санааны ажиглалт</h2></div>
        ${obs.length ? `<ul class="list card-body">${obs.map((h) => `<li style="padding:12px 20px;font-size:15px"><span class="muted">${formatShort(h.log_date)} · ${(MOODS.find((m) => m[0] === h.mood) || [0, "—"])[1]}</span>${h.sleep_note ? `<p>${esc(h.sleep_note)}</p>` : ""}</li>`).join("")}</ul>`
          : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Энэ долоо хоногт ажиглалт бичигдээгүй байна.</p>'}</section>
    </div>`;
  }

  /* ---------- Эцэг эхийн даалгавар (сурагчийн даалгавраас тусдаа) ---------- */
  const parentResp = (taskId) => db.parent_responses.find((r) => r.task_id === taskId) || null;
  const dateOfTsLocal = (ts) => (ts ? new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts)) : "");
  function dueLabel(t, done) {
    if (!t.due_date) return "";
    const over = !done && t.due_date < today();
    return `<span class="${over ? "warn-text strong" : "muted"}">${over ? "Хугацаа хэтэрсэн · " : "Хугацаа: "}${formatShort(t.due_date)}</span>`;
  }
  function parentTaskForm(sid, pid, task) {
    const k = task ? task.id : `new:${sid}:${pid}`, e = ui.errors["pt:" + k] || {};
    const v = (name, fb) => esc(draft(`pf:${k}:${name}`, fb));
    const d = task || { title: "", description: "", due_date: "" };
    return `<form class="form" data-form="ptask" data-id="${task ? task.id : ""}" data-sid="${sid}" data-pid="${pid}" novalidate>
      <div class="row between"><h3 style="font-size:16px">${task ? "Даалгавар засах" : "Эцэг эхэд даалгавар өгөх"}</h3>
        <button type="button" class="icon-btn" data-action="cancel-edit" aria-label="Болих">${icon("x")}</button></div>
      ${field("Даалгавар", `pf-title-${k}`, `<input class="input" id="pf-title-${k}" name="title" data-draft="pf:${k}:title" maxlength="120" placeholder="Жишээ нь: Унтахын өмнө 10 минут хамт ном унших" value="${v("title", d.title)}" ${e.title ? 'aria-invalid="true"' : ""}>`, { error: e.title })}
      ${field("Тайлбар, зөвлөмж", `pf-desc-${k}`, `<textarea class="input" id="pf-desc-${k}" name="description" data-draft="pf:${k}:description" maxlength="500" placeholder="Яаж хийх, юуг анхаарах">${v("description", d.description)}</textarea>`)}
      ${field("Хугацаа (заавал биш)", `pf-due-${k}`, `<input class="input" id="pf-due-${k}" name="due" type="date" data-draft="pf:${k}:due" value="${v("due", d.due_date || "")}" ${e.due ? 'aria-invalid="true"' : ""}>`, { error: e.due })}
      ${ui.status.ptEdit && ui.status.ptEdit.ok === false ? errorAlert(ui.status.ptEdit.text) : ""}
      <div class="form-foot end"><button type="button" class="btn btn-secondary" data-action="cancel-edit">Болих</button>
        <button type="submit" class="btn btn-primary" ${dis("ptEdit")}>${task ? "Хадгалах" : "Даалгавар өгөх"}</button></div>
    </form>`;
  }
  function parentTaskRow(t) {
    const r = parentResp(t.id), done = !!(r && r.done);
    if (ui.editing === "pt:" + t.id) return `<li><div class="card-pad">${parentTaskForm(t.student_id, t.parent_id, t)}</div></li>`;
    return `<li class="ptask${t.active ? "" : " archived"}">
      <div class="ptask-main">
        <p class="strong">${esc(t.title)}${t.active ? "" : ' <span class="muted small" style="font-weight:400">· архивласан</span>'}</p>
        ${t.description ? `<p class="muted small" style="white-space:pre-wrap;margin-top:2px">${esc(t.description)}</p>` : ""}
        <p class="small" style="margin-top:6px">${done ? `<span class="status done">Биелсэн · ${formatShort(dateOfTsLocal(r.done_at))}</span>` : '<span class="status none">Хүлээгдэж байна</span>'} ${dueLabel(t, done)}</p>
        ${r && r.comment ? `<p class="note-box" style="margin-top:8px"><span class="muted">Эцэг эхийн тайлбар: </span>${esc(r.comment)}</p>` : ""}
      </div>
      <div class="ptask-actions">
        <button type="button" class="icon-btn" id="pted-${t.id}" data-action="edit" data-key="pt:${t.id}" aria-label="${esc(t.title)} засах">${icon("pencil", "sm")}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-action="pt-archive" data-id="${t.id}" ${dis("ptToggle")}>${t.active ? "Архивлах" : "Сэргээх"}</button>
        ${done ? "" : `<button type="button" class="icon-btn danger" id="ptdel-${t.id}" data-action="ask-delete-ptask" data-id="${t.id}" aria-label="${esc(t.title)} устгах">${icon("trash", "sm")}</button>`}
      </div>
    </li>`;
  }
  function viewTeacherParents(params) {
    const head = pageHead("Эцэг эх / асран хамгаалагч", "", "Хариуцсан сурагчдын эцэг эх. Тэдэнд зөвлөмж, хийх зүйл өгч, биелэлтийг шалгана. Сурагчийн даалгавраас тусдаа.");
    if (!db.parentFeature) return head + `<div class="card">${empty("Эцэг эхийн хэсэг идэвхжээгүй байна",
      "Supabase → SQL Editor-т <code>supabase/setup/14_parent_tasks.sql</code>-ийг ажиллуулсны дараа энд харагдана. Одоо байгаа өгөгдөлд нөлөөлөхгүй.")}</div>`;
    const all = myStudents(), only = all.find((x) => x.id === params.get("c"));
    const list = only ? [only] : all;
    const msg = ui.status.ptToggle && ui.status.ptToggle.ok === false ? errorAlert(ui.status.ptToggle.text) : "";
    if (!all.length) return head + `<div class="card">${empty("Танд хариуцуулсан сурагч алга")}</div>`;
    return `${head}
      ${all.length > 1 ? `<div class="pills" role="tablist" aria-label="Сурагч шүүх">
        <a class="pill-btn outlined" href="#/t/parents" aria-pressed="${!only}">Бүгд</a>
        ${all.map((x) => `<a class="pill-btn outlined" href="#/t/parents?c=${x.id}" aria-pressed="${only && only.id === x.id}">${esc(x.full_name)}</a>`).join("")}</div>` : ""}
      <div class="stack">${msg}${list.map((st) => {
        const ps = db.parents.filter((x) => x.student_id === st.id);
        return `<section class="card">
          <div class="card-head"><div><h2>${esc(st.full_name)}</h2><p>${esc(st.class_name || "Сурагч")} · ${ps.length ? `${ps.length} эцэг эх` : "эцэг эх холбогдоогүй"}</p></div></div>
          ${ps.length ? ps.map((x) => {
            const tasks = db.parent_tasks.filter((t) => t.parent_id === x.parent_id && t.student_id === st.id)
              .sort((a, b) => (b.active - a.active) || String(b.created_at).localeCompare(String(a.created_at)));
            const act = tasks.filter((t) => t.active), dn = act.filter((t) => parentResp(t.id)?.done).length;
            const key = `pt:new:${st.id}:${x.parent_id}`;
            return `<div class="parent-block">
              <div class="row between" style="align-items:flex-start">
                <div class="grow"><p class="strong">${esc(x.full_name)}</p>
                  <p class="muted small wrap-any">${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : "и-мэйлгүй"} · ${esc(st.full_name)}-ийн эцэг эх</p>
                  <p class="muted small num" style="margin-top:2px">${act.length ? `${dn}/${act.length} даалгавар биелсэн` : "Даалгавар өгөөгүй"}</p></div>
                ${ui.editing === key ? "" : `<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-key="${key}">${icon("plus", "sm")}Даалгавар өгөх</button>`}
              </div>
              ${ui.editing === key ? `<div style="margin-top:16px">${parentTaskForm(st.id, x.parent_id, null)}</div>` : ""}
              ${tasks.length ? `<ul class="list ptasks">${tasks.map(parentTaskRow).join("")}</ul>` : ""}
            </div>`;
          }).join("") : '<p class="muted" style="padding:8px 20px 20px;font-size:15px">Энэ сурагчид эцэг эхийн бүртгэл холбогдоогүй байна. Сургуулийн админ холбоно.</p>'}
        </section>`;
      }).join("")}</div>`;
  }
  function viewParentTasks(params) {
    const kids = myStudents(), child = kids.find((k) => k.id === params.get("c")) || kids[0];
    if (!child) return noChild();
    const mine = db.parent_tasks.filter((t) => t.parent_id === state.user.id && t.student_id === child.id && t.active)
      .sort((a, b) => (!!parentResp(a.id)?.done - !!parentResp(b.id)?.done) || String(a.due_date || "9").localeCompare(String(b.due_date || "9")));
    const st = ui.status.presp;
    return `${childPicker(kids, child, "/p/tasks")}${pageHead("Багшаас өгсөн даалгавар", child.full_name, "Танд зориулсан зөвлөмж, хийх зүйл. Хүүхдийн даалгавраас тусдаа бөгөөд оноо өгөхгүй.")}
    <div class="stack">
      ${st && st.ok === false ? errorAlert(st.text) : ""}
      ${mine.length ? mine.map((t) => {
        const r = parentResp(t.id), done = !!(r && r.done), k = `pr:${t.id}`;
        return `<section class="card card-pad ptask-card${done ? " is-done" : ""}">
          <div class="row" style="align-items:flex-start;flex-wrap:nowrap;gap:12px">
            <button type="button" class="check" id="pchk-${t.id}" data-action="presp-toggle" data-id="${t.id}" aria-pressed="${done}" aria-label="${esc(t.title)}: ${done ? "биелээгүй болгох" : "биелсэн гэж тэмдэглэх"}" ${ui.pending.has(t.id) ? "disabled" : ""}>${icon("check")}</button>
            <div class="grow"><h2 style="font-size:16px;font-weight:500">${esc(t.title)}</h2>
              ${t.description ? `<p class="muted small" style="white-space:pre-wrap;margin-top:4px">${esc(t.description)}</p>` : ""}
              <p class="small" style="margin-top:6px">${done ? `<span class="status done">Биелсэн · ${formatShort(dateOfTsLocal(r.done_at))}</span>` : '<span class="status none">Хүлээгдэж байна</span>'} ${dueLabel(t, done)}</p></div>
          </div>
          <form class="form" data-form="presp" data-id="${t.id}" style="margin-top:16px" novalidate>
            ${field("Тайлбар (заавал биш)", `pc-${t.id}`, `<textarea class="input" id="pc-${t.id}" name="comment" data-draft="${k}" maxlength="500" placeholder="Юу хийсэн, хүүхэд хэрхэн оролцсон">${esc(draft(k, r ? r.comment : ""))}</textarea>`)}
            <div class="form-foot">${saveStatus(k)}<button type="submit" class="btn btn-primary btn-sm" ${dis(k)}>Тайлбар хадгалах</button></div>
          </form>
        </section>`;
      }).join("") : `<div class="card">${empty("Одоогоор даалгавар алга", "Багш танд зөвлөмж, хийх зүйл өгөхөд энд харагдана.")}</div>`}
    </div>`;
  }

  /* ---------- Устгахыг баталгаажуулах цонх ---------- */
  function confirmDialog() {
    const c = ui.confirm;
    if (!c) return "";
    return `<div class="scrim" data-action="close-confirm" data-self="1">
      <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
        <h2 id="dlg-h">${esc(c.title)}</h2><p>${esc(c.text)}</p>
        ${ui.status.confirm && ui.status.confirm.ok === false ? `<div style="margin-top:12px">${errorAlert(ui.status.confirm.text)}</div>` : ""}
        <div class="row"><button type="button" class="btn btn-secondary btn-sm" data-action="close-confirm" id="dlg-cancel" ${dis("confirm")}>Болих</button>
          ${ui.status.confirm && ui.status.confirm.ok === false ? "" : `<button type="button" class="btn btn-danger btn-sm" data-action="do-confirm" ${dis("confirm")}>${busy("confirm") ? '<span class="spinner sm" aria-hidden="true"></span>' : ""}Устгах</button>`}</div>
      </div></div>`;
  }

  /* ================= 9. ЧИГЛҮҮЛЭЛТ БА EVENT ================= */

  const app = document.getElementById("app");

  function route() {
    const h = location.hash.replace(/^#/, "") || "/";
    const [path, query] = h.split("?");
    return { path, params: new URLSearchParams(query || "") };
  }
  function go(path) { if (location.hash === "#" + path) render(); else location.hash = "#" + path; }

  /** Бичиж буй утгуудыг санана (дахин зурахад алдагдахгүй) */
  function captureDrafts() {
    app.querySelectorAll("[data-draft]").forEach((el) => {
      if (el.type === "checkbox" || el.type === "radio") ui.drafts[el.dataset.draft] = el.checked;
      else ui.drafts[el.dataset.draft] = el.value;
    });
  }

  function render() {
    const focusedId = document.activeElement && document.activeElement.id;
    const { path, params } = route();
    if (state.phase === "setup") app.innerHTML = viewSetup();
    else if (state.phase === "boot") app.innerHTML = viewBoot();
    else if (state.phase === "loading") app.innerHTML = state.user ? viewBoot("Мэдээлэл ачаалж байна…") : viewBoot();
    else if (state.phase === "error") app.innerHTML = viewLoadError();
    else if (state.phase === "login" || !state.user) {
      if (path !== "/login") history.replaceState(null, "", "#/login");
      app.innerHTML = viewLogin();
    } else {
      const user = state.user, home = ROLES[user.role].home;
      // Өөр role-ийн хуудас руу URL-аар орох гэвэл өөрийн нүүр рүү буцаана (өгөгдлийг RLS хамгаална)
      if (!(path === home || path.startsWith(home + "/"))) { history.replaceState(null, "", "#" + home); return render(); }
      let content;
      if (user.role === "student") {
        const m = path.match(/^\/s\/day\/(\d{4}-\d{2}-\d{2})$/);
        content = path === "/s/rewards" ? viewStudentRewards()
          : path === "/s/schedule" ? viewStudentSchedule()
          : path === "/s/history" ? viewStudentHistory()
          : viewStudentDay(m && m[1] <= today() ? m[1] : today());
      } else if (user.role === "teacher") {
        const m = path.match(/^\/t\/student\/([\w-]+)$/);
        content = m ? viewTeacherStudent(m[1], params.get("tab") || "overview") : path === "/t/parents" ? viewTeacherParents(params) : viewTeacherHome();
      } else {
        content = path === "/p/week" ? viewParentWeek(params) : path === "/p/tasks" ? viewParentTasks(params) : viewParentToday(params);
      }
      app.innerHTML = shell(user, path, content + confirmDialog());
    }
    if (focusedId) { const el = document.getElementById(focusedId); if (el) el.focus({ preventScroll: true }); }
    const dlg = app.querySelector(".dialog");
    if (dlg && !dlg.contains(document.activeElement)) document.getElementById("dlg-cancel")?.focus();
  }

  window.addEventListener("hashchange", () => {
    captureDrafts();
    ui.status = {}; ui.errors = {}; ui.editing = null; ui.pickReward = null; ui.confirm = null;
    if (!location.hash.includes("tab=schedule")) ui.schedule = null;
    render();
    try { window.scrollTo(0, 0); } catch (e) { /* ignore */ }
  });

  /* ---- товч ---- */
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-action]");
    if (!el || !app.contains(el)) return;
    if (el.dataset.self && ev.target !== el) return;  // dialog дотор дарахад хаахгүй
    captureDrafts();
    const a = el.dataset.action, id = el.dataset.id;

    switch (a) {
      case "theme": setTheme(currentTheme() === "dark" ? "light" : "dark"); render(); break;
      case "pick-role": ui.loginRole = el.dataset.role; ui.loginError = ""; state.notice = ""; render(); break;
      case "toggle-pw": ui.showPw = !ui.showPw; render(); break;
      case "logout": await signOut(); break;
      case "retry-load": await loadAndShow(); break;
      case "toggle-group": ui.open[el.dataset.key] = el.getAttribute("aria-expanded") !== "true"; render(); break;

      case "task": {
        // Шууд харагдахаар урьдчилж өөрчилнө; сервер татгалзвал буцаана
        const sid = state.user.id, { path } = route(), m = path.match(/\/s\/day\/(.+)$/), date = m ? m[1] : today();
        const status = el.dataset.status || null, before = db.task_logs.slice(), beforePts = db.points[sid];
        db.task_logs = db.task_logs.filter((l) => !(l.task_id === id && l.log_date === date));
        if (status) db.task_logs.push({ task_id: id, student_id: sid, log_date: date, status, points: 0 });
        ui.pending.add(id); taskSeq++; delete ui.status.task; render();
        try { await api.setTask(sid, id, date, status); }
        catch (e) { db.task_logs = before; db.points[sid] = beforePts; ui.status.task = { ok: false, text: friendlyError(e) }; }
        ui.pending.delete(id); render();
        break;
      }

      case "pick-reward": ui.pickReward = id; delete ui.status.reward; render(); break;
      case "close-dialog": if (!busy("reward")) { ui.pickReward = null; render(); } break;
      case "confirm-reward":
        await run("reward", () => api.redeem(id), {
          onOk: (r) => { ui.status.reward = { ok: true, text: `«${r.title}» шагналыг авлаа. Эцэг эх эсвэл багштайгаа тохиролцоорой.` }; },
        });
        // Амжилттай ч, алдаатай ч dialog-ийг хааж, үр дүнг хуудсан дээр харуулна
        ui.pickReward = null; render();
        break;

      case "tab": { const { path } = route(); location.hash = `#${path}?tab=${el.dataset.tab}`; break; }
      case "edit": ui.editing = el.dataset.key; ui.errors = {}; delete ui.status.taskEdit; delete ui.status.rewardEdit; render(); break;
      case "cancel-edit": clearDrafts("tf:"); clearDrafts("rf:"); clearDrafts("pf:"); ui.editing = null; ui.errors = {}; render(); break;
      case "seed": await run("seed", () => api.seedPlan(id)); ui.schedule = null; render(); break;
      case "toggle-task": { const t = db.tasks.find((x) => x.id === id); await run("taskToggle", () => api.updateTask(id, { active: !t.active })); break; }
      case "toggle-reward": { const r = db.rewards.find((x) => x.id === id); await run("rewardToggle", () => api.updateReward(id, { active: !r.active })); break; }
      case "sched-add":
        ui.schedule.rows.push({ id: "new-" + Math.random().toString(36).slice(2, 10), student_id: ui.schedule.sid, start_time: "", period: "", activity: "", sort: 999 });
        delete ui.status.schedule; render();
        { const rows = app.querySelectorAll(".sched-edit input[type=time]"); rows[rows.length - 1]?.focus(); }
        break;
      case "sched-del":
        ui.schedule.rows = ui.schedule.rows.filter((r) => r.id !== id);
        if (!id.startsWith("new-")) ui.schedule.removed.push(id);
        delete ui.status.schedule; render(); break;
      case "del-note": await run("tnote", () => api.deleteNote(id)); break;

      case "ask-delete-task": {
        const t = db.tasks.find((x) => x.id === id);
        ui.confirm = { kind: "task", id, title: "Даалгавар устгах уу?", text: `«${t ? t.title : ""}» даалгаврыг бүр мөсөн устгана. Сурагч тэмдэглэж байсан даалгаврыг устгах боломжгүй (оноо, түүх хадгалагдана) — тэр үед «Түр зогсоох»-ыг ашиглана уу.` };
        delete ui.status.confirm; render(); break;
      }
      case "ask-delete-ptask": {
        const t = db.parent_tasks.find((x) => x.id === id);
        ui.confirm = { kind: "ptask", id, title: "Эцэг эхийн даалгавар устгах уу?", text: `«${t ? t.title : ""}» даалгаврыг устгана. Биелсэн даалгаврыг устгахгүй, архивлана.` };
        delete ui.status.confirm; render(); break;
      }
      case "close-confirm": if (!busy("confirm")) { ui.confirm = null; delete ui.status.confirm; render(); } break;
      case "do-confirm": {
        const c = ui.confirm; if (!c) break;
        await run("confirm", () => (c.kind === "task" ? api.deleteTask(c.id) : api.deleteParentTask(c.id)), { onOk: () => { ui.confirm = null; } });
        if (!ui.confirm) delete ui.status.confirm;
        render(); break;
      }
      case "pt-archive": { const t = db.parent_tasks.find((x) => x.id === id); await run("ptToggle", () => api.updateParentTask(id, { active: !t.active })); break; }
      case "presp-toggle": {
        const r = parentResp(id), done = !(r && r.done), before = db.parent_responses.slice();
        db.parent_responses = db.parent_responses.filter((x) => x.task_id !== id).concat({ ...(r || { task_id: id, parent_id: state.user.id, comment: "" }), done, done_at: done ? new Date().toISOString() : null });
        ui.pending.add(id); delete ui.status.presp; render();
        try { await api.saveParentResponse(id, { done }, !!r); await loadData(); }
        catch (e) { db.parent_responses = before; ui.status.presp = { ok: false, text: friendlyError(e) }; }
        ui.pending.delete(id); render(); break;
      }
    }
  });

  /* ---- форм илгээх ---- */
  document.addEventListener("submit", async (ev) => {
    const f = ev.target;
    if (!app.contains(f)) return;
    ev.preventDefault();
    captureDrafts();
    const fd = new FormData(f), sid = f.dataset.sid;
    const int = (v) => (v === "" || v == null ? null : Number(v));
    const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
    const str = (name) => String(fd.get(name) || "").trim();

    switch (f.dataset.form) {
      case "login":
        ui.loginId = fd.get("username"); ui.loginPw = fd.get("password");
        ui.loginBusy = true; ui.loginError = ""; state.notice = ""; render();
        ui.loginError = (await signIn(ui.loginRole, ui.loginId, ui.loginPw)) || "";
        ui.loginBusy = false;
        if (ui.loginError) render(); else ui.loginPw = "";
        break;

      case "note": {
        const date = f.dataset.date, key = `note:${sid}:${date}`;
        const text = String(ui.drafts[key] ?? "").trim();
        await run(key, () => api.saveDailyLog(sid, date, { note: text }), { onOk: () => delete ui.drafts[key] });
        break;
      }

      case "daily": {
        const date = f.dataset.date, k = `dl:${sid}:${date}`;
        const h = int(fd.get("h")), m = int(fd.get("m")), mv = int(fd.get("move")), err = {};
        if ((h != null && !isInt(h, 0, 16)) || (m != null && !isInt(m, 0, 59))) err.screen = "Цаг 0–16, минут 0–59 бүхэл тоо байна.";
        if (mv != null && !isInt(mv, 0, 600)) err.move = "0–600 минутын бүхэл тоо.";
        ui.errors[k] = err;
        if (Object.keys(err).length) { render(); break; }
        const fields = {
          screen_minutes: h == null && m == null ? null : (h || 0) * 60 + (m || 0), movement_minutes: mv,
          offscreen: fd.getAll("act"), chore: str("chore"),
          hygiene_morning: fd.get("hm") === "on", hygiene_evening: fd.get("he") === "on", hygiene_reminded: fd.get("hr") === "on",
          bed_time: fd.get("bed") || null, wake_time: fd.get("wake") || null,
          mood: fd.get("mood") || null, sleep_note: str("sleep"),
        };
        await run(k, () => api.saveDailyLog(sid, date, fields), { onOk: () => clearDrafts(k + ":") });
        break;
      }

      case "task": {
        const id = f.dataset.id, k = id || "new", min = int(fd.get("minutes")), pts = int(fd.get("points")), title = str("title"), err = {};
        if (!title) err.title = "Нэрийг бичнэ үү.";
        if (min == null || !isInt(min, 0, 180)) err.minutes = "0–180 минутын бүхэл тоо оруулна уу.";
        if (pts == null || !isInt(pts, 0, 100)) err.points = "0–100 хооронд бүхэл тоо.";
        ui.errors["task:" + k] = err;
        if (Object.keys(err).length) { render(); break; }
        const v = { title, description: str("description"), category: fd.get("category"), slot: fd.get("slot"), minutes: min, points: pts };
        await run("taskEdit", () => (id ? api.updateTask(id, v) : api.createTask({ ...v, student_id: sid, sort: 1000 })),
          { onOk: () => { ui.editing = null; clearDrafts(`tf:${k}:`); } });
        break;
      }

      case "reward": {
        const id = f.dataset.id, k = id || "new", cost = int(fd.get("cost")), title = str("title"), err = {};
        if (!title) err.title = "Нэрийг бичнэ үү.";
        if (cost == null || !isInt(cost, 1, 10000)) err.cost = "1–10000 хооронд бүхэл тоо.";
        ui.errors["reward:" + k] = err;
        if (Object.keys(err).length) { render(); break; }
        const v = { title, description: str("description"), icon: fd.get("icon"), cost };
        await run("rewardEdit", () => (id ? api.updateReward(id, v) : api.createReward({ ...v, student_id: sid, sort: 100 })),
          { onOk: () => { ui.editing = null; clearDrafts(`rf:${k}:`); } });
        break;
      }

      case "adjust": {
        const delta = int(fd.get("delta")), reason = str("reason"), err = {};
        if (delta == null || !isInt(delta, -1000, 1000) || delta === 0) err.delta = "−1000…1000 хооронд, 0-ээс өөр бүхэл тоо.";
        if (!reason) err.reason = "Шалтгаанаа бичнэ үү.";
        ui.errors.adjust = err;
        if (Object.keys(err).length) { render(); break; }
        await run("adjust", () => api.adjustPoints(sid, delta, reason), { onOk: () => clearDrafts(`adj:${sid}:`) });
        break;
      }

      case "schedule": {
        const rows = ui.schedule.rows.map((r) => ({
          ...r, start_time: ui.drafts[`sc:${r.id}:time`] ?? r.start_time ?? "",
          period: String(ui.drafts[`sc:${r.id}:period`] ?? r.period).trim(), activity: String(ui.drafts[`sc:${r.id}:activity`] ?? r.activity).trim(),
        }));
        if (rows.some((r) => !r.activity)) { ui.errors.schedule = "Үйл ажиллагааны нүд хоосон мөр байна."; render(); break; }
        ui.errors.schedule = null;
        rows.sort((a, b) => (a.start_time || "99").localeCompare(b.start_time || "99")).forEach((r, i) => { r.sort = (i + 1) * 10; });
        await run("schedule", () => api.saveSchedule(sid, rows, ui.schedule.removed), { onOk: () => { clearDrafts("sc:"); ui.schedule = null; } });
        break;
      }

      case "goals": {
        const t = today(), tm = addDays(t, 1);
        await run("goals", async () => { await api.saveGoal(sid, t, str("today")); await api.saveGoal(sid, tm, str("tomorrow")); },
          { onOk: () => clearDrafts(`goal:${sid}:`) });
        break;
      }

      case "tnote": {
        const body = str("body");
        if (!body) break;
        await run("tnote", () => api.addNote(sid, body, fd.get("share") === "on"), { onOk: () => clearDrafts(`tn:${sid}`) });
        break;
      }

      case "ptask": {
        const id = f.dataset.id, k = id || `new:${sid}:${f.dataset.pid}`, title = str("title"), due = str("due"), err = {};
        if (!title) err.title = "Даалгаврыг бичнэ үү.";
        if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) err.due = "Огноог зөв оруулна уу.";
        ui.errors["pt:" + k] = err;
        if (Object.keys(err).length) { render(); break; }
        const v = { title, description: str("description"), due_date: due || null };
        await run("ptEdit", () => (id ? api.updateParentTask(id, v) : api.createParentTask({ ...v, student_id: sid, parent_id: f.dataset.pid })),
          { onOk: () => { ui.editing = null; clearDrafts(`pf:${k}:`); } });
        break;
      }

      case "presp": {
        const id = f.dataset.id, k = `pr:${id}`, comment = String(ui.drafts[k] ?? "").trim();
        await run(k, () => api.saveParentResponse(id, { comment }), { onOk: () => delete ui.drafts[k] });
        break;
      }

      case "settings": {
        const g = int(fd.get("goal")), l = int(fd.get("limit")), err = {};
        if (g == null || !isInt(g, 10, 100)) err.goal = "10–100 хооронд бүхэл тоо.";
        if (l == null || !isInt(l, 0, 600)) err.limit = "0–600 минутын хооронд.";
        ui.errors.settings = err;
        if (Object.keys(err).length) { render(); break; }
        await run("settings", () => api.saveSettings(sid, { goal_pct: g, screen_limit_min: l }), { onOk: () => clearDrafts(`st:${sid}:`) });
        break;
      }
    }
  });

  // Утсан дээр гар (keyboard) гарч ирэхэд идэвхтэй талбар халхлагдахгүй байхаар харагдах хэсэгт гаргана
  document.addEventListener("focusin", (ev) => {
    const el = ev.target;
    if (!el.matches || !el.matches("input:not([type=checkbox]):not([type=radio]), textarea, select") || window.innerWidth >= 1024) return;
    setTimeout(() => { try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch (e) { /* ignore */ } }, 300);
  });
  document.addEventListener("input", (ev) => {
    if (ev.target.id === "login-id") ui.loginId = ev.target.value;
    if (ev.target.id === "login-pw") ui.loginPw = ev.target.value;
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && ui.pickReward && !busy("reward")) { ui.pickReward = null; render(); }
    if (ev.key === "Escape" && ui.confirm && !busy("confirm")) { ui.confirm = null; delete ui.status.confirm; render(); }
  });

  // Өөр төхөөрөмж дээр хийсэн өөрчлөлтийг харуулахын тулд таб руу буцаж ирэхэд дахин ачаална
  let lastSync = Date.now(), lastDay = today();
  async function backgroundSync() {
    if (state.phase !== "ready" || Object.values(ui.status).some((s) => s && s.saving) || ui.pending.size) return;
    try { await loadData(); lastSync = Date.now(); captureDrafts(); render(); } catch (e) { /* дараагийн удаа дахин оролдоно */ }
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - lastSync > 30000) backgroundSync(); });
  setInterval(() => { if (today() !== lastDay) { lastDay = today(); backgroundSync(); } }, 60000);

  // Нэвтрэлтийн хугацаа өөр газар дууссан бол login руу буцаана
  if (sb) sb.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && state.user) signOut("Нэвтрэлтийн хугацаа дууссан. Дахин нэвтэрнэ үү.");
  });

  boot();
})();
