package io.github.adamstac.libraryapp.users;

/** Sends plain-text emails. Replaced by a recording fake in tests. */
interface Mailer {

    void send(String to, String subject, String body);
}
