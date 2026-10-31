package io.github.adamstac.libraryapp.pages;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.ApiBrowser;
import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;

/** With no API key set, reading pages is off: the form isn't offered it, and asking anyway finds nothing. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ApiBrowser.MANY_SIGN_INS)
class PageReadingOffTests {

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void withoutAKeyTheFeatureIsOff() throws Exception {
        ApiBrowser reader = ApiBrowser.newAccount(port, jdbc, passwordEncoder);

        assertThat(reader.get("/api/v1/page-readings/status").body()).contains("\"enabled\":false");
        assertThat(reader.postBytes("/api/v1/page-readings", PageReadingTests.jpeg(), "image/jpeg", true).statusCode())
                .isEqualTo(404);
        assertThat(jdbc.sql("SELECT count(*) FROM page_readings").query(Long.class).single()).isZero();
    }
}
