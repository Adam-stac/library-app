package io.github.adamstac.libraryapp.reference;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.SAXException;

/**
 * Loads the International ISBN Agency's range file (its "Range Message" XML) into {@code isbn_ranges}, replacing the
 * earlier snapshot in one transaction (ADR 0010, point 4). The file is checked before anything is written: it must
 * match the checksum the administrator gives, be small, have no DTD (so no entity can be expanded or fetched), and
 * every value must have the shape the Agency documents. A file that fails any check changes nothing.
 */
@Service
class IsbnRangeImporter {

    /** The Agency's file is under 1 MB; anything far larger isn't it. */
    static final long MAX_BYTES = 10L * 1024 * 1024;

    private static final Pattern EAN = Pattern.compile("97[89]");
    private static final Pattern GROUP = Pattern.compile("(97[89])-([0-9]{1,5})");
    private static final Pattern RANGE = Pattern.compile("([0-9]{7})-([0-9]{7})");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");

    /** Why an import was refused, in words for the administrator. Nothing was written. */
    static final class Refused extends RuntimeException {
        Refused(String reason) {
            super(reason);
        }
    }

    /** What was loaded. */
    record Report(String serial, String messageDate, String sha256, int groups, int rules) {}

    private record Rule(String prefix, int from, int to, int length) {}

    private final JdbcClient jdbc;

    IsbnRangeImporter(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Checks the file against the expected SHA-256 and the rules above, then replaces the ranges with it.
     *
     * @throws Refused when any check fails; nothing has been written
     */
    @Transactional
    Report load(Path file, String expectedSha256) {
        String expected = expectedSha256 == null ? "" : expectedSha256.strip().toLowerCase(Locale.ROOT);
        if (!SHA256.matcher(expected).matches()) {
            throw new Refused("the expected SHA-256 must be 64 hexadecimal characters");
        }
        byte[] bytes = read(file);
        String actual = sha256(bytes);
        if (!actual.equals(expected)) {
            throw new Refused("the file's SHA-256 is " + actual + ", not the one given");
        }
        Document document = parse(bytes);
        Element root = document.getDocumentElement();
        if (!"ISBNRangeMessage".equals(root.getTagName())) {
            throw new Refused("this isn't an ISBN range message");
        }
        // The Agency's DTD makes the serial number optional; the date is always there
        String serial = children(root, "MessageSerialNumber").isEmpty() ? "none" : text(root, "MessageSerialNumber", 100);
        String messageDate = text(root, "MessageDate", 100);

        List<Rule> rules = new ArrayList<>();
        int groups = 0;
        for (Element ean : children(child(root, "EAN.UCCPrefixes"), "EAN.UCC")) {
            String prefix = text(ean, "Prefix", 10);
            if (!EAN.matcher(prefix).matches()) {
                throw new Refused("a prefix isn't 978 or 979: " + printable(prefix));
            }
            rules.addAll(rules(ean, prefix, 5));
        }
        for (Element group : children(child(root, "RegistrationGroups"), "Group")) {
            String prefix = text(group, "Prefix", 20);
            Matcher matcher = GROUP.matcher(prefix);
            if (!matcher.matches()) {
                throw new Refused("a group prefix isn't 978 or 979 and 1 to 5 digits: " + printable(prefix));
            }
            String digits = matcher.group(1) + matcher.group(2);
            // The publisher's code and at least one digit for the title must fit in the twelve digits before the check
            rules.addAll(rules(group, digits, 11 - digits.length()));
            groups++;
        }
        if (groups == 0 || rules.isEmpty()) {
            throw new Refused("the file holds no ranges");
        }
        checkNoOverlaps(rules);

        jdbc.sql("DELETE FROM isbn_ranges").update();
        for (Rule rule : rules) {
            jdbc.sql("INSERT INTO isbn_ranges (prefix, range_from, range_to, length)"
                            + " VALUES (:prefix, :from, :to, :length)")
                    .param("prefix", rule.prefix())
                    .param("from", rule.from())
                    .param("to", rule.to())
                    .param("length", rule.length())
                    .update();
        }
        jdbc.sql("""
                        INSERT INTO isbn_range_release (serial, message_date, sha256, group_count, rule_count)
                        VALUES (:serial, :date, :sha256, :groups, :rules)
                        ON CONFLICT (only_one) DO UPDATE SET serial = excluded.serial,
                            message_date = excluded.message_date, sha256 = excluded.sha256,
                            group_count = excluded.group_count, rule_count = excluded.rule_count, imported_at = now()""")
                .param("serial", serial)
                .param("date", messageDate)
                .param("sha256", actual)
                .param("groups", groups)
                .param("rules", rules.size())
                .update();
        return new Report(serial, messageDate, actual, groups, rules.size());
    }

    private static byte[] read(Path file) {
        try {
            if (!Files.isRegularFile(file)) {
                throw new Refused("there is no file at " + file);
            }
            if (Files.size(file) > MAX_BYTES) {
                throw new Refused("the file is larger than " + MAX_BYTES / (1024 * 1024) + " MB");
            }
            try (InputStream in = Files.newInputStream(file)) {
                return in.readNBytes((int) MAX_BYTES + 1);
            }
        } catch (IOException e) {
            throw new Refused("the file couldn't be read: " + e.getClass().getSimpleName());
        }
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * Parses so that nothing in the file can reach outside it or grow inside it. The Agency's file starts with a DTD
     * that only describes its own layout ({@code <!ELEMENT ...>}), so a DTD is allowed, but one that declares an
     * entity or points to an outside file is refused before parsing, and the parser loads no outside DTD, expands no
     * outside entity and follows no XInclude.
     */
    static Document parse(byte[] bytes) {
        checkDtd(new String(bytes, StandardCharsets.UTF_8));
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            factory.setNamespaceAware(false);
            DocumentBuilder builder = factory.newDocumentBuilder();
            builder.setErrorHandler(null);
            return builder.parse(new ByteArrayInputStream(bytes));
        } catch (SAXException e) {
            throw new Refused("the file isn't well-formed XML");
        } catch (IOException | ParserConfigurationException e) {
            throw new Refused("the file couldn't be parsed: " + e.getClass().getSimpleName());
        }
    }

    /**
     * Allows at most one DTD, held inside the file, that declares only elements and attributes: no entities (which can
     * be expanded into gigabytes or read files), no parameter entities, and no outside DTD.
     */
    static void checkDtd(String xml) {
        if (xml.contains("<!ENTITY")) {
            throw new Refused("the file declares an entity");
        }
        int start = xml.indexOf("<!DOCTYPE");
        if (start < 0) {
            return;
        }
        if (xml.indexOf("<!DOCTYPE", start + 1) >= 0) {
            throw new Refused("the file has more than one DTD");
        }
        int close = xml.indexOf('>', start);
        int open = xml.indexOf('[', start);
        boolean inside = open >= 0 && (close < 0 || open < close);
        String head = xml.substring(start, inside ? open : Math.max(close, start));
        if (head.contains("SYSTEM") || head.contains("PUBLIC")) {
            throw new Refused("the file's DTD points to an outside file");
        }
        if (inside) {
            int end = xml.indexOf("]>", open);
            if (end < 0 || xml.substring(open, end).contains("%")) {
                throw new Refused("the file's DTD is unfinished or uses parameter entities");
            }
        }
    }

    /** The rules under an element. A publisher's code may be at most {@code maxLength} digits. */
    private static List<Rule> rules(Element parent, String prefix, int maxLength) {
        List<Rule> rules = new ArrayList<>();
        for (Element rule : children(child(parent, "Rules"), "Rule")) {
            Matcher range = RANGE.matcher(text(rule, "Range", 20));
            if (!range.matches()) {
                throw new Refused("a range under " + prefix + " isn't two seven-digit numbers");
            }
            int from = Integer.parseInt(range.group(1));
            int to = Integer.parseInt(range.group(2));
            String lengthText = text(rule, "Length", 2);
            if (!lengthText.matches("[0-7]")) {
                throw new Refused("a length under " + prefix + " isn't 0 to 7");
            }
            int length = Integer.parseInt(lengthText);
            if (from > to || length > maxLength) {
                throw new Refused("a rule under " + prefix + " is out of order or too long");
            }
            rules.add(new Rule(prefix, from, to, length));
        }
        return rules;
    }

    private static void checkNoOverlaps(List<Rule> rules) {
        List<Rule> sorted = new ArrayList<>(rules);
        sorted.sort((a, b) -> a.prefix().equals(b.prefix())
                ? Integer.compare(a.from(), b.from())
                : a.prefix().compareTo(b.prefix()));
        for (int i = 1; i < sorted.size(); i++) {
            Rule before = sorted.get(i - 1);
            Rule rule = sorted.get(i);
            if (before.prefix().equals(rule.prefix()) && rule.from() <= before.to()) {
                throw new Refused("two ranges under " + rule.prefix() + " overlap, or a group is listed twice");
            }
        }
    }

    private static Element child(Element parent, String name) {
        List<Element> found = children(parent, name);
        if (found.size() != 1) {
            throw new Refused("expected one <" + name + "> under <" + parent.getTagName() + ">");
        }
        return found.getFirst();
    }

    private static List<Element> children(Element parent, String name) {
        List<Element> found = new ArrayList<>();
        NodeList nodes = parent.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            if (node instanceof Element element && name.equals(element.getTagName())) {
                found.add(element);
            }
        }
        return found;
    }

    /** An element's text, trimmed: present, printable, and no longer than the limit. */
    private static String text(Element parent, String name, int maxLength) {
        String value = child(parent, name).getTextContent().strip();
        if (value.isEmpty() || value.length() > maxLength || value.codePoints().anyMatch(IsbnRangeImporter::control)) {
            throw new Refused("<" + name + "> is empty, too long, or holds control characters");
        }
        return value;
    }

    /** The text with anything that isn't a printable character replaced, so a message never carries control codes. */
    private static String printable(String value) {
        StringBuilder out = new StringBuilder();
        value.codePoints().limit(40).forEach(c -> out.appendCodePoint(control(c) ? '?' : c));
        return out.toString();
    }

    /** Control characters and invisible formatting ones, such as direction marks. */
    private static boolean control(int codePoint) {
        return Character.isISOControl(codePoint) || Character.getType(codePoint) == Character.FORMAT;
    }
}
