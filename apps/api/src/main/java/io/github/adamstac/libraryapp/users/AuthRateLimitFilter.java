package io.github.adamstac.libraryapp.users;

import io.github.adamstac.libraryapp.RateLimiter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Protects every /api/v1/auth endpoint before any work is done:
 * request bodies must declare their size and stay small, and each client IP is rate-limited.
 * The client IP comes from nginx's X-Forwarded-For, which nginx overwrites, so clients can't fake it.
 */
@Component
class AuthRateLimitFilter extends OncePerRequestFilter {

    static final int MAX_BODY_BYTES = 4096;

    private final RateLimiter perClientIp;

    AuthRateLimitFilter(@Value("${app.rate-limit.auth.requests-per-minute}") int requestsPerMinute) {
        this.perClientIp = new RateLimiter(requestsPerMinute, Duration.ofMinutes(1), System::currentTimeMillis);
    }

    /** For tests only. */
    void reset() {
        perClientIp.reset();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // Only state-changing requests count; reads like /me and /csrf are cheap
        return !"POST".equals(request.getMethod()) || !request.getRequestURI().startsWith("/api/v1/auth/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if ("POST".equals(request.getMethod())) {
            long length = request.getContentLengthLong();
            if (length < 0) {
                reject(response, HttpServletResponse.SC_LENGTH_REQUIRED, "length_required");
                return;
            }
            if (length > MAX_BODY_BYTES) {
                reject(response, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "request_too_large");
                return;
            }
        }
        long retryAfterSeconds = perClientIp.tryAcquire(request.getRemoteAddr());
        if (retryAfterSeconds > 0) {
            response.setHeader("Retry-After", Long.toString(retryAfterSeconds));
            reject(response, 429, "rate_limited");
            return;
        }
        chain.doFilter(request, response);
    }

    private static void reject(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"status\":" + status + ",\"code\":\"" + code + "\"}");
    }
}
