#!/usr/bin/env node
// =====================================================================
// Сургуулийн админы скрипт: аккаунт үүсгэх, role оноох, сурагч-багш-эцэг эхийг холбох.
//
// service_role түлхүүр бүх RLS-ийг давдаг тул ЗӨВХӨН өөрийн компьютер дээр ажиллуулна.
// Тэр түлхүүрийг .env.local-д (git-д ордоггүй) бичнэ; config.js болон браузерт хэзээ ч очихгүй.
//
//   npm run admin -- user <нэвтрэх нэр|и-мэйл> <student|teacher|guardian> "<Овог нэр>" [нууц үг]
//   npm run admin -- student <сурагчийн нэр> ["<Анги>"]      сурагчийн мэдээлэл + анхны төлөвлөгөө
//   npm run admin -- link-teacher <багш> <сурагч>
//   npm run admin -- link-parent <эцэг эх> <сурагч>
//   npm run admin -- unlink-teacher <багш> <сурагч>
//   npm run admin -- unlink-parent <эцэг эх> <сурагч>
//   npm run admin -- password <хэрэглэгч> [шинэ нууц үг]
//   npm run admin -- list
// =====================================================================
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const envFile = join(root, ".env.local");
if (existsSync(envFile)) for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, USERNAME_DOMAIN = "" } = env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL болон SUPABASE_SERVICE_ROLE_KEY-г .env.local-д бичнэ үү (README-ийн 5-р алхам).");
  process.exit(1);
}
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ROLES = ["student", "teacher", "guardian", "admin"];
const ROLE_MN = { student: "сурагч", teacher: "багш", guardian: "эцэг эх", admin: "админ" };

const toEmail = (login) => {
  if (login.includes("@")) return login.toLowerCase();
  if (!USERNAME_DOMAIN) throw new Error("Нэвтрэх нэр ашиглахын тулд .env.local-д USERNAME_DOMAIN тохируулна уу, эсвэл и-мэйл өгнө үү.");
  return `${login.toLowerCase()}@${USERNAME_DOMAIN}`;
};
const usernameOf = (login) => (login.includes("@") ? null : login.toLowerCase());
const tempPassword = () => randomBytes(9).toString("base64url");

async function findUser(login) {
  const email = toEmail(login);
  for (let page = 1; page < 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 200) break;
  }
  throw new Error(`Хэрэглэгч олдсонгүй: ${email}`);
}
async function profileOf(id) {
  const { data, error } = await db.from("profiles").select("id, role, full_name, username").eq("id", id).single();
  if (error) throw error;
  return data;
}
async function requireRole(login, role) {
  const u = await findUser(login), p = await profileOf(u.id);
  if (p.role !== role) throw new Error(`${login} нь ${ROLE_MN[role]} биш (одоо: ${p.role ? ROLE_MN[p.role] : "эрхгүй"}).`);
  return p;
}
const check = ({ error }) => { if (error) throw error; };

const [cmd, ...a] = process.argv.slice(2);
try {
  switch (cmd) {
    case "user": {
      const [login, role, name, pw] = a;
      if (!login || !ROLES.includes(role) || !name) throw new Error('Хэрэглээ: user <нэвтрэх нэр|и-мэйл> <student|teacher|guardian> "<Овог нэр>" [нууц үг]');
      if (usernameOf(login) && !/^[a-z0-9._-]{2,40}$/.test(usernameOf(login))) throw new Error("Нэвтрэх нэр зөвхөн латин жижиг үсэг, тоо, . _ - агуулна (2–40 тэмдэгт).");
      const password = pw || tempPassword();
      if (password.length < 8) throw new Error("Нууц үг дор хаяж 8 тэмдэгт байна.");
      const { data, error } = await db.auth.admin.createUser({ email: toEmail(login), password, email_confirm: true, user_metadata: { full_name: name } });
      if (error) throw error;
      // Role-ийг зөвхөн энд, service role-оор онооно
      check(await db.from("profiles").update({ role, full_name: name, username: usernameOf(login) }).eq("id", data.user.id));
      if (role === "student") {
        check(await db.from("student_profiles").upsert({ student_id: data.user.id }));
      }
      console.log(`Үүслээ: ${data.user.email} · ${ROLE_MN[role]}${pw ? "" : ` · түр нууц үг: ${password}`}`);
      if (role === "student") console.log(`Дараагийн алхам: npm run admin -- student ${login} "<Анги>"`);
      break;
    }
    case "student": {
      const [login, cls] = a;
      const p = await requireRole(login, "student");
      check(await db.from("student_profiles").upsert({ student_id: p.id, ...(cls ? { class_name: cls } : {}) }));
      const { data, error } = await db.rpc("seed_student_plan", { sid: p.id });
      if (error) throw error;
      console.log(`${p.full_name}: ${cls ? `анги «${cls}», ` : ""}анхны төлөвлөгөө — ${data.tasks} даалгавар, ${data.schedule} хуваарь, ${data.rewards} шагнал нэмэгдлээ.`);
      break;
    }
    case "link-teacher": case "unlink-teacher": case "link-parent": case "unlink-parent": {
      const [who, studentLogin] = a;
      if (!who || !studentLogin) throw new Error(`Хэрэглээ: ${cmd} <хэрэглэгч> <сурагч>`);
      const isTeacher = cmd.endsWith("teacher");
      const p = await requireRole(who, isTeacher ? "teacher" : "guardian");
      const s = await requireRole(studentLogin, "student");
      const table = isTeacher ? "student_teacher_assignments" : "parent_student_assignments";
      const row = isTeacher ? { teacher_id: p.id, student_id: s.id } : { parent_id: p.id, student_id: s.id };
      if (cmd.startsWith("link")) { check(await db.from(table).upsert(row)); console.log(`Холбогдлоо: ${p.full_name} → ${s.full_name}`); }
      else { let q = db.from(table).delete(); for (const [k, v] of Object.entries(row)) q = q.eq(k, v); check(await q); console.log(`Салгалаа: ${p.full_name} ✕ ${s.full_name}`); }
      break;
    }
    case "password": {
      const [login, pw] = a;
      const u = await findUser(login), password = pw || tempPassword();
      if (password.length < 8) throw new Error("Нууц үг дор хаяж 8 тэмдэгт байна.");
      const { error } = await db.auth.admin.updateUserById(u.id, { password });
      if (error) throw error;
      console.log(`${u.email}: нууц үг солигдлоо${pw ? "" : ` · шинэ түр нууц үг: ${password}`}`);
      break;
    }
    case "list": {
      const { data: ps, error } = await db.from("profiles").select("id, role, full_name, username").order("role");
      if (error) throw error;
      const { data: ta } = await db.from("student_teacher_assignments").select("student_id, teacher_id");
      const { data: pa } = await db.from("parent_student_assignments").select("student_id, parent_id");
      const name = (id) => ps.find((p) => p.id === id)?.full_name || id;
      console.table(ps.map((p) => ({ нэр: p.full_name, нэвтрэх: p.username || "(и-мэйл)", эрх: p.role ? ROLE_MN[p.role] : "эрхгүй" })));
      for (const s of ps.filter((p) => p.role === "student")) {
        const t = ta.filter((x) => x.student_id === s.id).map((x) => name(x.teacher_id));
        const g = pa.filter((x) => x.student_id === s.id).map((x) => name(x.parent_id));
        console.log(`${s.full_name}: багш — ${t.join(", ") || "холбоогүй"}; эцэг эх — ${g.join(", ") || "холбоогүй"}`);
      }
      break;
    }
    default:
      console.log("Командууд: user, student, link-teacher, link-parent, unlink-teacher, unlink-parent, password, list.\nДэлгэрэнгүйг файлын эхэнд болон README-д үзнэ үү.");
  }
} catch (e) {
  console.error("Алдаа:", e.message ?? e);
  process.exit(1);
}
