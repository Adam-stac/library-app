package io.github.adamstac.libraryapp.users;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Have I Been Pwned "range" check using k-anonymity: only the first 5 characters of the password's
 * SHA-1 hash are sent, never the password or full hash. SHA-1 is required by that protocol; it is
 * not used to store anything. Padding is requested so response sizes reveal nothing.
 * Strict timeouts; if the service fails, the password is allowed (fail open) and a warning is logged.
 */
@Component
class HaveIBeenPwnedBreachCheck implements PasswordBreachCheck {

    private static final Logger log = LoggerFactory.getLogger(HaveIBeenPwnedBreachCheck.class);

    private final HttpClient client;
    private final URI baseUri;
    private final Duration timeout;

    HaveIBeenPwnedBreachCheck(
            @Value("${app.hibp.base-url}") String baseUrl, @Value("${app.hibp.timeout-ms}") long timeoutMillis) {
        this.timeout = Duration.ofMillis(timeoutMillis);
        this.baseUri = URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
        this.client = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Override
    public boolean isCompromised(String password) {
        String hash = sha1Hex(password);
        String prefix = hash.substring(0, 5);
        String suffix = hash.substring(5);
        try {
            HttpRequest request = HttpRequest.newBuilder(baseUri.resolve("range/" + prefix))
                    .timeout(timeout)
                    .header("Add-Padding", "true")
                    .header("User-Agent", "library-app")
                    .GET()
                    .build();
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Breached-password check returned HTTP {}; allowing the password", response.statusCode());
                return false;
            }
            return response.body()
                    .lines()
                    .map(String::strip)
                    .anyMatch(line -> line.length() > 36
                            && line.regionMatches(true, 0, suffix, 0, 35)
                            && line.charAt(35) == ':'
                            && !line.substring(36).equals("0")); // count 0 = padding, not a real match
        } catch (IOException e) {
            log.warn("Breached-password check unavailable ({}); allowing the password", e.getClass().getSimpleName());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String sha1Hex(String value) {
        try {
            MessageDigest sha1 = MessageDigest.getInstance("SHA-1");
            return HexFormat.of()
                    .formatHex(sha1.digest(value.getBytes(StandardCharsets.UTF_8)))
                    .toUpperCase(Locale.ROOT);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-1 is always available", e);
        }
    }
}
