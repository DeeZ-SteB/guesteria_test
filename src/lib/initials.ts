type NameParts = { firstName?: string | null; lastName?: string | null; email?: string | null };

function firstLetter(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  // Array.from splits by code point, so surrogate pairs are not cut in half.
  return (Array.from(trimmed)[0] ?? "").toLocaleUpperCase("uk");
}

/** Up to two letters for the avatar: first + last name, else first name, else email. */
export function initials({ firstName, lastName, email }: NameParts): string {
  const fromName = firstLetter(firstName) + firstLetter(lastName);
  if (fromName) return fromName;
  return firstLetter(email) || "?";
}
