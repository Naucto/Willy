// A git clone/fetch that fails surfaces the full command in the child-process error — and when the
// remote was authenticated, that command carries the token inline (`https://x-access-token:<pat>@…`).
// Scrub before anything reaches a log line or the database, so credentials never persist in cleartext.

// `scheme://user:password@host` → strip the password. Username and password exclude `/@` (path/host
// boundaries) so this only matches real userinfo, not a `host:port/path` that happens to contain a colon.
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s/@]+(@)/gi;

// Redact secrets from text bound for logs or storage. Known secret values (e.g. a resolved git token)
// are replaced wholesale; on top of that, credentials embedded in any URL are stripped generically so a
// token still leaks nothing even when its literal value isn't on hand (submodule fetches, unknown creds).
export function scrubSecrets(text: string, secrets: readonly string[] = []): string {
  let result = text;

  for (const secret of secrets) {
    if (secret.length > 0) {
      result = result.replaceAll(secret, "***");
    }
  }

  return result.replace(URL_CREDENTIALS, "$1***$2");
}
