package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;

/** The home page's "library by science" percentages always add up to exactly 100 (ADR 0007). No Spring. */
class SharesTests {

    @Test
    void percentagesAddUpToExactly100() {
        assertThat(HomeService.percentages(new long[] {2, 1, 1})).containsExactly(50, 25, 25);
        assertThat(HomeService.percentages(new long[] {1, 1, 1})).containsExactly(34, 33, 33);
        assertThat(HomeService.percentages(new long[] {12, 8, 6, 6, 4, 2, 2})).containsExactly(30, 20, 15, 15, 10, 5, 5);
        assertThat(HomeService.percentages(new long[] {1})).containsExactly(100);
        for (long[] counts : new long[][] {{7, 7, 7, 7, 7, 7, 7}, {1, 1, 1, 1, 1, 1}, {997, 2, 1}, {1, 2, 3, 4, 5, 6}}) {
            assertThat(Arrays.stream(HomeService.percentages(counts)).sum()).as(Arrays.toString(counts)).isEqualTo(100);
        }
    }

    @Test
    void anEmptyLibraryHasNoPercentages() {
        assertThat(HomeService.percentages(new long[] {})).isEmpty();
        assertThat(HomeService.percentages(new long[] {0})).containsExactly(0);
    }
}
