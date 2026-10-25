package io.github.adamstac.libraryapp;

/**
 * The signed-in user may see the record but not change it (a place on the shared starter list);
 * becomes 403 with {"code": ...}.
 */
public class ForbiddenException extends RuntimeException {

    private final String code;

    public ForbiddenException(String code) {
        super(code, null, false, false);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
