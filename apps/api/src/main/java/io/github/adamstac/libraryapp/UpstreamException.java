package io.github.adamstac.libraryapp;

/**
 * An outside service the request depended on failed or took too long; becomes 502 with a code ("unavailable",
 * "timed_out"), never with anything the service said.
 */
public class UpstreamException extends RuntimeException {

    private final String code;

    public UpstreamException(String code) {
        super(code, null, false, false);
        this.code = code;
    }

    public String code() {
        return code;
    }
}
