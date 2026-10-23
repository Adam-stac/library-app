package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.TestcontainersConfiguration;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;

@Import({TestcontainersConfiguration.class, RegistrationTests.TestBeans.class})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class RegistrationTests {

    static final String STRONG_PASSWORD = "correct horse battery staple 42";
    static final String BREACHED_PASSWORD = "password12345678";
    static final Pattern TOKEN_LINK = Pattern.compile("/verify-email#token=([A-Za-z0-9_-]{43})");

    record SentEmail(String to, String subject, String body) {}

    static class RecordingMailer implements Mailer {
        final List<SentEmail> sent = new CopyOnWriteArrayList<>();

        @Override
        public void send(String to, String subject, String body) {
            sent.add(new SentEmail(to, subject, body));
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestBeans {
        @Bean
        @Primary
        RecordingMailer recordingMailer() {
            return new RecordingMailer();
        }

        /** Sends synchronously (still only after commit), so tests can check emails straight away. */
        @Bean
        @Primary
        MailDispatcher synchronousMailDispatcher(RecordingMailer mailer) {
            return new MailDispatcher(mailer, Runnable::run);
        }

        @Bean
        @Primary
        PasswordBreachCheck fakeBreachCheck() {
            return password -> Set.of(BREACHED_PASSWORD).contains(password);
        }
    }

    private final HttpClient client = HttpClient.newHttpClient();

    @Value("${local.server.port}")
    private int port;

    @Autowired
    private RecordingMailer mailer;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private AuthRateLimitFilter rateLimitFilter;

    @Autowired
    private RegistrationService registrations;

    @Autowired
    private TransactionTemplate transactions;

    @Autowired
    private PendingRegistrationCleanup cleanup;

    @BeforeEach
    void cleanUp() {
        mailer.sent.clear();
        rateLimitFilter.reset();
        jdbc.sql("DELETE FROM pending_registrations").update();
        jdbc.sql("DELETE FROM users").update();
    }

    @Test
    void registeringSendsAVerificationEmailAndStoresOnlyAHashOfTheToken() throws Exception {
        HttpResponse<String> response = register("  Reader@Example.com ", STRONG_PASSWORD, "en");

        assertThat(response.statusCode()).isEqualTo(202);
        assertThat(mailer.sent).hasSize(1);
        assertThat(mailer.sent.getFirst().to()).isEqualTo("reader@example.com");
        String token = tokenFrom(mailer.sent.getFirst());

        assertThat(count("SELECT count(*) FROM pending_registrations WHERE token_hash = :v", Tokens.hash(token)))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM pending_registrations WHERE token_hash = :v", token))
                .isZero();
        assertThat(count("SELECT count(*) FROM users WHERE email = :v", "reader@example.com"))
                .as("no account until the email is verified")
                .isZero();
    }

    @Test
    void verifyingCreatesTheAccountWithAnArgon2HashAndTheLinkWorksOnlyOnce() throws Exception {
        register("reader@example.com", STRONG_PASSWORD, "ar");
        String token = tokenFrom(mailer.sent.getFirst());

        assertThat(verify(token).statusCode()).isEqualTo(204);

        String hash = passwordHashOf("reader@example.com");
        assertThat(hash).startsWith("{argon2}$argon2id$");
        assertThat(passwordEncoder.matches(STRONG_PASSWORD, hash)).isTrue();
        assertThat(count("SELECT count(*) FROM pending_registrations WHERE email = :v", "reader@example.com"))
                .isZero();

        HttpResponse<String> again = verify(token);
        assertThat(again.statusCode()).isEqualTo(400);
        assertThat(again.body()).contains("invalid_token");
    }

    @Test
    void emailsAreSentInTheChosenLanguage() throws Exception {
        register("arabic@example.com", STRONG_PASSWORD, "ar");

        assertThat(mailer.sent.getFirst().subject()).contains("تأكيد");
        assertThat(mailer.sent.getFirst().body()).contains("السلام عليكم");
    }

    @Test
    void expiredLinksAreRejected() throws Exception {
        register("reader@example.com", STRONG_PASSWORD, "en");
        String token = tokenFrom(mailer.sent.getFirst());
        jdbc.sql("UPDATE pending_registrations SET expires_at = now() - interval '1 minute'").update();

        assertThat(verify(token).statusCode()).isEqualTo(400);
        assertThat(count("SELECT count(*) FROM users WHERE email = :v", "reader@example.com")).isZero();
    }

    @Test
    void unknownOrMalformedTokensAreRejected() throws Exception {
        assertThat(verify(Tokens.generate()).statusCode()).isEqualTo(400);
        assertThat(verify("").statusCode()).isEqualTo(400);
        assertThat(verify("x".repeat(500)).statusCode()).isEqualTo(400);
    }

    @Test
    void anExistingAccountGetsTheSameResponseAndANoticeInsteadOfALink() throws Exception {
        HttpResponse<String> first = register("reader@example.com", STRONG_PASSWORD, "en");
        verify(tokenFrom(mailer.sent.getFirst()));
        mailer.sent.clear();

        HttpResponse<String> second = register("reader@example.com", "a different long passphrase", "en");

        // Same response as a brand-new email: nothing reveals that the account exists
        assertThat(second.statusCode()).isEqualTo(first.statusCode());
        assertThat(second.body()).isEqualTo(first.body());
        assertThat(mailer.sent).hasSize(1);
        assertThat(mailer.sent.getFirst().body()).doesNotContain("#token=");
        assertThat(count("SELECT count(*) FROM pending_registrations WHERE email = :v", "reader@example.com"))
                .isZero();
        assertThat(passwordEncoder.matches(STRONG_PASSWORD, passwordHashOf("reader@example.com")))
                .as("password unchanged")
                .isTrue();
    }

    @Test
    void anAttackersEarlierRegistrationCannotBecomeTheVictimsAccount() throws Exception {
        register("victim@example.com", "attackers own long password", "en");
        String attackerToken = tokenFrom(mailer.sent.get(0));
        register("victim@example.com", STRONG_PASSWORD, "en");
        String victimToken = tokenFrom(mailer.sent.get(1));

        verify(victimToken);

        String hash = passwordHashOf("victim@example.com");
        assertThat(passwordEncoder.matches(STRONG_PASSWORD, hash)).isTrue();
        assertThat(passwordEncoder.matches("attackers own long password", hash)).isFalse();
        assertThat(verify(attackerToken).statusCode()).as("other attempts are cancelled").isEqualTo(400);
    }

    @Test
    void passwordsMustBeLongEnough() throws Exception {
        HttpResponse<String> response = register("reader@example.com", "too short", "en");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("password").contains("too_short");
        assertThat(mailer.sent).isEmpty();
    }

    @Test
    void arabicPasswordsAreMeasuredInRealCharacters() throws Exception {
        assertThat(register("reader@example.com", "ابتثجحخدذرزسشصض", "ar").statusCode()).isEqualTo(202);
    }

    @Test
    void breachedPasswordsAreRefused() throws Exception {
        HttpResponse<String> response = register("reader@example.com", BREACHED_PASSWORD, "en");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("compromised");
        assertThat(mailer.sent).isEmpty();
    }

    @Test
    void invalidFieldsAreRejectedWithCodes() throws Exception {
        HttpResponse<String> response = register("not-an-email", STRONG_PASSWORD, "fr");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("invalid_email").contains("language");
        assertThat(response.body()).doesNotContainIgnoringCase("exception").doesNotContain("trace");
    }

    @Test
    void atMostThreeVerificationEmailsPerAddressPerHour() throws Exception {
        for (int i = 0; i < 4; i++) {
            assertThat(register("reader@example.com", STRONG_PASSWORD, "en").statusCode()).isEqualTo(202);
        }

        assertThat(mailer.sent).hasSize(RegistrationService.MAX_EMAILS_PER_ADDRESS_PER_HOUR);
    }

    @Test
    void oneClientCannotFloodTheAuthEndpoints() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertThat(register("reader" + i + "@example.com", STRONG_PASSWORD, "en").statusCode())
                    .isEqualTo(202);
        }

        HttpResponse<String> blocked = register("reader10@example.com", STRONG_PASSWORD, "en");

        assertThat(blocked.statusCode()).isEqualTo(429);
        assertThat(blocked.headers().firstValue("Retry-After")).isPresent();
        assertThat(blocked.body()).contains("rate_limited");
        assertThat(mailer.sent).hasSize(10);
    }

    @Test
    void oversizedRequestsAreRefusedBeforeAnyWork() throws Exception {
        HttpResponse<String> response = register("a".repeat(5000) + "@example.com", STRONG_PASSWORD, "en");

        assertThat(response.statusCode()).isEqualTo(413);
        assertThat(mailer.sent).isEmpty();
    }

    @Test
    void noEmailIsSentIfTheDatabaseChangeIsRolledBack() {
        transactions.executeWithoutResult(status -> {
            registrations.register("reader@example.com", STRONG_PASSWORD, "en");
            status.setRollbackOnly();
        });

        assertThat(mailer.sent).isEmpty();
        assertThat(count("SELECT count(*) FROM pending_registrations WHERE email = :v", "reader@example.com"))
                .isZero();
    }

    @Test
    void expiredRegistrationsAreDeletedAutomatically() throws Exception {
        register("expired@example.com", STRONG_PASSWORD, "en");
        register("current@example.com", STRONG_PASSWORD, "en");
        jdbc.sql("UPDATE pending_registrations SET expires_at = now() - interval '1 minute' WHERE email = 'expired@example.com'")
                .update();

        assertThat(cleanup.deleteExpired()).isEqualTo(1);
        assertThat(count("SELECT count(*) FROM pending_registrations WHERE email = :v", "expired@example.com"))
                .isZero();
        assertThat(count("SELECT count(*) FROM pending_registrations WHERE email = :v", "current@example.com"))
                .isEqualTo(1);
    }

    private HttpResponse<String> register(String email, String password, String language) throws Exception {
        return post("/api/v1/auth/register", """
                {"email":"%s","password":"%s","language":"%s"}""".formatted(email, password, language));
    }

    private HttpResponse<String> verify(String token) throws Exception {
        return post("/api/v1/auth/verify-email", """
                {"token":"%s"}""".formatted(token));
    }

    private HttpResponse<String> post(String path, String json) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();
        return client.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private String passwordHashOf(String email) {
        return jdbc.sql("SELECT password_hash FROM users WHERE email = :email")
                .param("email", email)
                .query(String.class)
                .single();
    }

    private static String tokenFrom(SentEmail email) {
        Matcher matcher = TOKEN_LINK.matcher(email.body());
        assertThat(matcher.find()).as("email contains a verification link").isTrue();
        return matcher.group(1);
    }

    private long count(String sql, String value) {
        return jdbc.sql(sql).param("v", value).query(Long.class).single();
    }
}
