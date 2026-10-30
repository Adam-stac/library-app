package io.github.adamstac.libraryapp.reference;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Loads the scholars snapshot when the API starts, if it isn't loaded already (WikidataScholars). A snapshot that
 * doesn't match its pinned checksum stops the start: shipping the wrong data is a mistake to fix, not to run with.
 */
@Component
class WikidataScholarsStartup implements ApplicationRunner {

    private final WikidataScholars scholars;

    WikidataScholarsStartup(WikidataScholars scholars) {
        this.scholars = scholars;
    }

    @Override
    public void run(ApplicationArguments args) {
        scholars.load(WikidataScholars.bundled());
    }
}
