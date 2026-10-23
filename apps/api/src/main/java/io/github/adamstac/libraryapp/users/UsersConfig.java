package io.github.adamstac.libraryapp.users;

import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.argon2.Argon2PasswordEncoder;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@Configuration(proxyBeanMethods = false)
class UsersConfig {

    /**
     * Argon2id with OWASP's recommended settings: 19 MiB memory, 2 iterations, 1 thread.
     * Hashes are stored as "{argon2}...", so the algorithm can be upgraded later without breaking old passwords.
     */
    @Bean
    PasswordEncoder passwordEncoder() {
        Argon2PasswordEncoder argon2 = new Argon2PasswordEncoder(16, 32, 1, 19 * 1024, 2);
        return new DelegatingPasswordEncoder("argon2", Map.of("argon2", argon2));
    }
}
