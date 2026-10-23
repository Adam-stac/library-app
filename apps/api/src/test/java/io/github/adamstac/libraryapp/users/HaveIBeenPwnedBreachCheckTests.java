package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Tests the real HIBP client against a fake HIBP server on this machine. */
class HaveIBeenPwnedBreachCheckTests {

    private static final String PASSWORD = "password12345678";

    private HttpServer server;
    private final AtomicReference<String> requestedPath = new AtomicReference<>();
    private final AtomicReference<String> paddingHeader = new AtomicReference<>();
    private volatile int status = 200;
    private volatile String responseBody = "";
    private volatile long delayMillis = 0;

    @BeforeEach
    void startFakeServer() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/range/", exchange -> {
            requestedPath.set(exchange.getRequestURI().getPath());
            paddingHeader.set(exchange.getRequestHeaders().getFirst("Add-Padding"));
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, body.length == 0 ? -1 : body.length);
            if (body.length > 0) {
                exchange.getResponseBody().write(body);
            }
            exchange.close();
        });
        server.start();
    }

    @AfterEach
    void stopFakeServer() {
        server.stop(0);
    }

    private HaveIBeenPwnedBreachCheck check(long timeoutMillis) {
        return new HaveIBeenPwnedBreachCheck("http://127.0.0.1:" + server.getAddress().getPort(), timeoutMillis);
    }

    @Test
    void sendsOnlyTheFirstFiveHashCharactersAndAsksForPadding() {
        check(2000).isCompromised(PASSWORD);

        assertThat(requestedPath.get()).isEqualTo("/range/" + sha1(PASSWORD).substring(0, 5));
        assertThat(requestedPath.get()).doesNotContain(PASSWORD).doesNotContain(sha1(PASSWORD).substring(5));
        assertThat(paddingHeader.get()).isEqualTo("true");
    }

    @Test
    void detectsABreachedPassword() {
        responseBody = "0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n" + sha1(PASSWORD).substring(5) + ":3861493\r\n";

        assertThat(check(2000).isCompromised(PASSWORD)).isTrue();
    }

    @Test
    void ignoresPaddingEntriesAndUnlistedPasswords() {
        responseBody = sha1(PASSWORD).substring(5) + ":0\r\n0018A45C4D1DEF81644B54AB7F969B88D65:2\r\n";

        assertThat(check(2000).isCompromised(PASSWORD)).isFalse();
    }

    @Test
    void failsOpenWhenTheServiceErrors() {
        status = 500;

        assertThat(check(2000).isCompromised(PASSWORD)).isFalse();
    }

    @Test
    void failsOpenQuicklyWhenTheServiceHangs() {
        delayMillis = 3000;
        long start = System.nanoTime();

        boolean result = check(200).isCompromised(PASSWORD);

        assertThat(result).isFalse();
        assertThat((System.nanoTime() - start) / 1_000_000).as("gave up within the timeout").isLessThan(1500);
    }

    private static String sha1(String value) {
        try {
            return HexFormat.of()
                    .formatHex(MessageDigest.getInstance("SHA-1").digest(value.getBytes(StandardCharsets.UTF_8)))
                    .toUpperCase(Locale.ROOT);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
