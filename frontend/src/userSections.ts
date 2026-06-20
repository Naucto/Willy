// The administrative sections of a user's detail page, in sidebar/URL order. Shared by the shell
// sidebar and the detail page so both agree on the set + order — mirrors deploymentSections().
export interface UserSection {
  key: string;
  label: string;
}

export function userSections(): UserSection[] {
  return [
    { key: "general", label: "General" },
    { key: "security", label: "Security" },
    { key: "twofa", label: "2FA Auth" },
  ];
}
