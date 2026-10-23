package io.github.adamstac.libraryapp;

/** The server is protecting itself (e.g. too many password hashes at once); becomes 503 with Retry-After. */
public class ServiceBusyException extends RuntimeException {

    public ServiceBusyException() {
        super("busy", null, false, false);
    }
}
