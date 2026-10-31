package io.github.adamstac.libraryapp;

/** A limit on something that costs money or effort was reached; becomes 429 with its code (such as "day_limit"). */
public class LimitReachedException extends RuntimeException {

    private final String code;

    public LimitReachedException(String code) {
        super(code, null, false, false);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
