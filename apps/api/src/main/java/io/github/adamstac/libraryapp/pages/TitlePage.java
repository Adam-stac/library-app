package io.github.adamstac.libraryapp.pages;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Turns the lines read from a book's cover, title page or copyright page into the form's fields (ADR 0011, point 6), by
 * the fixed wording such pages use: «تأليف» before the author, «تحقيق» before the muhaqqiq, «دار …» for the publisher,
 * and so on. Rules, not a model: the same page always gives the same answer, and each rule can be tested. Every value
 * is the page's own text, as printed; nothing here looks anything up.
 */
final class TitlePage {

    /** A line as read: its text, how tall it was printed, and how far down the page it starts (0 is the top). */
    record Line(String text, double height, double top) {}

    /**
     * What the page says. Any field may be null. {@code authorDeathHijri} is the second year of a span such as
     * «(٩٠٢–٩٥٤هـ)» printed with the author; {@code edition} is the edition line as printed.
     */
    record Fields(
            String title,
            List<String> authors,
            Integer authorDeathHijri,
            String muhaqqiq,
            String publisher,
            String publicationPlace,
            String edition,
            Integer publishedHijri,
            Integer publishedCe,
            String isbn) {}

    private static final List<String> AUTHOR_CUES = List.of(
            "تاليف", "للامام", "للعلامة", "للحافظ", "للشيخ", "لشيخ الاسلام", "صنفه", "جمعه", "املاء", "بقلم", "المؤلف");
    private static final List<String> MUHAQQIQ_CUES = List.of(
            "دراسة وتحقيق", "تحقيق وتعليق", "تحقيق", "حققه", "اعتنى به", "عني به", "خرج احاديثه", "ضبط نصه", "ضبطه",
            "حقق اصوله");
    private static final List<String> PUBLISHER_STARTS = List.of(
            "دار ", "مكتبة ", "مكتبه ", "مؤسسة ", "مؤسسه ", "منشورات ", "المكتب الاسلامي", "المكتبة ", "شركة ");
    private static final Set<String> CITIES = Set.of(
            "بيروت", "القاهرة", "دمشق", "الرياض", "عمان", "الكويت", "جدة", "مكة المكرمة", "المدينة المنورة", "الدوحة",
            "تونس", "الرباط", "الدار البيضاء", "بغداد", "حلب", "اسطنبول", "استانبول", "الشارقة", "دبي", "ابوظبي",
            "المنامة", "صنعاء", "الجزائر", "القدس", "الاسكندرية", "الدمام", "مكة", "المدينة", "طرابلس", "نواكشوط",
            "الخرطوم", "مسقط", "فاس", "مراكش", "كراتشي", "لاهور", "ديوبند", "حيدر اباد");
    private static final Pattern HIJRI_SPAN =
            Pattern.compile("\\(?\\s*([0-9]{2,4})\\s*[-–—/]\\s*([0-9]{2,4})\\s*(?:هـ|ه)?\\s*\\)?");
    private static final Pattern DIED = Pattern.compile("(?<![\\p{L}])(?:المتوفى|المتوفي|المتوفّى|ت)\\s*(?:سنة)?\\s*\\.?\\s*([0-9]{2,4})");
    private static final Pattern HIJRI_YEAR = Pattern.compile("([0-9]{4})\\s*(?:هـ|ه)(?![\\p{L}])");
    private static final Pattern CE_YEAR = Pattern.compile("([0-9]{4})\\s*م(?![\\p{L}])");
    private static final Pattern ISBN_RUN = Pattern.compile("(97[89][0-9\\- ]{10,16}[0-9]|[0-9][0-9\\- ]{8,11}[0-9Xx])");

    private TitlePage() {}

    static Fields read(List<Line> lines) {
        List<Line> kept = lines.stream().filter(line -> !line.text().isBlank()).toList();
        int authorAt = firstWith(kept, AUTHOR_CUES);
        int muhaqqiqAt = firstWith(kept, MUHAQQIQ_CUES);
        int firstCue = minPositive(authorAt, muhaqqiqAt);

        String isbn = null;
        String publisher = null;
        String place = null;
        String edition = null;
        Integer hijri = null;
        Integer ce = null;
        for (Line line : kept) {
            String text = line.text().strip();
            String plain = plain(text);
            if (isbn == null) {
                isbn = isbnIn(text);
            }
            if (publisher == null && isPublisher(plain)) {
                publisher = text.replaceFirst("^(?:الناشر|الناشرون)\\s*[:：]?\\s*", "");
                publisher = publisher.split("\\s+[-–—|،,]\\s+")[0].strip();
            }
            if (place == null) {
                place = cityIn(plain);
            }
            if (edition == null && isEdition(plain)) {
                edition = text;
            }
            Matcher h = HIJRI_YEAR.matcher(western(text));
            if (hijri == null && h.find() && !isAuthorSpan(text)) {
                hijri = Integer.parseInt(h.group(1));
            }
            Matcher c = CE_YEAR.matcher(western(text));
            if (ce == null && c.find()) {
                ce = Integer.parseInt(c.group(1));
            }
        }

        // The author: after the cue on its line, or on the lines that follow, up to the next cue or the dates
        List<String> authors = new ArrayList<>();
        Integer death = null;
        if (authorAt >= 0) {
            List<String> parts = new ArrayList<>();
            String rest = afterCue(kept.get(authorAt).text(), AUTHOR_CUES);
            if (letters(rest) >= 3) {
                parts.add(rest);
            }
            for (int i = authorAt + 1; i < kept.size() && parts.size() < 3; i++) {
                String text = kept.get(i).text().strip();
                if (i == muhaqqiqAt || cueAt(text) || isPublisher(plain(text)) || isEdition(plain(text))) {
                    break;
                }
                Integer year = deathIn(text);
                if (year != null) {
                    death = year;
                    String before = withoutDates(text);
                    if (letters(before) >= 3) {
                        parts.add(before);
                    }
                    break;
                }
                parts.add(text);
            }
            if (death == null && !parts.isEmpty()) {
                // The dates on the author's own line: «للإمام … العسقلاني (ت ٨٥٢هـ)»
                String last = parts.get(parts.size() - 1);
                death = deathIn(last);
                if (death != null) {
                    parts.set(parts.size() - 1, withoutDates(last));
                }
            }
            String name = String.join(" ", parts).replaceAll("\\s*\\(.*?\\)\\s*", " ").strip();
            if (letters(name) >= 3) {
                authors.add(name);
            }
        }

        String muhaqqiq = null;
        if (muhaqqiqAt >= 0) {
            List<String> parts = new ArrayList<>();
            String rest = afterCue(kept.get(muhaqqiqAt).text(), MUHAQQIQ_CUES);
            if (letters(rest) >= 3) {
                parts.add(rest);
            }
            // A name often runs over two lines («أبي أنس» / «مالك بن سالم …»): up to the next cue, publisher or edition
            for (int i = muhaqqiqAt + 1; i < kept.size() && parts.size() < 2; i++) {
                String text = kept.get(i).text().strip();
                String p = plain(text);
                if (cueAt(text) || isPublisher(p) || isEdition(p) || isbnIn(text) != null || letters(text) < 3) {
                    break;
                }
                parts.add(text);
            }
            String name = String.join(" ", parts).strip();
            muhaqqiq = letters(name) >= 3 ? name : null;
        }

        String title = title(kept, firstCue);
        return new Fields(title, authors, death, muhaqqiq, publisher, place, edition, hijri, ce, isbn);
    }

    /**
     * The title: the tallest line above the first cue (the whole page if there is none), with the lines next to it
     * printed nearly as tall, as a title often runs over two lines. With no sizes known, the first line.
     */
    private static String title(List<Line> lines, int before) {
        int end = before > 0 ? before : lines.size();
        if (end == 0) {
            return null;
        }
        int tallest = 0;
        for (int i = 1; i < end; i++) {
            if (lines.get(i).height() > lines.get(tallest).height()) {
                tallest = i;
            }
        }
        double height = lines.get(tallest).height();
        // On a page with no cue, the title must stand out from the rest (a copyright page has none)
        if (before <= 0 && !(height > 0 && height >= 1.25 * medianHeight(lines))) {
            return null;
        }
        int from = tallest;
        int to = tallest;
        while (from > 0 && close(lines.get(from - 1).height(), height)) {
            from--;
        }
        while (to + 1 < end && close(lines.get(to + 1).height(), height)) {
            to++;
        }
        List<String> parts = new ArrayList<>();
        for (int i = from; i <= to; i++) {
            if (!cueAt(lines.get(i).text())) {
                parts.add(lines.get(i).text().strip());
            }
        }
        String title = String.join(" ", parts).strip();
        return letters(title) >= 2 ? title : null;
    }

    private static double medianHeight(List<Line> lines) {
        double[] heights = lines.stream().mapToDouble(Line::height).sorted().toArray();
        return heights.length == 0 ? 0 : heights[heights.length / 2];
    }

    private static boolean close(double other, double height) {
        return height > 0 && other >= height * 0.6;
    }

    private static boolean isPublisher(String plain) {
        return PUBLISHER_STARTS.stream().anyMatch(start -> plain.startsWith(plain(start)))
                || plain.startsWith("الناشر");
    }

    /** «الطبعة الأولى», «طبعة جديدة …» */
    private static boolean isEdition(String plain) {
        return plain.contains("الطبعة") || plain.startsWith("طبعة");
    }

    private static int firstWith(List<Line> lines, List<String> cues) {
        for (int i = 0; i < lines.size(); i++) {
            String plain = plain(lines.get(i).text());
            if (cues.stream().anyMatch(cue -> startsWithCue(plain, cue))) {
                return i;
            }
        }
        return -1;
    }

    private static boolean cueAt(String text) {
        String plain = plain(text);
        return AUTHOR_CUES.stream().anyMatch(cue -> startsWithCue(plain, cue))
                || MUHAQQIQ_CUES.stream().anyMatch(cue -> startsWithCue(plain, cue));
    }

    /** A cue counts at the start of a line, as a whole word */
    private static boolean startsWithCue(String plain, String cue) {
        String c = plain(cue);
        return plain.startsWith(c) && (plain.length() == c.length() || !Character.isLetter(plain.charAt(c.length())));
    }

    private static String afterCue(String text, List<String> cues) {
        String plain = plain(text);
        for (String cue : cues) {
            if (startsWithCue(plain, cue)) {
                // The cue's length in the plain text; the original may carry diacritics, so walk it letter by letter
                int letters = plain(cue).replace(" ", "").length();
                int i = 0;
                int seen = 0;
                while (i < text.length() && seen < letters) {
                    char ch = text.charAt(i);
                    if (Character.isLetter(ch) && !isMark(ch)) {
                        seen++;
                    }
                    i++;
                }
                return text.substring(i).replaceFirst("^[\\s:：\\-–—،,]+", "").strip();
            }
        }
        return text.strip();
    }

    private static Integer deathIn(String text) {
        String w = western(text);
        Matcher span = HIJRI_SPAN.matcher(w);
        if (span.find()) {
            int first = Integer.parseInt(span.group(1));
            int second = Integer.parseInt(span.group(2));
            if (second > first && second <= 1500) {
                return second;
            }
        }
        Matcher died = DIED.matcher(w);
        if (died.find()) {
            int year = Integer.parseInt(died.group(1));
            return year >= 1 && year <= 1500 ? year : null;
        }
        return null;
    }

    /** A line with the dates taken out: what is left of the author's name on it, if anything */
    private static String withoutDates(String text) {
        String w = western(text);
        w = HIJRI_SPAN.matcher(w).replaceAll(" ");
        w = Pattern.compile("(?<![\\p{L}])(?:المتوفى|المتوفي|المتوفّى)\\s*(?:سنة)?\\s*[0-9]{2,4}\\s*(?:هـ|ه)?").matcher(w).replaceAll(" ");
        w = Pattern.compile("(?<![\\p{L}])ت\\s*\\.?\\s*[0-9]{2,4}\\s*(?:هـ|ه)?").matcher(w).replaceAll(" ");
        return w.replaceAll("[()]", " ").replaceAll("\\s+", " ").strip();
    }

    private static boolean isAuthorSpan(String text) {
        Matcher span = HIJRI_SPAN.matcher(western(text));
        return span.find() && Integer.parseInt(span.group(2)) > Integer.parseInt(span.group(1));
    }

    private static String cityIn(String plain) {
        for (String city : CITIES) {
            Matcher m = Pattern.compile("(?<![\\p{L}])" + Pattern.quote(plain(city)) + "(?![\\p{L}])").matcher(plain);
            if (m.find()) {
                return city;
            }
        }
        return null;
    }

    /** The first ISBN on the line with a correct check digit, as its digits; null if none. */
    static String isbnIn(String text) {
        Matcher runs = ISBN_RUN.matcher(western(text));
        while (runs.find()) {
            String digits = runs.group(1).replaceAll("[^0-9Xx]", "").toUpperCase(Locale.ROOT);
            if (digits.length() == 13 && isbn13(digits)) {
                return digits;
            }
            if (digits.length() == 10 && isbn10(digits)) {
                return digits;
            }
        }
        return null;
    }

    private static boolean isbn13(String d) {
        if (!d.startsWith("978") && !d.startsWith("979")) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            sum += (d.charAt(i) - '0') * (i % 2 == 0 ? 1 : 3);
        }
        return (10 - sum % 10) % 10 == d.charAt(12) - '0';
    }

    private static boolean isbn10(String d) {
        int sum = 0;
        for (int i = 0; i < 10; i++) {
            char c = d.charAt(i);
            int v = c == 'X' ? 10 : c - '0';
            if (c == 'X' && i != 9) {
                return false;
            }
            sum += (10 - i) * v;
        }
        return sum % 11 == 0;
    }

    private static int letters(String text) {
        return (int) text.codePoints().filter(Character::isLetter).count();
    }

    private static int minPositive(int a, int b) {
        if (a < 0) {
            return b;
        }
        if (b < 0) {
            return a;
        }
        return Math.min(a, b);
    }

    /** Arabic-Indic and Persian digits as 0–9, for reading years and ISBNs */
    static String western(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
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

    private static boolean isMark(char c) {
        return Character.getType(c) == Character.NON_SPACING_MARK || c == 'ـ';
    }

    /** For matching cue words only: no diacritics or tatweel, alif forms as one, ta marbuta and ya kept apart */
    static String plain(String text) {
        StringBuilder out = new StringBuilder(text.length());
        for (char c : text.toCharArray()) {
            if (isMark(c)) {
                continue;
            }
            switch (c) {
                case 'أ', 'إ', 'آ', 'ٱ' -> out.append('ا');
                case 'ى' -> out.append('ي');
                default -> out.append(c);
            }
        }
        return out.toString().replaceAll("\\s+", " ").strip();
    }
}
