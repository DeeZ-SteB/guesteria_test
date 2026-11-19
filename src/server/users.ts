import "server-only";
import { createAdminClient } from "@/server/db/admin";

/**
 * Hard-deletes an auth user. Their favorites, guest requests and (past/cancelled) bookings go
 * with them via `on delete cascade`. Callers must have verified the user and their password.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const { error } = await createAdminClient().auth.admin.deleteUser(userId, false);
  if (error) throw new Error(`account delete failed (${error.status ?? "?"})`);
}
