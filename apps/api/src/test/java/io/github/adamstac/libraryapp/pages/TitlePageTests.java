package io.github.adamstac.libraryapp.pages;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.adamstac.libraryapp.pages.TitlePage.Fields;
import io.github.adamstac.libraryapp.pages.TitlePage.Line;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * How the lines of a cover, title page or copyright page become fields (ADR 0011, point 6). Each case is a real page's
 * wording; a page that reads wrongly later is added here with its text, then the rule is fixed.
 */
class TitlePageTests {

    @Test
    void theMutammimasCover() {
        Fields page = TitlePage.read(List.of(
                new Line("مُتَمِّمَةُ الآجُرُّومِيَّة", 60, 100),
                new Line("في علم العربية", 40, 170),
                new Line("تأليف", 14, 230),
                new Line("العلامة شمس الدين أبي عبد الله محمد بن محمد بن عبد الرحمن الرعيني المالكي", 14, 250),
                new Line("الشهير بالحطاب", 14, 270),
                new Line("(٩٠٢ - ٩٥٤هـ)", 12, 290),
                new Line("تحقيق وتعليق", 12, 330),
                new Line("أبي أنس", 14, 350),
                new Line("مالك بن سالم بن مطر المهذري", 14, 370),
                new Line("طبعة جديدة مقابلة على عدة نسخ خطية", 11, 410),
                new Line("دار الإمام البخاري", 16, 470)));

        assertThat(page.title()).isEqualTo("مُتَمِّمَةُ الآجُرُّومِيَّة في علم العربية");
        assertThat(page.authors()).containsExactly(
                "العلامة شمس الدين أبي عبد الله محمد بن محمد بن عبد الرحمن الرعيني المالكي الشهير بالحطاب");
        assertThat(page.authorDeathHijri()).isEqualTo(954);
        assertThat(page.muhaqqiq()).isEqualTo("أبي أنس مالك بن سالم بن مطر المهذري");
        assertThat(page.edition()).isEqualTo("طبعة جديدة مقابلة على عدة نسخ خطية");
        assertThat(page.publisher()).isEqualTo("دار الإمام البخاري");
        // The span of years is the author's life, not the year of printing
        assertThat(page.publishedHijri()).isNull();
    }

    @Test
    void aTitlePageWithTheDeathYearOnItsOwnLineAndAPlaceBesideThePublisher() {
        Fields page = TitlePage.read(List.of(
                new Line("فتح الباري", 50, 10),
                new Line("شرح صحيح البخاري", 45, 60),
                new Line("للإمام الحافظ أحمد بن علي بن حجر العسقلاني", 15, 120),
                new Line("المتوفى سنة 852 هـ", 12, 140),
                new Line("حققه: محمد فؤاد عبد الباقي", 13, 170),
                new Line("المكتبة العصرية - صيدا - بيروت", 13, 200)));

        assertThat(page.title()).isEqualTo("فتح الباري شرح صحيح البخاري");
        assertThat(page.authors()).containsExactly("الحافظ أحمد بن علي بن حجر العسقلاني");
        assertThat(page.authorDeathHijri()).isEqualTo(852);
        assertThat(page.muhaqqiq()).isEqualTo("محمد فؤاد عبد الباقي");
        assertThat(page.publisher()).isEqualTo("المكتبة العصرية");
        assertThat(page.publicationPlace()).isEqualTo("بيروت");
    }

    @Test
    void aCopyrightPageGivesTheEditionYearsAndIsbnButNoTitle() {
        Fields page = TitlePage.read(List.of(
                new Line("جميع الحقوق محفوظة", 12, 50),
                new Line("الطبعة الأولى ١٤٣٢هـ - ٢٠١١م", 12, 80),
                new Line("ردمك: 978-614-8011-43-6", 12, 110),
                new Line("دار ابن حزم - بيروت - لبنان", 12, 140)));

        assertThat(page.title()).isNull(); // nothing on it stands out as one
        assertThat(page.edition()).isEqualTo("الطبعة الأولى ١٤٣٢هـ - ٢٠١١م");
        assertThat(page.publishedHijri()).isEqualTo(1432);
        assertThat(page.publishedCe()).isEqualTo(2011);
        assertThat(page.isbn()).isEqualTo("9786148011436");
        assertThat(page.publisher()).isEqualTo("دار ابن حزم");
        assertThat(page.publicationPlace()).isEqualTo("بيروت");
        assertThat(page.authors()).isEmpty();
    }

    @Test
    void anIsbnMustHaveARightCheckDigitAndArabicDigitsAreRead() {
        assertThat(TitlePage.isbnIn("ردمك ٩٧٨-٩٩٣٣-٦٨٥-٠٢-٧")).isEqualTo("9789933685027");
        assertThat(TitlePage.isbnIn("ISBN 978-9933-685-02-8")).isNull(); // one digit off
        assertThat(TitlePage.isbnIn("هاتف 01 234 5678")).isNull();
    }

    @Test
    void aPageWithNothingRecognisableGivesNothing() {
        Fields page = TitlePage.read(List.of(new Line("بسم الله الرحمن الرحيم", 14, 10), new Line("1", 10, 900)));

        assertThat(page.authors()).isEmpty();
        assertThat(page.muhaqqiq()).isNull();
        assertThat(page.publisher()).isNull();
        assertThat(page.isbn()).isNull();
        assertThat(TitlePage.read(List.of()).title()).isNull();
    }

    @Test
    void cuesAreWholeWordsAtTheStartOfALine() {
        // «تحقيقات» isn't «تحقيق», and «تأليف» in the middle of a sentence isn't a cue
        Fields page = TitlePage.read(List.of(
                new Line("تحقيقات في اللغة", 40, 10),
                new Line("كتاب في تأليف الكتب", 14, 60)));

        assertThat(page.muhaqqiq()).isNull();
        assertThat(page.authors()).isEmpty();
    }
}
