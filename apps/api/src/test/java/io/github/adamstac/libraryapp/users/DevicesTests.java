package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class DevicesTests {

    static final String CHROME_WINDOWS =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
    static final String FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0";

    @Test
    void describesCommonBrowsersInPlainWords() {
        assertThat(Devices.describe(CHROME_WINDOWS)).isEqualTo("Chrome on Windows");
        assertThat(Devices.describe(FIREFOX_LINUX)).isEqualTo("Firefox on Linux");
        assertThat(Devices.describe(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"))
                .isEqualTo("Edge on Windows");
        assertThat(Devices.describe(
                        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"))
                .isEqualTo("Safari on iPhone");
        assertThat(Devices.describe(
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15"))
                .isEqualTo("Safari on Mac");
        assertThat(Devices.describe(
                        "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36"))
                .isEqualTo("Chrome on Android");
    }

    @Test
    void anythingElseIsAnUnknownDevice() {
        assertThat(Devices.describe(null)).isEqualTo(Devices.UNKNOWN);
        assertThat(Devices.describe("")).isEqualTo(Devices.UNKNOWN);
        assertThat(Devices.describe("Java-http-client/25")).isEqualTo(Devices.UNKNOWN);
        assertThat(Devices.describe("<script>alert(1)</script>")).isEqualTo(Devices.UNKNOWN);
    }
}
