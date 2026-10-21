package io.github.adamstac.libraryapp;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;

/** Fails the build if one module reaches into another's internals (ADR 0002). */
class ModularityTests {

    private final ApplicationModules modules = ApplicationModules.of(LibraryApplication.class);

    @Test
    void moduleBoundariesAreRespected() {
        modules.verify();
    }
}
