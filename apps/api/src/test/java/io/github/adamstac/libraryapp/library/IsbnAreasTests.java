package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.library.IsbnAreas.Area;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

/** The hand-made list of ISBN country and language codes (ADR 0010, layer 1). No Spring. */
class IsbnAreasTests {

    @Test
    void everyCountryWithSeveralCodesIsKnownByEachOfThem() {
        // Older and newer codes for the same country (checked against the ISBN Agency's names, 30 October 2026)
        assertThat(countries("9789961", "9789931", "9789947", "9789969")).containsOnly("DZ");
        assertThat(countries("9789960", "978603")).containsOnly("SA");
        assertThat(countries("978977", "978633")).containsOnly("EG");
        assertThat(countries("9789953", "978614")).containsOnly("LB");
        assertThat(countries("9789954", "9789920", "9789981")).containsOnly("MA");
        assertThat(countries("97899906", "9789921", "97899966")).containsOnly("KW");
        assertThat(countries("978964", "978600", "978622", "978635")).containsOnly("IR");
    }

    @Test
    void theLanguageAreasHaveNoCountry() {
        assertThat(IsbnAreas.of("9780306406157")).hasValue(new Area("9780", null, "en"));
        assertThat(IsbnAreas.of("9782070360024")).hasValueSatisfying(area -> assertThat(area.language()).isEqualTo("fr"));
        assertThat(IsbnAreas.of("9791090636071")).hasValue(new Area("97910", "FR", "fr"));
    }

    @Test
    void areasInSeveralLanguagesAreLeftOff() {
        assertThat(IsbnAreas.of("9789690000002")).as("Pakistan").isEmpty();
        assertThat(IsbnAreas.of("9788100000000")).as("India").isEmpty();
        assertThat(IsbnAreas.of("9789936000000")).as("Afghanistan").isEmpty();
    }

    @Test
    void noCodeStartsAnotherSoEveryIsbnHasOneAreaAtMost() {
        List<String> prefixes = IsbnAreas.all().stream().map(Area::prefix).toList();
        assertThat(prefixes).doesNotHaveDuplicates();
        for (String a : prefixes) {
            for (String b : prefixes) {
                assertThat(a.equals(b) || !b.startsWith(a)).as(a + " starts " + b).isTrue();
            }
        }
    }

    @Test
    void everyEntryIsWellFormed() {
        Set<String> countries = Set.of(Locale.getISOCountries());
        Set<String> languages = Set.of(Locale.getISOLanguages());
        for (Area area : IsbnAreas.all()) {
            assertThat(area.prefix()).as(area.toString()).matches("97[89][0-9]{1,5}");
            assertThat(area.language()).as(area.toString()).isIn(languages);
            if (area.country() != null) {
                assertThat(area.country()).as(area.toString()).isIn(countries);
            }
        }
    }

    private static Set<String> countries(String... prefixes) {
        return Arrays.stream(prefixes)
                .map(prefix -> IsbnAreas.of((prefix + "0000000000000").substring(0, 13)).orElseThrow().country())
                .collect(Collectors.toSet());
    }
}
