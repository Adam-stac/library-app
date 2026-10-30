package io.github.adamstac.libraryapp;

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
 * Limits the public reads under /api/v1/public (the landing page's timeline, slice T3): each client address may ask
 * only so many times a minute, signed in or not. The address comes from nginx's X-Forwarded-For, which nginx
 * overwrites, so clients can't fake it. Anything else under /api/v1/public is refused by SecurityConfig.
 */
@Component
class PublicReadFilter extends OncePerRequestFilter {

    private final RateLimiter perClientIp;

    PublicReadFilter(@Value("${app.rate-limit.public.requests-per-minute}") int requestsPerMinute) {
        this.perClientIp = new RateLimiter(requestsPerMinute, Duration.ofMinutes(1), System::currentTimeMillis);
    }

    /** For tests only. */
    void reset() {
        perClientIp.reset();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/v1/public/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        long retryAfterSeconds = perClientIp.tryAcquire(request.getRemoteAddr());
        if (retryAfterSeconds > 0) {
            response.setHeader("Retry-After", Long.toString(retryAfterSeconds));
            response.setStatus(429);
            response.setContentType("application/problem+json");
            response.getWriter().write("{\"status\":429,\"code\":\"rate_limited\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
