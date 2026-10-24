package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.List;
import org.junit.jupiter.api.Test;

class RecoveryCodesTests {

    @Test
    void generatesTenDistinctReadableCodes() {
        List<String> codes = RecoveryCodes.generate();

        assertThat(codes).hasSize(RecoveryCodes.COUNT);
        assertThat(new HashSet<>(codes)).hasSize(RecoveryCodes.COUNT);
        assertThat(codes).allMatch(code -> code.matches("[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}"));
    }

    @Test
    void acceptsTheCodeHoweverItIsTyped() {
        assertThat(RecoveryCodes.normalize(" abcd-efgh-jkmn-pqrs ")).hasValue("ABCDEFGHJKMNPQRS");
        assertThat(RecoveryCodes.normalize("ABCDEFGHJKMNPQRS")).hasValue("ABCDEFGHJKMNPQRS");
        // O, I and L are read as 0, 1 and 1
        assertThat(RecoveryCodes.normalize("O0IL-0000-0000-0000")).hasValue("0011000000000000");
    }

    @Test
    void rejectsAnythingElse() {
        for (String input : new String[] {null, "", "123456", "ABCD-EFGH-JKMN", "ABCD-EFGH-JKMN-PQRS-TVWX", "ABCD-EFGH-JKMN-PQR!"}) {
            assertThat(RecoveryCodes.normalize(input)).as(String.valueOf(input)).isEmpty();
        }
    }
}
