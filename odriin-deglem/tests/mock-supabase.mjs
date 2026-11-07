// Тестэд зориулсан Supabase client-ийн дуурайлт (санах ой дээр).
// app.js-ийн бүх дуудлага (auth, from().select/insert/update/upsert/delete, rpc) зөв холбогдсон эсэхийг шалгана.
// Жинхэнэ эрхийн хамгаалалтыг supabase/tests/rls.test.mjs тусад нь Postgres дээр шалгадаг;
// энд зөвхөн UI зөв ажиллахад хэрэгтэй хэмжээнд эрхийг дуурайна.
export function createMockSupabase({ today }) {
  const uid = () => Math.random().toString(36).slice(2, 10);
  const D = {
    users: [], profiles: [], student_profiles: [], student_teacher_assignments: [], parent_student_assignments: [],
    tasks: [], task_completions: [], daily_logs: [], schedule_items: [], day_goals: [], teacher_notes: [],
    rewards: [], reward_transactions: [], user_settings: [],
  };
  let session = null;
  const listeners = [];
  const calls = [];
  const me = () => session?.user?.id;
  const role = () => D.profiles.find((p) => p.id === me())?.role;
  const readable = () => {
    const r = role(), id = me();
    if (r === "student") return [id];
    if (r === "teacher") return D.student_teacher_assignments.filter((x) => x.teacher_id === id).map((x) => x.student_id);
    if (r === "guardian") return D.parent_student_assignments.filter((x) => x.parent_id === id).map((x) => x.student_id);
    return [];
  };
  const visible = (table, row) => {
    if (!me()) return false;
    if (table === "profiles") return row.id === me() || readable().includes(row.id);
    if (table === "user_settings") return row.user_id === me();
    if (table === "teacher_notes") return role() === "teacher" ? readable().includes(row.student_id) : role() === "guardian" && row.share_with_parent && readable().includes(row.student_id);
    if ("student_id" in row) return readable().includes(row.student_id);
    return false;
  };
  const deny = () => ({ data: null, error: { code: "42501", message: "new row violates row-level security policy" } });
  const balance = (sid) => D.task_completions.filter((c) => c.student_id === sid).reduce((a, c) => a + c.points, 0)
    + D.reward_transactions.filter((t) => t.student_id === sid).reduce((a, t) => a + t.points, 0);
  const canWrite = (table, row) => {
    const r = role(), sid = row.student_id;
    const teacherOf = r === "teacher" && readable().includes(sid);
    switch (table) {
      case "task_completions": return r === "student" && sid === me();
      case "daily_logs": return (r === "student" && sid === me()) || (r === "guardian" && readable().includes(sid));
      case "user_settings": return row.user_id === me();
      case "tasks": case "schedule_items": case "day_goals": case "teacher_notes": case "rewards": case "student_profiles": return teacherOf;
      default: return false;
    }
  };
  const keyOf = (table, row) => ({
    task_completions: `${row.task_id}|${row.log_date}`, daily_logs: `${row.student_id}|${row.log_date}`,
    day_goals: `${row.student_id}|${row.log_date}`, user_settings: row.user_id, student_profiles: row.student_id,
  })[table] ?? row.id;
  function beforeWrite(table, row, old) {
    const now = new Date().toISOString();
    if (table === "task_completions") row.points = row.status === "done" ? (D.tasks.find((t) => t.id === row.task_id)?.points ?? 0) : 0;
    if (table === "daily_logs" && role() !== "student") row.note = old ? old.note : "";
    if (table === "teacher_notes") { row.author_id = me(); if (!row.log_date) row.log_date = today; }
    row.updated_at = now; if (!row.created_at) row.created_at = now;
    for (const k of ["offscreen"]) if (table === "daily_logs" && !row[k]) row[k] = [];
    return row;
  }

  class Q {
    constructor(table) { this.t = table; this.filters = []; this.op = "select"; this._order = null; this._limit = null; this.mode = "many"; this.returning = false; }
    select() { if (this.op !== "select") this.returning = true; return this; }
    eq(c, v) { this.filters.push((r) => r[c] === v); return this; }
    in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this; }
    gte(c, v) { this.filters.push((r) => r[c] >= v); return this; }
    lte(c, v) { this.filters.push((r) => r[c] <= v); return this; }
    order(c, { ascending = true } = {}) { this._order = [c, ascending]; return this; }
    limit(n) { this._limit = n; return this; }
    single() { this.mode = "single"; return this; }
    maybeSingle() { this.mode = "maybe"; return this; }
    insert(v) { this.op = "insert"; this.payload = [].concat(v); return this; }
    upsert(v) { this.op = "upsert"; this.payload = [].concat(v); return this; }
    update(v) { this.op = "update"; this.payload = v; return this; }
    delete() { this.op = "delete"; return this; }
    then(res, rej) { return Promise.resolve().then(() => this.exec()).then(res, rej); }
    exec() {
      calls.push(`${this.op}:${this.t}`);
      const rows = D[this.t];
      let out = [];
      if (this.op === "select") {
        out = rows.filter((r) => visible(this.t, r) && this.filters.every((f) => f(r)));
        if (this._order) { const [c, asc] = this._order; out.sort((a, b) => (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)); }
        if (this._limit) out = out.slice(0, this._limit);
      } else if (this.op === "insert" || this.op === "upsert") {
        for (const p of this.payload) {
          const existing = rows.find((r) => keyOf(this.t, r) === keyOf(this.t, { id: p.id, ...p }));
          if (existing && this.op === "insert") return { data: null, error: { code: "23505", message: "duplicate" } };
          const row = beforeWrite(this.t, { ...(existing || {}), ...(existing ? {} : { id: p.id || uid() }), ...p }, existing);
          if (!canWrite(this.t, row)) return deny();
          if (existing) Object.assign(existing, row); else rows.push(row);
          out.push(existing || row);
        }
      } else if (this.op === "update") {
        for (const r of rows.filter((r) => visible(this.t, r) && this.filters.every((f) => f(r)))) {
          if (!canWrite(this.t, r)) continue;
          Object.assign(r, beforeWrite(this.t, { ...r, ...this.payload }, r)); out.push(r);
        }
      } else if (this.op === "delete") {
        const del = rows.filter((r) => visible(this.t, r) && this.filters.every((f) => f(r)) && (this.t !== "teacher_notes" || r.author_id === me()) && canWrite(this.t, r));
        D[this.t] = rows.filter((r) => !del.includes(r));
        if (this.t === "task_completions" && del.some((r) => balance(r.student_id) < 0)) { D[this.t] = rows; return { data: null, error: { code: "P0001", message: "Энэ даалгаврын оноог шагналд зарцуулсан тул буцаах боломжгүй." } }; }
        out = del;
      }
      const data = JSON.parse(JSON.stringify(out));
      if (this.mode === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      if (this.mode === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    }
  }

  const rpcs = {
    verify_login_role: ({ requested }) => role() === requested,
    points_summary: ({ sid }) => {
      if (!readable().includes(sid)) throw { code: "42501", message: "Энэ үйлдлийг хийх эрх танд алга." };
      const earned = D.task_completions.filter((c) => c.student_id === sid).reduce((a, c) => a + c.points, 0);
      const spent = -D.reward_transactions.filter((t) => t.student_id === sid && t.kind === "redeem").reduce((a, t) => a + t.points, 0);
      const adjusted = D.reward_transactions.filter((t) => t.student_id === sid && t.kind === "adjust").reduce((a, t) => a + t.points, 0);
      return { earned, spent, adjusted, balance: earned - spent + adjusted };
    },
    redeem_reward: ({ rid }) => {
      const r = D.rewards.find((x) => x.id === rid && x.active);
      if (!r) throw { code: "P0001", message: "Шагнал олдсонгүй." };
      if (!(role() === "student" && r.student_id === me())) throw { code: "42501", message: "Энэ үйлдлийг хийх эрх танд алга." };
      if (balance(r.student_id) < r.cost) throw { code: "P0001", message: "Оноо хүрэлцэхгүй байна." };
      const row = { id: uid(), student_id: r.student_id, kind: "redeem", points: -r.cost, reward_id: r.id, title: r.title, icon: r.icon, note: "", created_at: new Date().toISOString() };
      D.reward_transactions.push(row); return row;
    },
    adjust_points: ({ sid, delta, reason }) => {
      if (!(role() === "teacher" && readable().includes(sid))) throw { code: "42501", message: "Энэ үйлдлийг хийх эрх танд алга." };
      if (balance(sid) + delta < 0) throw { code: "P0001", message: "Оноо сөрөг болох тул хасах боломжгүй." };
      const row = { id: uid(), student_id: sid, kind: "adjust", points: delta, reward_id: null, title: "Багшийн тохируулга", icon: "gift", note: reason, created_at: new Date().toISOString() };
      D.reward_transactions.push(row); return row;
    },
    seed_student_plan: ({ sid }) => {
      if (me() && !(role() === "teacher" && readable().includes(sid))) throw { code: "42501", message: "Энэ үйлдлийг хийх эрх танд алга." };
      const T = [["study", "Цүнх, хэрэгслээ шалгах", 5, "morning"], ["study", "Монгол хэлний унших-бичих ажил", 10, "after"],
        ["health", "Шүдээ угаах", 5, "morning"], ["rest", "Бөмбөгтэй дасгал эсвэл алхалт", 5, "after"], ["interest", "Газрын зургаас нэр унших", 5, "after"]];
      if (!D.tasks.some((t) => t.student_id === sid)) T.forEach(([category, title, points, slot], i) => D.tasks.push({ id: uid(), student_id: sid, category, title, description: "", minutes: 10, slot, points, sort: i * 10, active: true }));
      if (!D.schedule_items.some((t) => t.student_id === sid)) [["07:00:00", "Өглөө", "Ариун цэвэр"], ["08:00:00", "Сургуулийн цаг", "Хичээл"]].forEach(([start_time, period, activity], i) => D.schedule_items.push({ id: uid(), student_id: sid, start_time, period, activity, sort: i * 10 }));
      if (!D.rewards.some((t) => t.student_id === sid)) [["Хаалгачийн бээлий", "glove", 600], ["Дасгалын нэмэлт 15 минут", "timer", 10], ["Хөлбөмбөгийн оймс", "socks", 200]].forEach(([title, icon, cost], i) => D.rewards.push({ id: uid(), student_id: sid, title, description: "Эцэг эх/багштай тохиролцож авна.", icon, cost, active: true, sort: i }));
      if (!D.student_profiles.some((x) => x.student_id === sid)) D.student_profiles.push({ student_id: sid, class_name: "3б", goal_pct: 80, screen_limit_min: 90 });
      return { tasks: 5, schedule: 2, rewards: 3 };
    },
  };

  const client = {
    auth: {
      async getSession() { return { data: { session }, error: null }; },
      async signInWithPassword({ email, password }) {
        const u = D.users.find((x) => x.email === email && x.password === password);
        if (!u) return { data: null, error: { message: "Invalid login credentials" } };
        session = { user: { id: u.id, email } }; listeners.forEach((l) => l("SIGNED_IN", session));
        return { data: { session }, error: null };
      },
      async signOut() { const had = !!session; session = null; if (had) listeners.forEach((l) => l("SIGNED_OUT", null)); return { error: null }; },
      onAuthStateChange(cb) { listeners.push(cb); return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from: (t) => new Q(t),
    async rpc(name, args) {
      calls.push(`rpc:${name}`);
      try { return { data: JSON.parse(JSON.stringify(rpcs[name](args) ?? null)), error: null }; }
      catch (e) { return { data: null, error: e }; }
    },
  };

  // Админы үйлдэл (тест бэлтгэх)
  const admin = {
    user(email, password, role, full_name) {
      const id = uid(); D.users.push({ id, email, password }); D.profiles.push({ id, role, full_name }); return id;
    },
    link(table, row) { D[table].push(row); },
    seed(sid) { const s = session; session = null; rpcs.seed_student_plan({ sid }); session = s; },
    kill() { session = null; },
  };
  return { client, admin, D, calls, setSessionFromStorage: (s) => { session = s; }, getSession: () => session };
}
