package io.github.adamstac.libraryapp;

/**
 * The record doesn't exist, or belongs to someone else; becomes 404 with {"code":"not_found"}.
 * Both cases give exactly the same answer, so nobody can tell whether another user's ID is real.
 */
public class NotFoundException extends RuntimeException {

    public NotFoundException() {
        super("not_found", null, false, false);
    }
}
