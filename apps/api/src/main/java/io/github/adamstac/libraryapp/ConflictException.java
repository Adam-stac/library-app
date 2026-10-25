package io.github.adamstac.libraryapp;

/**
 * The request clashes with the current state (an edit based on an old version, a full library);
 * becomes 409 with {"code": ...}.
 */
public class ConflictException extends RuntimeException {

    private final String code;

    public ConflictException(String code) {
        super(code, null, false, false);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
