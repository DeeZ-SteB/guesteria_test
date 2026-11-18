// Creates or resets the demo account used by the «Увійти як демо» button.
// Idempotent. Run locally after `npm run db:reset`, and once against Supabase Cloud.
//   npm run demo:ensure
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_EMAIL, DEMO_PASSWORD in .env.
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret, DEMO_EMAIL: email, DEMO_PASSWORD: password } =
  process.env;

if (!url || !secret || !email || !password) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, DEMO_EMAIL or DEMO_PASSWORD");
  process.exit(1);
}
if (password.length < 8) {
  console.error("DEMO_PASSWORD must be at least 8 characters");
  process.exit(1);
}

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const metadata = { first_name: "Демо", last_name: "Гість" };

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
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  console.log(`Demo user updated: ${email}`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw error;
  console.log(`Demo user created: ${email}`);
}
