/** Matches the API's rules (NIST SP 800-63B): length only, 15 to 128 characters. */
export const MIN_PASSWORD_LENGTH = 15

/** Characters as a person counts them (Arabic letters and emoji count as one), matching the API. */
export function passwordLength(password: string): number {
  return [...password.normalize('NFKC')].length
}
