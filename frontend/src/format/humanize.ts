// SCREAMING_CASE enum value → prose, e.g. "ADMIN" → "Admin", "WEB" → "Web".
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function humanizeRole(role: string): string {
  return titleCase(role);
}

export function humanizeType(type: string): string {
  return titleCase(type);
}

// A user's display label: their name when set, otherwise the email they sign in with.
export function displayName(user: { name?: string | null; email: string }): string {
  return user.name?.trim() ? user.name : user.email;
}
