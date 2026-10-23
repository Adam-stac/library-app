package io.github.adamstac.libraryapp;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;

/**
 * Security baseline for the whole API: deny by default.
 * Every path is refused unless it is explicitly opened here, with tests proving who may access it.
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

    /** Public because they happen before anyone is signed in. */
    private static final String[] PUBLIC_AUTH_ENDPOINTS = {"/api/v1/auth/register", "/api/v1/auth/verify-email"};

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/error")
                        .permitAll()
                        .requestMatchers(HttpMethod.POST, PUBLIC_AUTH_ENDPOINTS)
                        .permitAll()
                        .anyRequest()
                        .denyAll())
                // Registration happens before any session exists, so there is no session for CSRF to ride on.
                // CSRF protection for signed-in requests arrives with sign-in (slice 2).
                .csrf(csrf -> csrf.ignoringRequestMatchers(PUBLIC_AUTH_ENDPOINTS))
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
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

    /** No sign-in yet. Stops Spring Boot generating a default user with a random password. */
    @Bean
    UserDetailsService userDetailsService() {
        return new InMemoryUserDetailsManager();
    }
}
