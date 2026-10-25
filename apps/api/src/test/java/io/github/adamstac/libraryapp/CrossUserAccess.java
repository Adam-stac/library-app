package io.github.adamstac.libraryapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpResponse;
import java.util.UUID;

/**
 * The library's access-control check (threat model: library). Another account tries to read, edit and delete a
 * record by its ID; every answer must be a 404 that looks exactly like the answer for an ID that doesn't exist.
 */
public final class CrossUserAccess {

    private CrossUserAccess() {}

    /**
     * @param recordPath the record's address, ending in its ID, e.g. {@code /api/v1/authors/<id>}
     * @param validEdit  a body that would be a valid edit, so only ownership can make the edit fail
     */
    public static void assertInvisible(ApiBrowser intruder, String recordPath, String validEdit) throws Exception {
        String recordId = recordPath.substring(recordPath.lastIndexOf('/') + 1);
        String missingId = UUID.randomUUID().toString();
        String missingPath = recordPath.substring(0, recordPath.lastIndexOf('/') + 1) + missingId;

        for (String method : new String[] {"GET", "PUT", "DELETE"}) {
            HttpResponse<String> theirs = call(intruder, method, recordPath, validEdit);
            HttpResponse<String> missing = call(intruder, method, missingPath, validEdit);

            assertThat(theirs.statusCode()).as(method + " another user's record").isEqualTo(404);
            assertThat(missing.statusCode()).as(method + " a record that doesn't exist").isEqualTo(404);
            assertThat(theirs.body().replace(recordId, "ID"))
                    .as(method + ": the two answers must look the same")
                    .isEqualTo(missing.body().replace(missingId, "ID"));
        }
    }

    private static HttpResponse<String> call(ApiBrowser browser, String method, String path, String body)
            throws Exception {
        return switch (method) {
            case "GET" -> browser.get(path);
            case "PUT" -> browser.put(path, body, "\"0\"");
            default -> browser.delete(path);
        };
    }
}
