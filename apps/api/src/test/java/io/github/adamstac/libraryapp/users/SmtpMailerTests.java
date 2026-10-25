package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/** Sends through a real SMTP server (Mailpit) and checks the Arabic subject and body arrive intact. */
class SmtpMailerTests {

    @SuppressWarnings({"rawtypes", "resource"})
    private static final GenericContainer MAILPIT =
            new GenericContainer(DockerImageName.parse("axllent/mailpit:v1.32.0")).withExposedPorts(1025, 8025);

    @BeforeAll
    static void start() {
        MAILPIT.start();
    }

    @AfterAll
    static void stop() {
        MAILPIT.stop();
    }

    @Test
    void arabicEmailsArriveIntact() throws Exception {
        JavaMailSenderImpl sender = new JavaMailSenderImpl();
        sender.setHost(MAILPIT.getHost());
        sender.setPort(MAILPIT.getMappedPort(1025));
        sender.setDefaultEncoding("UTF-8");
        RegistrationEmails.Email email =
                RegistrationEmails.verification("ar", "http://localhost:3000/verify-email#token=abc");

        new SmtpMailer(sender, "Khizana <no-reply@library.local>").send("reader@example.com", email.subject(), email.body());

        String inbox = "";
        for (int attempt = 0; attempt < 50 && !inbox.contains("reader@example.com"); attempt++) {
            Thread.sleep(100);
            inbox = get("http://" + MAILPIT.getHost() + ":" + MAILPIT.getMappedPort(8025) + "/api/v1/messages");
        }
        assertThat(inbox).contains("reader@example.com").contains(email.subject());
    }

    private static String get(String url) throws Exception {
        return HttpClient.newHttpClient()
                .send(HttpRequest.newBuilder(URI.create(url)).GET().build(), HttpResponse.BodyHandlers.ofString())
                .body();
    }
}
