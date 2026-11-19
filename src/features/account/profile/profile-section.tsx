import { connection } from "next/server";
import { getAccountProfile } from "@/server/auth";
import { ProfileForms } from "./profile-forms";

export async function ProfileSection() {
  await connection();
  const profile = await getAccountProfile();
  if (!profile) return null; // the page already required a user
  return <ProfileForms profile={profile} />;
}
