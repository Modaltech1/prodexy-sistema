import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

process.on("uncaughtException", (error) => {
  console.error(`Erro: ${error instanceof Error ? error.message : "Não foi possível criar o administrador."}`);
  process.exit(1);
});

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function passwordValidationMessage(password) {
  if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return "Use ao menos 10 caracteres, com letra maiúscula, minúscula e número.";
  }
  return null;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env.local"));
loadEnvFile(path.resolve(process.cwd(), ".env"));

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = normalizeEmail(process.env.ADMIN_EMAIL || "");
const password = process.env.ADMIN_PASSWORD || "";
const displayName = process.env.ADMIN_NAME?.trim() || "Administrador";

if (!url || !serviceKey) {
  throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
}
if (!email || !isValidEmail(email)) {
  throw new Error("Informe ADMIN_EMAIL com um e-mail válido.");
}
const invalidPassword = passwordValidationMessage(password);
if (invalidPassword) throw new Error(invalidPassword);

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail() {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

const existingUser = await findUserByEmail();
if (existingUser) {
  throw new Error("Já existe uma identidade com ADMIN_EMAIL. O bootstrap não altera senhas existentes.");
}

const { data: created, error: createError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { role: "admin", active: true, must_change_password: false },
  user_metadata: { display_name: displayName },
});
if (createError || !created.user) throw createError || new Error("Não foi possível criar o administrador.");

const { error: profileError } = await supabase.from("app_users").insert({
  id: created.user.id,
  display_name: displayName,
  email,
  role: "admin",
  active: true,
  must_change_password: false,
});

if (profileError) {
  await supabase.auth.admin.deleteUser(created.user.id);
  throw new Error(`O perfil não foi criado; a identidade foi revertida. ${profileError.message}`);
}

console.log(`Administrador criado: ${email}`);
