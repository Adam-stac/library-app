package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;

/**
 * Numbers copied from a book's imprint page: an ISBN and a legal deposit number (رقم الإيداع). Arabic books often
 * print them in Arabic-Indic digits (٠–٩) or Persian digits (۰–۹); both are read as the standard digits 0–9, which
 * are the only digits stored (ADR 0006).
 */
final class PrintedNumbers {

    static final int MAX_LEGAL_DEPOSIT = 50;
    /** Long enough for any way of writing an ISBN, with a label, hyphens and spaces. */
    private static final int MAX_ISBN_INPUT = 40;

    private PrintedNumbers() {}

    /**
     * An ISBN-10 or ISBN-13 with a correct check digit, returned as its digits only (and a final X for an ISBN-10).
     * Hyphens and spaces are ignored, and so is a leading label: "ISBN", "ISBN-13" or "ردمك". Null when blank.
     */
    static String isbn(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.length() > MAX_ISBN_INPUT) {
            throw new FieldValidationException("isbn", "invalid_isbn");
        }
        String text = western(value.strip());
        text = text.replaceFirst("^(?i)(ISBN(-1[03])?|ردمك)\\s*:?\\s*", "");
        StringBuilder digits = new StringBuilder();
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '0' && c <= '9') {
                digits.append(c);
            } else if ((c == 'X' || c == 'x') && i == text.length() - 1) {
                digits.append('X');
            } else if (c != '-' && c != ' ') {
                throw new FieldValidationException("isbn", "invalid_isbn");
            }
        }
        String isbn = digits.toString();
        boolean valid = switch (isbn.length()) {
            case 10 -> isbn10CheckDigitIsRight(isbn);
            case 13 -> isbn.indexOf('X') < 0 && isbn13CheckDigitIsRight(isbn);
            default -> false;
        };
        if (!valid) {
            throw new FieldValidationException("isbn", "invalid_isbn");
        }
        return isbn;
    }

    /** A legal deposit number: digits, "/", "-" and spaces only (for example ٢٠٠٥/١٢٣٤٥). Null when blank. */
    static String legalDeposit(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String text = western(value.strip()).replaceAll(" {2,}", " ");
        if (text.length() > MAX_LEGAL_DEPOSIT || !text.matches("[0-9/ -]+") || !text.matches(".*[0-9].*")) {
            throw new FieldValidationException("legalDeposit", "invalid_legal_deposit");
        }
        return text;
    }

    /** Arabic-Indic and Persian digits become 0–9; everything else is left as it is. */
    static String western(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c >= '٠' && c <= '٩') {
                out.append((char) ('0' + (c - '٠')));
            } else if (c >= '۰' && c <= '۹') {
                out.append((char) ('0' + (c - '۰')));
            } else {
                out.append(c);
            }
        }
        return out.toString();
    }

    private static boolean isbn10CheckDigitIsRight(String isbn) {
        int sum = 0;
        for (int i = 0; i < 10; i++) {
            char c = isbn.charAt(i);
            int value = c == 'X' ? 10 : c - '0';
            sum += value * (10 - i);
        }
        return sum % 11 == 0;
    }

    private static boolean isbn13CheckDigitIsRight(String isbn) {
        int sum = 0;
        for (int i = 0; i < 13; i++) {
            sum += (isbn.charAt(i) - '0') * (i % 2 == 0 ? 1 : 3);
        }
        return sum % 10 == 0;
    }
}
