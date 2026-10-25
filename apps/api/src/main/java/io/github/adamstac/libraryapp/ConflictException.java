package io.github.adamstac.libraryapp;

import java.util.Map;

/**
 * The request clashes with the current state (an edit based on an old version, a full library, a record still in
 * use); becomes 409 with {"code": ...}, plus any details, which must never contain text a user typed.
 */
public class ConflictException extends RuntimeException {

    private final String code;
    private final Map<String, Object> details;

    public ConflictException(String code) {
        this(code, Map.of());
    }

    public ConflictException(String code, Map<String, Object> details) {
        super(code, null, false, false);
        this.code = code;
        this.details = Map.copyOf(details);
    }

    public String code() {
        return code;
    }

    public Map<String, Object> details() {
        return details;
    }
}
