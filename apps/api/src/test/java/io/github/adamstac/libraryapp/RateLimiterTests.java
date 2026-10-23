package io.github.adamstac.libraryapp;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

class RateLimiterTests {

    private final AtomicLong now = new AtomicLong(1_000_000);
    private final RateLimiter limiter = new RateLimiter(3, Duration.ofMinutes(1), now::get);

    @Test
    void allowsUpToTheLimitThenTellsTheCallerWhenToRetry() {
        assertThat(limiter.tryAcquire("1.2.3.4")).isZero();
        assertThat(limiter.tryAcquire("1.2.3.4")).isZero();
        assertThat(limiter.tryAcquire("1.2.3.4")).isZero();

        assertThat(limiter.tryAcquire("1.2.3.4")).isEqualTo(60);
    }

    @Test
    void eachKeyHasItsOwnLimit() {
        for (int i = 0; i < 3; i++) {
            limiter.tryAcquire("1.2.3.4");
        }

        assertThat(limiter.tryAcquire("5.6.7.8")).isZero();
    }

    @Test
    void theLimitResetsAfterTheWindow() {
        for (int i = 0; i < 4; i++) {
            limiter.tryAcquire("1.2.3.4");
        }
        now.addAndGet(Duration.ofMinutes(1).toMillis());

        assertThat(limiter.tryAcquire("1.2.3.4")).isZero();
    }
}
