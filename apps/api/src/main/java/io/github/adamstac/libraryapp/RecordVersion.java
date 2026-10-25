package io.github.adamstac.libraryapp;

import java.util.regex.Pattern;

/**
 * A library record's version travels in HTTP headers, never in the body (ADR 0006): it is sent as a strong ETag
 * ({@code ETag: "3"}), and an edit must send back the version it started from ({@code If-Match: "3"}), so an edit
 * made on another device in the meantime is never silently overwritten.
 */
public final class RecordVersion {

    private static final Pattern IF_MATCH = Pattern.compile("\"(\\d{1,9})\"");

    private RecordVersion() {}

    public static String etag(int version) {
        return "\"" + version + "\"";
    }

    /** The version an edit started from; a missing or malformed {@code If-Match} answers 400 version_required. */
    public static int fromIfMatch(String ifMatch) {
        var match = ifMatch == null ? null : IF_MATCH.matcher(ifMatch.strip());
        if (match == null || !match.matches()) {
            throw new InvalidRequestException("version_required");
        }
        return Integer.parseInt(match.group(1));
    }
}
