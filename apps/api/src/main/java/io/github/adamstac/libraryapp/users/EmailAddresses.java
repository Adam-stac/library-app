package io.github.adamstac.libraryapp.users;

import java.util.Locale;

/** Ahmad@Example.com and ahmad@example.com are the same account. */
final class EmailAddresses {

    private EmailAddresses() {}

    static String normalize(String email) {
        return email.strip().toLowerCase(Locale.ROOT);
    }
}
