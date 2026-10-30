package io.github.adamstac.libraryapp.reference;

import io.github.adamstac.libraryapp.TextInput;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Loads the scholars and works snapshot that ships with the API (ADR 0010, point 4, as amended for CC0 data in L3).
 * The snapshot is made by tools/wikidata/scholars_snapshot.py from Wikidata, which is CC0, so it can live in this
 * public repository. Its SHA-256 is pinned below: a snapshot that doesn't match is refused, so what loads is exactly
 * what was reviewed in the pull request that changed it. Every value is checked again as it loads, like reader input;
 * a bad value is dropped with the rest kept. The whole snapshot replaces the earlier one in one transaction, only when
 * the checksum differs from the one loaded, and two servers starting together take turns.
 */
@Service
class WikidataScholars {

    /** The checksum of reference/wikidata-scholars.json.gz, printed by the script that makes it. */
    static final String SHA256 = "713ecae72763f51c9391f5cec0b909604debb4f49b2f3171f4676e46ba827874";

    static final String RESOURCE = "reference/wikidata-scholars.json.gz";
    static final String SOURCE = "wikidata-scholars";

    /** The snapshot is a few megabytes; anything far larger, unpacked, isn't it. */
    static final int MAX_UNPACKED_BYTES = 64 * 1024 * 1024;

    static final int MAX_NAME = 300;
    static final int MAX_TITLE = 500;
    static final int MAX_AUTHORS = 20;
    static final int MAX_SEARCH_TEXT = 6000;

    private static final Pattern QID = Pattern.compile("Q[1-9][0-9]{0,11}");
    private static final Logger log = LoggerFactory.getLogger(WikidataScholars.class);

    record Snapshot(
            String source,
            String licence,
            String retrieved,
            String selection,
            List<ScholarEntry> scholars,
            List<WorkEntry> works) {}

    record ScholarEntry(String id, String ar, String en, Integer deathCe, Integer deathHijri) {}

    record WorkEntry(String id, String ar, String en, List<String> authors) {}

    /** What a load did: whether anything changed, and what was kept and dropped. */
    record Loaded(boolean changed, int scholars, int works, int dropped) {}

    /** Why a snapshot was refused. Nothing was written. */
    static final class Refused extends RuntimeException {
        Refused(String reason) {
            super(reason);
        }
    }

    private final JdbcClient jdbc;
    private final JdbcTemplate batch;
    private final JsonMapper json;

    WikidataScholars(JdbcClient jdbc, JdbcTemplate batch, JsonMapper json) {
        this.jdbc = jdbc;
        this.batch = batch;
        this.json = json;
    }

    /** The snapshot that ships with the API, after checking it is the one pinned in the code. */
    static byte[] bundled() {
        byte[] bytes;
        try (InputStream in = new ClassPathResource(RESOURCE).getInputStream()) {
            bytes = in.readAllBytes();
        } catch (IOException e) {
            throw new Refused("the snapshot that ships with the API can't be read");
        }
        String actual = IsbnRangeImporter.sha256(bytes);
        if (!actual.equals(SHA256)) {
            throw new Refused("the snapshot's SHA-256 is " + actual + ", not the one pinned in WikidataScholars");
        }
        return bytes;
    }

    /**
     * Loads this snapshot unless one with the same checksum is already loaded.
     *
     * @throws Refused when it can't be unpacked or read; nothing has been written
     */
    @Transactional
    Loaded load(byte[] gzipped) {
        String sha256 = IsbnRangeImporter.sha256(gzipped);
        // Two servers starting at once: the second waits here, then finds the snapshot already loaded
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtext('reference:' || :source))").param("source", SOURCE).query().singleRow();
        List<String> loaded = jdbc.sql("SELECT sha256 FROM reference_release WHERE source = :source")
                .param("source", SOURCE)
                .query(String.class)
                .list();
        if (loaded.contains(sha256)) {
            return new Loaded(false, 0, 0, 0);
        }
        Snapshot snapshot = read(gzipped);
        LocalDate retrieved = date(snapshot.retrieved());
        int dropped = 0;

        Map<String, ScholarEntry> scholars = new HashMap<>();
        for (ScholarEntry entry : list(snapshot.scholars())) {
            String nameAr = line(entry == null ? null : entry.ar(), MAX_NAME);
            String nameEn = line(entry == null ? null : entry.en(), MAX_NAME);
            if (entry == null || !qid(entry.id()) || (nameAr == null && nameEn == null) || scholars.containsKey(entry.id())) {
                dropped++;
                continue;
            }
            Integer ce = entry.deathCe() != null && entry.deathCe() >= -1500 && entry.deathCe() <= 2100 && entry.deathCe() != 0
                    ? entry.deathCe()
                    : null;
            Integer hijri = entry.deathHijri() != null && entry.deathHijri() >= 1 && entry.deathHijri() <= 1500
                    ? entry.deathHijri()
                    : null;
            scholars.put(entry.id(), new ScholarEntry(entry.id(), nameAr, nameEn, ce, hijri));
        }

        List<Object[]> workRows = new ArrayList<>();
        List<Object[]> authorRows = new ArrayList<>();
        Set<String> works = new HashSet<>();
        for (WorkEntry entry : list(snapshot.works())) {
            String titleAr = line(entry == null ? null : entry.ar(), MAX_TITLE);
            if (entry == null || !qid(entry.id()) || titleAr == null || works.contains(entry.id())) {
                dropped++;
                continue;
            }
            String titleEn = line(entry.en(), MAX_TITLE);
            Set<String> authorIds = new LinkedHashSet<>();
            for (String author : list(entry.authors())) {
                if (author != null && scholars.containsKey(author) && authorIds.size() < MAX_AUTHORS) {
                    authorIds.add(author);
                }
            }
            if (authorIds.isEmpty()) {
                dropped++;
                continue;
            }
            StringBuilder searchText = new StringBuilder(titleAr);
            if (titleEn != null) {
                searchText.append(' ').append(titleEn);
            }
            int position = 1;
            for (String author : authorIds) {
                ScholarEntry scholar = scholars.get(author);
                for (String name : new String[] {scholar.ar(), scholar.en()}) {
                    if (name != null && searchText.length() + name.length() < MAX_SEARCH_TEXT) {
                        searchText.append(' ').append(name);
                    }
                }
                authorRows.add(new Object[] {entry.id(), author, position++});
            }
            works.add(entry.id());
            workRows.add(new Object[] {entry.id(), titleAr, titleEn, searchText.toString()});
        }

        jdbc.sql("DELETE FROM reference_work_authors").update();
        jdbc.sql("DELETE FROM reference_works").update();
        jdbc.sql("DELETE FROM reference_scholars").update();
        batch.batchUpdate(
                "INSERT INTO reference_scholars (id, name_ar, name_en, death_year_ce, death_year_hijri) VALUES (?, ?, ?, ?, ?)",
                scholars.values().stream()
                        .map(s -> new Object[] {s.id(), s.ar(), s.en(), s.deathCe(), s.deathHijri()})
                        .toList());
        batch.batchUpdate(
                "INSERT INTO reference_works (id, title_ar, title_en, search_text) VALUES (?, ?, ?, ?)", workRows);
        batch.batchUpdate(
                "INSERT INTO reference_work_authors (work_id, scholar_id, position) VALUES (?, ?, ?)", authorRows);
        // Fresh statistics, so searches plan well from the first one
        jdbc.sql("ANALYZE reference_scholars, reference_works, reference_work_authors").update();
        jdbc.sql("""
                        INSERT INTO reference_release (source, retrieved, sha256, scholars, works)
                        VALUES (:source, :retrieved, :sha256, :scholars, :works)
                        ON CONFLICT (source) DO UPDATE SET retrieved = excluded.retrieved, sha256 = excluded.sha256,
                            scholars = excluded.scholars, works = excluded.works, loaded_at = now()""")
                .param("source", SOURCE)
                .param("retrieved", retrieved)
                .param("sha256", sha256)
                .param("scholars", scholars.size())
                .param("works", workRows.size())
                .update();
        log.info("Scholars loaded from Wikidata (retrieved {}): {} scholars, {} works, {} entries dropped",
                retrieved, scholars.size(), workRows.size(), dropped);
        return new Loaded(true, scholars.size(), workRows.size(), dropped);
    }

    private Snapshot read(byte[] gzipped) {
        byte[] unpacked;
        try (InputStream in = new GZIPInputStream(new ByteArrayInputStream(gzipped))) {
            unpacked = in.readNBytes(MAX_UNPACKED_BYTES + 1);
        } catch (IOException e) {
            throw new Refused("the snapshot isn't a gzip file");
        }
        if (unpacked.length > MAX_UNPACKED_BYTES) {
            throw new Refused("the snapshot unpacks to more than " + MAX_UNPACKED_BYTES / (1024 * 1024) + " MB");
        }
        try {
            Snapshot snapshot = json.readValue(unpacked, Snapshot.class);
            if (snapshot == null) {
                throw new Refused("the snapshot is empty");
            }
            return snapshot;
        } catch (RuntimeException e) {
            if (e instanceof Refused refused) {
                throw refused;
            }
            throw new Refused("the snapshot isn't the expected JSON");
        }
    }

    private static LocalDate date(String text) {
        try {
            return LocalDate.parse(text);
        } catch (RuntimeException e) {
            throw new Refused("the snapshot's retrieval date isn't a date");
        }
    }

    private static boolean qid(String id) {
        return id != null && QID.matcher(id).matches();
    }

    /** A name or title checked like reader input (NFC, no control or direction characters, length); null if not. */
    private static String line(String value, int maxLength) {
        try {
            return TextInput.line("value", value, maxLength);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static <T> List<T> list(List<T> values) {
        return values == null ? List.of() : values;
    }
}
