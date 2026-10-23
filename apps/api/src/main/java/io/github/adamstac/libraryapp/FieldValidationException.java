package io.github.adamstac.libraryapp;

/** A field failed a rule; becomes 400 with {"errors":[{"field","code"}]}. Codes are translated by the web app. */
public class FieldValidationException extends RuntimeException {

    private final String field;
    private final String code;

    public FieldValidationException(String field, String code) {
        super(field + ": " + code, null, false, false);
        this.field = field;
        this.code = code;
    }

    public String field() {
        return field;
    }

    public String code() {
        return code;
    }
}
