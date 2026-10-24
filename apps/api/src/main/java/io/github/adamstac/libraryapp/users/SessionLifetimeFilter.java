package io.github.adamstac.libraryapp.users;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * An absolute limit on how long a sign-in lasts, however active it is (the idle limit is separate, 12 hours).
 * Runs after the session is loaded and before Spring Security (order -100) reads it, so an expired sign-in is
 * simply treated as signed out.
 */
@Component
@Order(-101)
class SessionLifetimeFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(SessionLifetimeFilter.class);

    private final Duration maxAge;

    SessionLifetimeFilter(@Value("${app.session.max-age}") Duration maxAge) {
        this.maxAge = maxAge;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        if (session != null
                && session.getAttribute(SignInSessions.SIGNED_IN_AT) instanceof Long signedInAt
                && System.currentTimeMillis() - signedInAt > maxAge.toMillis()) {
            log.info("Ended a session that reached its maximum age of {}", maxAge);
            session.invalidate();
        }
        chain.doFilter(request, response);
    }
}
