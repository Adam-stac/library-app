package io.github.adamstac.libraryapp;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Protects every library change (everything under /api/v1 except /api/v1/auth, which has its own filter):
 * request bodies must declare their size and stay under 64 KB, and each signed-in account may make only so many
 * changes a minute. Runs after Spring Security, so only signed-in requests with a valid CSRF token reach it.
 */
@Component
class LibraryRequestFilter extends OncePerRequestFilter {

    /** Room for a 10,000-character biography in Arabic (2 bytes a letter) plus every other field. */
    static final int MAX_BODY_BYTES = 64 * 1024;

    private static final Set<String> CHANGES = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final RateLimiter changesPerAccount;

    LibraryRequestFilter(@Value("${app.rate-limit.library.changes-per-minute}") int changesPerMinute) {
        this.changesPerAccount = new RateLimiter(changesPerMinute, Duration.ofMinutes(1), System::currentTimeMillis);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !CHANGES.contains(request.getMethod())
                || !path.startsWith("/api/v1/")
                || path.startsWith("/api/v1/auth/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!"DELETE".equals(request.getMethod())) {
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
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.isAuthenticated()
                && !(authentication instanceof AnonymousAuthenticationToken)) {
            long retryAfterSeconds = changesPerAccount.tryAcquire(authentication.getName());
            if (retryAfterSeconds > 0) {
                response.setHeader("Retry-After", Long.toString(retryAfterSeconds));
                reject(response, 429, "rate_limited");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static void reject(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"status\":" + status + ",\"code\":\"" + code + "\"}");
    }
}
