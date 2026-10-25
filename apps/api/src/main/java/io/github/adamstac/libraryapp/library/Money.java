package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Currency;
import java.util.Locale;

/**
 * Prices (ADR 0007): an amount in the currency's minor units (pence, fils, cents) with its ISO 4217 code. Never
 * converted between currencies. Amounts arrive and leave as decimal text ("95.00", "1.250"), so nothing is lost
 * to floating point.
 */
final class Money {

    /** The most a single book can cost in any currency, in major units. */
    static final BigDecimal MAX_AMOUNT = new BigDecimal("1000000000");

    private Money() {}

    /** An ISO 4217 code with a fixed number of decimal places, in capitals; null when blank. */
    static String currency(String field, String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String code = value.strip().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z]{3}")) {
            throw new FieldValidationException(field, "invalid_currency");
        }
        try {
            if (Currency.getInstance(code).getDefaultFractionDigits() < 0) {
                throw new FieldValidationException(field, "invalid_currency"); // e.g. gold (XAU): not money for books
            }
        } catch (IllegalArgumentException unknown) {
            throw new FieldValidationException(field, "invalid_currency");
        }
        return code;
    }

    /**
     * The amount in minor units: 95.5 GBP is 9550. Refused when negative, too large, or more precise than the
     * currency allows (95.555 GBP). The checks run in an order that stays cheap for any number, however extreme.
     */
    static long minorUnits(String field, BigDecimal amount, String currency) {
        int digits = Currency.getInstance(currency).getDefaultFractionDigits();
        if (amount.signum() < 0 || amount.compareTo(MAX_AMOUNT) > 0 || amount.stripTrailingZeros().scale() > digits) {
            throw new FieldValidationException(field, "invalid_amount");
        }
        return amount.movePointRight(digits).longValueExact();
    }

    /** Minor units back to decimal text with the currency's decimal places: 9550 GBP is "95.50". */
    static String amount(long minorUnits, String currency) {
        int digits = Currency.getInstance(currency).getDefaultFractionDigits();
        return new BigDecimal(BigInteger.valueOf(minorUnits), digits).toPlainString();
    }
}
