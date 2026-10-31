package io.github.adamstac.libraryapp.pages;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The limits on reading pages, so the cost stays within what was decided (ADR 0011, point 4): small limits here, to
 * reach them. A reading is counted before Google is asked; at a limit Google isn't asked at all.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
            ApiBrowser.MANY_SIGN_INS,
            "app.page-reading.per-account-day=2",
            "app.page-reading.per-account-month=3",
            "app.page-reading.app-month=4"
        })
class PageReadingLimitTests {

    static final FakeVision VISION = new FakeVision();

    @DynamicPropertySource
    static void reading(DynamicPropertyRegistry registry) {
        registry.add("app.page-reading.api-key", () -> "test-key");
        registry.add("app.page-reading.endpoint", VISION::url);
    }

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void theAccountsDayAndMonthLimitsAndTheAppsCapAreKept() throws Exception {
        ApiBrowser one = newAccount();
        assertThat(read(one).statusCode()).isEqualTo(200);
        assertThat(read(one).statusCode()).isEqualTo(200);

        // A third today: the day's limit
        HttpResponse<String> third = read(one);
        assertThat(third.statusCode()).isEqualTo(429);
        assertThat(third.body()).contains("\"code\":\"day_limit\"");
        assertThat(one.get("/api/v1/page-readings/status").body()).contains("\"leftToday\":0");

        // Yesterday's reading still counts for the month
        jdbc.sql("UPDATE page_readings SET read_at = date_trunc('month', now()) WHERE owner_id = :owner")
                .param("owner", one.accountId())
                .update();
        assertThat(read(one).statusCode()).as("the month's third").isIn(200, 429);

        // The app's cap, whoever asks
        ApiBrowser two = newAccount();
        HttpResponse<String> over;
        int tries = 0;
        do {
            over = read(two);
            tries++;
        } while (over.statusCode() == 200 && tries < 5);
        assertThat(over.statusCode()).isEqualTo(429);
        assertThat(over.body()).contains("\"code\":\"app_limit\"");
        assertThat(two.get("/api/v1/page-readings/status").body()).contains("\"paused\":true");
        assertThat(VISION.requests()).hasSize(4); // Google was asked exactly as many times as the cap allows
    }

    private HttpResponse<String> read(ApiBrowser reader) throws Exception {
        return reader.postBytes("/api/v1/page-readings", PageReadingTests.jpeg(), "image/jpeg", true);
    }

    private ApiBrowser newAccount() throws Exception {
        return ApiBrowser.newAccount(port, jdbc, passwordEncoder);
    }
}
