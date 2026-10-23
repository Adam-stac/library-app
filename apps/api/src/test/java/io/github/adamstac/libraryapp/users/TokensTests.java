package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class TokensTests {

    @Test
    void tokensAreLongRandomAndUrlSafe() {
        String first = Tokens.generate();
        String second = Tokens.generate();

        assertThat(first).hasSize(43).matches("[A-Za-z0-9_-]+");
        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void hashIsStableAndNeverTheTokenItself() {
        String token = Tokens.generate();

        assertThat(Tokens.hash(token)).isEqualTo(Tokens.hash(token)).hasSize(64).isNotEqualTo(token);
    }
}
