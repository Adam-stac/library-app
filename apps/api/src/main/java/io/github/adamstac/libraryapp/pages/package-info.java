/**
 * Pages module (ADR 0011): reading a book's cover or title page from a photo, to fill the book form. The photo is
 * checked, sent only as an image to Google Cloud Vision, and kept nowhere; the lines read become suggested fields by
 * the fixed wording of Arabic title pages; readings are counted, so the limits per account and for the app hold.
 * Threat model: page-reading.
 */
package io.github.adamstac.libraryapp.pages;
