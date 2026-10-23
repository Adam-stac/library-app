package io.github.adamstac.libraryapp.users;

/** Is this password known from data breaches? Replaced by a fake in tests. */
interface PasswordBreachCheck {

    boolean isCompromised(String password);
}
