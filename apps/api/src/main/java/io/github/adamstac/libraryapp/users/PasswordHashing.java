package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.ServiceBusyException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Argon2 deliberately uses a lot of memory per hash. Capping concurrent hashes stops a flood of
 * requests from exhausting the server; callers that can't get a slot in time get "busy" (503).
 */
@Component
class PasswordHashing {

    private final PasswordEncoder encoder;
    private final Semaphore slots;
    private final long waitMillis;

    @Autowired
    PasswordHashing(PasswordEncoder encoder, @Value("${app.password-hashing.max-concurrent}") int maxConcurrent) {
        this(encoder, maxConcurrent, 2000);
    }

    PasswordHashing(PasswordEncoder encoder, int maxConcurrent, long waitMillis) {
        this.encoder = encoder;
        this.slots = new Semaphore(maxConcurrent, true);
        this.waitMillis = waitMillis;
    }

    String hash(String password) {
        boolean acquired;
        try {
            acquired = slots.tryAcquire(waitMillis, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServiceBusyException();
        }
        if (!acquired) {
            throw new ServiceBusyException();
        }
        try {
            return encoder.encode(password);
        } finally {
            slots.release();
        }
    }
}
