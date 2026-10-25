package io.github.adamstac.libraryapp;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;

/**
 * Security baseline for the whole API: deny by default.
 * Every path is refused unless it is explicitly opened here, with tests proving who may access it.
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

    /** Open to anyone; each has its own protections (rate limits, generic responses). */
    private static final String[] PUBLIC_POSTS = {
        "/api/v1/auth/register",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/login",
        "/api/v1/auth/login/2fa",
        "/api/v1/auth/logout",
        "/api/v1/auth/password-reset/request",
        "/api/v1/auth/password-reset/confirm",
        "/api/v1/auth/passkeys/login/options",
        "/api/v1/auth/passkeys/login",
        "/api/v1/auth/confirm-email-change"
    };

    /** Signed-in accounts only. */
    private static final String[] SIGNED_IN_POSTS = {
        "/api/v1/auth/change-password",
        "/api/v1/auth/2fa/**",
        "/api/v1/auth/passkeys/**",
        "/api/v1/auth/sessions/**",
        "/api/v1/auth/preferences",
        "/api/v1/auth/change-email",
        "/api/v1/auth/delete-account"
    };

    /** Each user's own library. Any method: reading, adding (POST), editing (PUT) and deleting (DELETE). */
    private static final String[] LIBRARY = {
        "/api/v1/authors", "/api/v1/authors/**", "/api/v1/places", "/api/v1/places/**",
        "/api/v1/sciences", "/api/v1/sciences/**", "/api/v1/works", "/api/v1/works/**",
        "/api/v1/editions", "/api/v1/editions/**", "/api/v1/library-settings", "/api/v1/bookmarks",
        "/api/v1/benefits", "/api/v1/benefits/**", "/api/v1/search"
    };

    /** Happen before any session exists, so there is no session for CSRF to ride on. */
    private static final String[] BEFORE_ANY_SESSION = {"/api/v1/auth/register", "/api/v1/auth/verify-email"};

    /**
     * CSRF tokens in a cookie the web app can read (other sites can't) and must echo back in the
     * X-XSRF-TOKEN header on every state-changing request.
     */
    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        CookieCsrfTokenRepository repository = CookieCsrfTokenRepository.withHttpOnlyFalse();
        repository.setCookieCustomizer(cookie -> cookie.secure(true).sameSite("Lax").path("/"));
        return repository;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, CsrfTokenRepository csrfTokenRepository)
            throws Exception {
        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null); // load the token on every request, so the cookie is always set

        http.authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/error")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/csrf")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, PUBLIC_POSTS)
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/auth/me")
                        .permitAll() // 204 when nobody is signed in
                        .requestMatchers(HttpMethod.POST, SIGNED_IN_POSTS)
                        .authenticated()
                        .requestMatchers(
                                HttpMethod.GET,
                                "/api/v1/auth/2fa",
                                "/api/v1/auth/passkeys",
                                "/api/v1/auth/sessions",
                                "/api/v1/auth/security-events")
                        .authenticated()
                        // The library: signed-in accounts only, and every query is scoped to the account (ADR 0006)
                        .requestMatchers(LIBRARY)
                        .authenticated()
                        .anyRequest()
                        .denyAll())
                .csrf(csrf -> csrf.csrfTokenRepository(csrfTokenRepository)
                        .csrfTokenRequestHandler(csrfHandler)
                        .ignoringRequestMatchers(BEFORE_ANY_SESSION))
                // Sessions are created only at sign-in (stored server-side by Spring Session)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
                // Never create a session just to remember a refused request
                .requestCache(AbstractHttpConfigurer::disable)
                // Not signed in = 401
                .exceptionHandling(errors -> errors.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .headers(headers -> headers
                        .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'none'; frame-ancestors 'none'"))
                        .referrerPolicy(referrer -> referrer.policy(ReferrerPolicy.NO_REFERRER))
                        .frameOptions(frame -> frame.deny()));
        // CORS deliberately not enabled: browsers block other websites from calling this API.
        return http.build();
    }

    /** Sign-in is handled by our own endpoint. Stops Spring Boot generating a default user with a random password. */
    @Bean
    UserDetailsService userDetailsService() {
        return new InMemoryUserDetailsManager();
    }
}
