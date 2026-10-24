package io.github.adamstac.libraryapp.users;

/**
 * Turns a browser's User-Agent header into a short description people recognise, like "Chrome on Windows".
 * Only this description is stored, not the raw header (data minimisation). It's informative, not proof:
 * the header is easy to fake.
 */
final class Devices {

    static final String UNKNOWN = "Unknown device";

    private Devices() {}

    static String describe(String userAgent) {
        if (userAgent == null || userAgent.isBlank()) {
            return UNKNOWN;
        }
        String browser = browser(userAgent);
        String system = system(userAgent);
        if (browser == null && system == null) {
            return UNKNOWN;
        }
        if (browser == null) {
            return system;
        }
        return system == null ? browser : browser + " on " + system;
    }

    private static String browser(String ua) {
        // Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari"
        if (ua.contains("Edg/")) return "Edge";
        if (ua.contains("OPR/") || ua.contains("Opera")) return "Opera";
        if (ua.contains("SamsungBrowser/")) return "Samsung Internet";
        if (ua.contains("Firefox/") || ua.contains("FxiOS/")) return "Firefox";
        if (ua.contains("Chrome/") || ua.contains("CriOS/")) return "Chrome";
        if (ua.contains("Safari/")) return "Safari";
        return null;
    }

    private static String system(String ua) {
        if (ua.contains("iPhone")) return "iPhone";
        if (ua.contains("iPad")) return "iPad";
        if (ua.contains("Android")) return "Android";
        if (ua.contains("Windows")) return "Windows";
        if (ua.contains("Mac OS X") || ua.contains("Macintosh")) return "Mac";
        if (ua.contains("CrOS")) return "ChromeOS";
        if (ua.contains("Linux")) return "Linux";
        return null;
    }
}
