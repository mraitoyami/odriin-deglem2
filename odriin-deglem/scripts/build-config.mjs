#!/usr/bin/env node
// .env.local (эсвэл Vercel/Netlify-ийн орчны хувьсагч)-аас public/config.js үүсгэнэ.
// Зөвхөн нийтэд ил байх зориулалттай URL ба anon (publishable) түлхүүрийг бичнэ.
// service_role түлхүүр энд байвал алдаа өгч зогсоно — тэр хэзээ ч браузерт очих ёсгүй.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env };
const file = join(root, ".env.local");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = env.SUPABASE_URL || "";
const key = env.SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";
const domain = env.USERNAME_DOMAIN || "";

if (!url || !key) {
  console.error("SUPABASE_URL болон SUPABASE_ANON_KEY олдсонгүй. .env.local файлаа .env.local.example-ийн дагуу бөглөнө үү.");
  process.exit(1);
}
if (/YOUR-PROJECT/i.test(url) || /таны-/.test(key)) {
  console.error(".env.local-д жишээ утга үлдсэн байна. Supabase → Project Settings → API хэсгээс жинхэнэ утгаа хуулж бичнэ үү.");
  process.exit(1);
}
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
  console.error(`SUPABASE_URL буруу хэлбэртэй байна: ${url}\nЖишээ: https://abcdefghijklmnop.supabase.co`);
  process.exit(1);
}
// Нууц түлхүүрийг андуурч бичихээс сэргийлнэ
function jwtRole(k) { try { return JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).role; } catch { return null; } }
if ((env.SUPABASE_SERVICE_ROLE_KEY && env.SUPABASE_SERVICE_ROLE_KEY === key) || jwtRole(key) === "service_role" || key.startsWith("sb_secret_")) {
  console.error("АНХААР: SUPABASE_ANON_KEY-д service_role (нууц) түлхүүр бичсэн байна. anon / publishable түлхүүрийг бичнэ үү.");
  process.exit(1);
}
const out = `// Автоматаар үүсгэсэн файл (npm run config). Гараар бүү засаарай.
// Зөвхөн нийтэд ил байх зориулалттай утгууд. Хамгаалалтыг database-ийн RLS хийнэ.
window.APP_CONFIG = ${JSON.stringify({ SUPABASE_URL: url.replace(/\/$/, ""), SUPABASE_ANON_KEY: key, USERNAME_DOMAIN: domain }, null, 2)};
`;
writeFileSync(join(root, "public/config.js"), out);
console.log("public/config.js үүслээ:", url);
