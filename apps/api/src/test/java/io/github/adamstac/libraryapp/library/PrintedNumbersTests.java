package io.github.adamstac.libraryapp.library;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.adamstac.libraryapp.FieldValidationException;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** ISBNs, legal deposit numbers and prices as they are copied from a book (ADR 0006, ADR 0007). No Spring. */
class PrintedNumbersTests {

    @Test
    void isbnsAreReadInAnyDigitsAndStoredAsDigitsOnly() {
        assertThat(PrintedNumbers.isbn("978-0-306-40615-7")).isEqualTo("9780306406157");
        assertThat(PrintedNumbers.isbn("ISBN-13: 978 0 306 40615 7")).isEqualTo("9780306406157");
        assertThat(PrintedNumbers.isbn("ردمك: ٩٧٨-٠-٣٠٦-٤٠٦١٥-٧")).as("Arabic-Indic digits").isEqualTo("9780306406157");
        assertThat(PrintedNumbers.isbn("ردمك ۹۷۸۰۳۰۶۴۰۶۱۵۷")).as("Persian digits").isEqualTo("9780306406157");
        assertThat(PrintedNumbers.isbn("0-306-40615-2")).isEqualTo("0306406152");
        assertThat(PrintedNumbers.isbn("isbn 0-8044-2957-x")).as("ISBN-10 ending in X").isEqualTo("080442957X");
        assertThat(PrintedNumbers.isbn("   ")).isNull();
        assertThat(PrintedNumbers.isbn(null)).isNull();
    }

    @Test
    void anIsbnWithAWrongCheckDigitOrShapeIsRefused() {
        for (String wrong : new String[] {
            "978-0-306-40615-6", // wrong check digit
            "0-306-40615-3", // wrong check digit
            "978X306406157", // X only at the end of an ISBN-10
            "978030640615X", // never in an ISBN-13
            "12345", "97803064061577", "ISBN", "978.0.306.40615.7", "978-0-306-40615-7‮",
            "9".repeat(41)
        }) {
            assertThatThrownBy(() -> PrintedNumbers.isbn(wrong))
                    .as(wrong)
                    .isInstanceOf(FieldValidationException.class)
                    .hasMessage("isbn: invalid_isbn");
        }
    }

    @Test
    void depositNumberAcceptsOnlyItsCharacters() {
        assertThat(PrintedNumbers.legalDeposit("٢٠٠٥/١٢٣٤٥")).isEqualTo("2005/12345");
        assertThat(PrintedNumbers.legalDeposit(" 2005  /  12345 ")).isEqualTo("2005 / 12345");
        assertThat(PrintedNumbers.legalDeposit("12-34")).isEqualTo("12-34");
        assertThat(PrintedNumbers.legalDeposit("")).isNull();
        for (String wrong : new String[] {"abc", "///", "2005/12345 ب", "1".repeat(51), "12‮34", "12\n34"}) {
            assertThatThrownBy(() -> PrintedNumbers.legalDeposit(wrong))
                    .as(wrong)
                    .isInstanceOf(FieldValidationException.class)
                    .hasMessage("legalDeposit: invalid_legal_deposit");
        }
    }

    @Test
    void pricesUseTheCurrencysDecimalPlaces() {
        assertThat(Money.minorUnits("price.amount", new BigDecimal("95.5"), "GBP")).isEqualTo(9550);
        assertThat(Money.amount(9550, "GBP")).isEqualTo("95.50");
        assertThat(Money.minorUnits("price.amount", new BigDecimal("1500"), "JPY")).isEqualTo(1500);
        assertThat(Money.amount(1500, "JPY")).isEqualTo("1500");
        assertThat(Money.minorUnits("price.amount", new BigDecimal("1.250"), "KWD")).isEqualTo(1250);
        assertThat(Money.amount(1250, "KWD")).isEqualTo("1.250");
        assertThat(Money.currency("price.currency", " sar ")).isEqualTo("SAR");
        assertThat(Money.currency("price.currency", "")).isNull();
    }

    @Test
    void wrongPricesAndCurrenciesAreRefused() {
        for (String amount : new String[] {"-1", "95.555", "1000000000.01", "1e-1000000000", "1e1000000000"}) {
            assertThatThrownBy(() -> Money.minorUnits("price.amount", new BigDecimal(amount), "GBP"))
                    .as(amount)
                    .isInstanceOf(FieldValidationException.class)
                    .hasMessage("price.amount: invalid_amount");
        }
        assertThatThrownBy(() -> Money.minorUnits("price.amount", new BigDecimal("1500.5"), "JPY"))
                .hasMessage("price.amount: invalid_amount");
        for (String currency : new String[] {"ABC", "GB", "POUNDS", "XAU", "£"}) {
            assertThatThrownBy(() -> Money.currency("price.currency", currency))
                    .as(currency)
                    .isInstanceOf(FieldValidationException.class)
                    .hasMessage("price.currency: invalid_currency");
        }
    }
}
