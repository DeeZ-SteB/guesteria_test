// Creates or resets the demo account used by the «Увійти як демо» button.
// Idempotent. Run locally after `npm run db:reset`:
//   npm run demo:ensure
// Against a remote project (Supabase Cloud) it refuses to run without --yes:
//   npm run demo:ensure -- --yes
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_EMAIL, DEMO_PASSWORD in .env.
//
// Safety: the demo user is marked with app_metadata.demo = true (only the secret key can set it).
// The script never touches an existing account without that mark, so a wrong DEMO_EMAIL
// cannot reset a real person's password.
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret, DEMO_EMAIL: email, DEMO_PASSWORD: password } =
  process.env;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!url || !secret || !email || !password) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_EMAIL or DEMO_PASSWORD");
}
if (password.length < 8) fail("DEMO_PASSWORD must be at least 8 characters");

const host = new URL(url).hostname;
const isLocal = ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host);
console.log(`Target Supabase: ${host}${isLocal ? " (local)" : " (REMOTE)"}`);
if (!isLocal && !process.argv.includes("--yes")) {
  fail("Refusing to modify a remote project without --yes");
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const profile = { user_metadata: { first_name: "Демо", last_name: "Гість" }, app_metadata: { demo: true } };

async function findUser() {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found || data.users.length < 200) return found;
  }
}

const existing = await findUser();
if (existing) {
  if (existing.app_metadata?.demo !== true) {
    fail(`${email} exists but is not a demo account (no app_metadata.demo). Not touching it.`);
  }
  const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, ...profile });
  if (error) throw error;
  console.log(`✔ Demo user reset: ${email}`);
} else {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, ...profile });
  if (error) throw error;
  console.log(`✔ Demo user created: ${email}`);
}
