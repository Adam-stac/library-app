package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.adamstac.libraryapp.ServiceBusyException;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class PasswordHashingTests {

    @Test
    void refusesWhenTooManyHashesAreAlreadyRunning() throws Exception {
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        PasswordEncoder slowEncoder = new PasswordEncoder() {
            @Override
            public String encode(CharSequence rawPassword) {
                started.countDown();
                try {
                    release.await();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                return "hashed";
            }

            @Override
            public boolean matches(CharSequence rawPassword, String encodedPassword) {
                return false;
            }
        };
        PasswordHashing hashing = new PasswordHashing(slowEncoder, 1, 50);

        Thread first = Thread.ofVirtual().start(() -> hashing.hash("first"));
        started.await();

        assertThatThrownBy(() -> hashing.hash("second")).isInstanceOf(ServiceBusyException.class);

        release.countDown();
        first.join();
        assertThat(hashing.hash("third")).isEqualTo("hashed");
    }
}
