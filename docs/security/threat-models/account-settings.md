# Threat model: account settings

**Scope:** `POST /api/v1/auth/preferences`, `POST /api/v1/auth/change-email`, `POST /api/v1/auth/confirm-email-change`, `POST /api/v1/auth/delete-account`, the account settings page (`/account`), the confirm page (`/confirm-email-change`) and the emails they send.
**ASVS 5.0 (Level 2) chapters:** V6 Authentication (changing the account's identifier, re-authentication), V7 Session Management, V8 Authorization, V14 Data Protection (deletion), V16 Security Logging.
**Personal data:** `email_changes` holds the requested address and a SHA-256 of the emailed token, for at most two hours. Deleting an account removes the account and everything linked to it (sessions, passkeys, two-step verification, recovery codes, reset and email-change links, the security log).

| STRIDE | Threat | Control | Proven by |
| --- | --- | --- | --- |
| Spoofing | A stolen session moves the account to the attacker's address (then resets the password) | The password is needed, and a code too with two-step verification on; wrong guesses count towards the sign-in lock | `changingTheEmailNeedsThePassword`, `withTwoStepVerificationOnACodeIsNeededToo` |
| Spoofing | The account is moved to an address nobody controls, or someone else's | The change only happens when the link sent to the new address is opened (one hour, works once, only the newest) | `changingTheEmailNeedsTheNewInboxAndWarnsTheOldOne`, `onlyTheNewestLinkWorksAndAtMostThreeAreSentAnHour`, `expiredLinksAreRefusedAndThenDeleted` |
| Spoofing | Taking over another account's address | Addresses that already have an account can't be used, including one registered after the link was sent | `anAddressThatAlreadyHasAnAccountGetsTheSameAnswerButNothingChanges`, `anAddressTakenAfterTheLinkWasSentCantBeUsed` |
| Tampering | A malicious page changes settings or deletes the account | CSRF token required on every settings request, including the confirm link | `settingsNeedSignInAndTheCsrfToken`, `ConfirmEmailChangePage.test.tsx` |
| Repudiation | The owner doesn't notice the change | The current address is told when a change is asked for and when it happens; both are in the security activity, with the new address masked | `changingTheEmailNeedsTheNewInboxAndWarnsTheOldOne`, `theChangeIsInTheSecurityActivity` |
| Information disclosure | Finding out which addresses have accounts | The same answer (202) whether or not the new address has an account; that address gets a "nothing changed" email instead of a link | `anAddressThatAlreadyHasAnAccountGetsTheSameAnswerButNothingChanges` |
| Information disclosure | The token leaks through logs or the Referer header | The token is in the link's `#fragment`, removed from the address bar on arrival; only its hash is stored | `changingTheEmailNeedsTheNewInboxAndWarnsTheOldOne`, `ConfirmEmailChangePage.test.tsx` |
| Information disclosure | Deleted data lingers | One transaction deletes the account and everything that references it (`ON DELETE CASCADE`), and every session | `deletingTheAccountRemovesEverythingAndSignsOutEverywhere` |
| Denial of service | Flooding someone's inbox with confirm links | At most 3 email-change requests per account per hour, and at most 3 emails to any one new address per hour across all accounts, plus the per-IP limit | `onlyTheNewestLinkWorksAndAtMostThreeAreSentAnHour`, `severalAccountsCantFloodOneAddress` |
| Elevation of privilege | A stolen session deletes the account | Password needed, and a code with two-step verification on; the web page also asks for a tick to confirm | `deletingTheAccountNeedsThePasswordAndTheCode`, `AccountPage.test.tsx` |
| Elevation of privilege | Old sessions or reset links keep working after the email changes | Every other session ends; reset links sent to the old address stop working; this session gets a new ID | `changingTheEmailNeedsTheNewInboxAndWarnsTheOldOne`, `theLinkWorksWithoutBeingSignedIn` |

## Decisions
- Changing the language isn't a security change, so it doesn't ask for the password. Switching language while signed in saves it to the account, so emails follow.
- The confirm link works without being signed in (it may be opened on a phone), because opening it proves control of the new address and the password was already checked when it was asked for. If the browser opening it is signed in to the same account, that session stays signed in; every other session ends.
- Deleting is immediate, with no grace period. Personal libraries have no shared content, so nothing needs to be kept.

## Accepted risks
- **No "undo" link for an email change.** Someone who has the password, the session and (if on) the second factor can move the account to their address; the owner is told at both steps but can't reverse it alone. The email tells them to contact the site's administrator. A self-service undo link is on the go-live checklist.
- **Backups still hold deleted accounts** until they age out. The backup retention period must be stated in the privacy notice (go-live checklist).
