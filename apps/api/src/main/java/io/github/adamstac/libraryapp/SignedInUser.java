package io.github.adamstac.libraryapp;

import java.util.UUID;
import org.springframework.security.core.Authentication;

/** Who is making the request. Signing in stores the account's ID as the principal's name (users module). */
public final class SignedInUser {

    private SignedInUser() {}

    public static UUID id(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
