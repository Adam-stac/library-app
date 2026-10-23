package io.github.adamstac.libraryapp;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Fixed-window rate limiter, per key (e.g. client IP), held in memory.
 * Correct for a single API instance; several instances would need a shared store such as Postgres or Redis.
 */
public final class RateLimiter {

    private static final int MAX_TRACKED_KEYS = 100_000;

    private record Window(long startMillis, int count) {}

    private final int limit;
    private final long windowMillis;
    private final LongSupplier clock;
    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimiter(int limit, Duration window, LongSupplier clockMillis) {
        this.limit = limit;
        this.windowMillis = window.toMillis();
        this.clock = clockMillis;
    }

    /** Returns 0 if allowed, otherwise the number of seconds until this key may try again. */
    public long tryAcquire(String key) {
        long now = clock.getAsLong();
        if (windows.size() > MAX_TRACKED_KEYS) {
            windows.entrySet().removeIf(entry -> now - entry.getValue().startMillis() >= windowMillis);
        }
        Window window = windows.compute(key, (k, existing) ->
                existing == null || now - existing.startMillis() >= windowMillis
                        ? new Window(now, 1)
                        : new Window(existing.startMillis(), existing.count() + 1));
        if (window.count() <= limit) {
            return 0;
        }
        return Math.max(1, (window.startMillis() + windowMillis - now + 999) / 1000);
    }

    public void reset() {
        windows.clear();
    }
}
