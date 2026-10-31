package io.github.adamstac.libraryapp.pages;

import java.util.List;

/** Reads the text on a photo of a page: the lines, in reading order, each with its printed height and place. */
interface PageReader {

    /** Whether reading is set up (an API key is configured); without it the feature is off. */
    boolean enabled();

    /** The lines read, possibly none. Throws UpstreamException ("unavailable", "timed_out") if the service fails. */
    List<TitlePage.Line> read(byte[] image);
}
