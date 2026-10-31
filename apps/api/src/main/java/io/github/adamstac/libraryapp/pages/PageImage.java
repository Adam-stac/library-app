package io.github.adamstac.libraryapp.pages;

import io.github.adamstac.libraryapp.FieldValidationException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

/**
 * The photo sent to be read (ADR 0011, point 3): checked before it goes anywhere. At most 4 MB; a JPEG or PNG by its
 * first bytes, not by what the request claims; and its size in pixels read from the header alone, so a small file that
 * would unpack into a huge image is refused before anything decodes it. It is never decoded, stored or served here:
 * only passed on.
 */
final class PageImage {

    static final int MAX_BYTES = 4 * 1024 * 1024;
    static final long MAX_PIXELS = 40_000_000L; // a 12-megapixel phone photo is well inside this
    static final int MIN_SIDE = 200;

    private PageImage() {}

    /** The image, if it passes; otherwise a FieldValidationException on "image". */
    static byte[] checked(byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new FieldValidationException("image", "required");
        }
        if (bytes.length > MAX_BYTES) {
            throw new FieldValidationException("image", "too_large");
        }
        if (!isJpeg(bytes) && !isPng(bytes)) {
            throw new FieldValidationException("image", "not_an_image");
        }
        long width;
        long height;
        try (ImageInputStream input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (input == null || !readers.hasNext()) {
                throw new FieldValidationException("image", "not_an_image");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                width = reader.getWidth(0); // from the header: no pixels are decoded
                height = reader.getHeight(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            if (e instanceof FieldValidationException invalid) {
                throw invalid;
            }
            throw new FieldValidationException("image", "not_an_image");
        }
        if (width < MIN_SIDE || height < MIN_SIDE) {
            throw new FieldValidationException("image", "too_small");
        }
        if (width * height > MAX_PIXELS) {
            throw new FieldValidationException("image", "too_large");
        }
        return bytes;
    }

    private static boolean isJpeg(byte[] b) {
        return b.length > 3 && (b[0] & 0xff) == 0xFF && (b[1] & 0xff) == 0xD8 && (b[2] & 0xff) == 0xFF;
    }

    private static boolean isPng(byte[] b) {
        byte[] signature = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n'};
        if (b.length < signature.length) {
            return false;
        }
        for (int i = 0; i < signature.length; i++) {
            if (b[i] != signature[i]) {
                return false;
            }
        }
        return true;
    }
}
