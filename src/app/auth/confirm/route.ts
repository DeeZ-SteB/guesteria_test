import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeReturnTo } from "@/lib/return-to";

const OTP_TYPES = new Set<EmailOtpType>(["signup", "email", "invite", "magiclink", "recovery", "email_change"]);

/**
 * Lands the email-confirmation link. Handles both the PKCE `?code=` link (default for
 * @supabase/ssr) and the `?token_hash=&type=` link from a customised email template.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeReturnTo(params.get("next"));
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error;
  }

  const target = ok ? next : `/?auth=signin&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(new URL(target, request.url));
}
