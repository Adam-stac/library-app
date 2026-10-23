package io.github.adamstac.libraryapp;

/** The request can't be completed (e.g. an expired link); becomes 400 with {"code": ...}. */
public class InvalidRequestException extends RuntimeException {

    private final String code;

    public InvalidRequestException(String code) {
        super(code, null, false, false);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
