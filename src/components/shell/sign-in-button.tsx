"use client";

import { Button } from "@/components/ui/button";
import { useAuthModal } from "@/features/auth/auth-modal";

export function SignInButton() {
  const { open } = useAuthModal();
  return (
    <Button variant="outline" onClick={() => open()}>
      Увійти
    </Button>
  );
}
