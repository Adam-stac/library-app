package io.github.adamstac.libraryapp.places;

import io.github.adamstac.libraryapp.ConflictException;
import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.ForbiddenException;
import io.github.adamstac.libraryapp.NotFoundException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.places.PlaceController.PlaceInput;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Array;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.core.support.AbstractSqlTypeValue;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The shared starter list of places, which everyone can see and nobody can change through the API, and each user's
 * own places. Every query includes the owner's ID: someone else's place is "not found", exactly like one that
 * doesn't exist (ADR 0006).
 */
@Service
class PlaceService implements Places {

    static final int MAX_PLACES_PER_ACCOUNT = 2000;
    static final int MAX_NAME = 200;
    static final int MAX_OTHER_NAMES = 10;
    static final int MAX_COUNTRY = 100;

    public record Place(
            UUID id,
            String nameAr,
            String nameEn,
            List<String> otherNames,
            String countryAr,
            String countryEn,
            Double latitude,
            Double longitude,
            boolean shared,
            int version,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {}

    /** One row of the list. {@code shared} places are on the starter list and can't be changed. */
    public record PlaceSummary(
            UUID id, String nameAr, String nameEn, String countryAr, String countryEn, boolean shared) {}

    public record Page(List<PlaceSummary> items, int page, int size, long total) {}

    /** Which places a list shows: everything the user can use, only their own, or only the shared list. */
    enum Scope {
        ALL("(owner_id = :owner OR owner_id IS NULL)"),
        MINE("owner_id = :owner"),
        SHARED("owner_id IS NULL");

        private final String condition;

        Scope(String condition) {
            this.condition = condition;
        }
    }

    /** Input that has passed every rule, ready to store. */
    private record Fields(
            String nameAr,
            String nameEn,
            List<String> otherNames,
            String countryAr,
            String countryEn,
            BigDecimal latitude,
            BigDecimal longitude) {}

    private static final String VISIBLE = "(owner_id = :owner OR owner_id IS NULL)";
    private static final String COLUMNS = """
            id, name_ar, name_en, other_names, country_ar, country_en, latitude, longitude,
            owner_id IS NULL AS shared, version, created_at, updated_at
            """;

    private final JdbcClient jdbc;
    private final List<PlaceReferences> references;

    PlaceService(JdbcClient jdbc, List<PlaceReferences> references) {
        this.jdbc = jdbc;
        this.references = references;
    }

    // ---- For other modules (Places) ----------------------------------------------------------------------------

    @Override
    public boolean usableBy(UUID ownerId, UUID placeId) {
        // FOR KEY SHARE: the place can't be deleted until the caller's transaction ends (many callers can hold it)
        return jdbc.sql("SELECT id FROM places WHERE id = :id AND " + VISIBLE + " FOR KEY SHARE")
                .param("id", placeId)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
    }

    @Override
    public Map<UUID, PlaceName> names(UUID ownerId, Collection<UUID> placeIds) {
        if (placeIds.isEmpty()) {
            return Map.of();
        }
        return jdbc.sql("SELECT id, name_ar, name_en FROM places WHERE id IN (:ids) AND " + VISIBLE)
                .param("ids", List.copyOf(placeIds))
                .param("owner", ownerId)
                .query((rs, rowNum) -> new PlaceName(
                        rs.getObject("id", UUID.class), rs.getString("name_ar"), rs.getString("name_en")))
                .list()
                .stream()
                .collect(Collectors.toMap(PlaceName::id, name -> name));
    }

    // ---- Reading -----------------------------------------------------------------------------------------------

    /** A page of places, sorted by the Arabic or the English name (falling back to the other). */
    Page list(UUID ownerId, Scope scope, int page, int size, boolean arabicFirst) {
        long total = jdbc.sql("SELECT count(*) FROM places WHERE " + scope.condition)
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        String order = arabicFirst
                ? "lower(coalesce(name_ar, name_en)), lower(coalesce(name_en, name_ar)), id"
                : "lower(coalesce(name_en, name_ar)), lower(coalesce(name_ar, name_en)), id";
        List<PlaceSummary> items = jdbc.sql("""
                        SELECT id, name_ar, name_en, country_ar, country_en, owner_id IS NULL AS shared
                        FROM places WHERE %s
                        ORDER BY %s
                        LIMIT :limit OFFSET :offset
                        """.formatted(scope.condition, order)) // fixed strings from this class, never user input
                .param("owner", ownerId)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query((rs, rowNum) -> new PlaceSummary(
                        rs.getObject("id", UUID.class),
                        rs.getString("name_ar"),
                        rs.getString("name_en"),
                        rs.getString("country_ar"),
                        rs.getString("country_en"),
                        rs.getBoolean("shared")))
                .list();
        return new Page(items, page, size, total);
    }

    Place get(UUID ownerId, UUID id) {
        return find(ownerId, id).orElseThrow(NotFoundException::new);
    }

    private Optional<Place> find(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT " + COLUMNS + " FROM places WHERE id = :id AND " + VISIBLE)
                .param("id", id)
                .param("owner", ownerId)
                .query(PlaceService::place)
                .optional();
    }

    /** Empty when the user can't see the place; true when it is on the shared list; false when it is theirs. */
    private Optional<Boolean> visibility(UUID ownerId, UUID id) {
        return jdbc.sql("SELECT owner_id IS NULL FROM places WHERE id = :id AND " + VISIBLE)
                .param("id", id)
                .param("owner", ownerId)
                .query(Boolean.class)
                .optional();
    }

    // ---- Changing (only the user's own places) -----------------------------------------------------------------

    @Transactional
    Place create(UUID ownerId, PlaceInput input) {
        Fields fields = validate(input);
        // One add at a time per account, so two requests at once can't both squeeze under the limit
        // (held until the transaction ends; the function returns nothing, so the row is ignored)
        jdbc.sql("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))")
                .param("key", "places:" + ownerId)
                .query()
                .listOfRows();
        long count = jdbc.sql("SELECT count(*) FROM places WHERE owner_id = :owner")
                .param("owner", ownerId)
                .query(Long.class)
                .single();
        if (count >= MAX_PLACES_PER_ACCOUNT) {
            throw new ConflictException("limit_reached");
        }
        UUID id = UUID.randomUUID();
        bind(jdbc.sql("""
                        INSERT INTO places (id, owner_id, name_ar, name_en, other_names, country_ar, country_en,
                                            latitude, longitude)
                        VALUES (:id, :owner, :nameAr, :nameEn, :otherNames, :countryAr, :countryEn,
                                :latitude, :longitude)
                        """), fields)
                .param("id", id)
                .param("owner", ownerId)
                .update();
        return get(ownerId, id);
    }

    /** Saves an edit, but only if nobody has changed the place since {@code expectedVersion} was read. */
    @Transactional
    Place update(UUID ownerId, UUID id, int expectedVersion, PlaceInput input) {
        Fields fields = validate(input);
        int changed = bind(jdbc.sql("""
                        UPDATE places SET name_ar = :nameAr, name_en = :nameEn, other_names = :otherNames,
                               country_ar = :countryAr, country_en = :countryEn,
                               latitude = :latitude, longitude = :longitude,
                               version = version + 1, updated_at = now()
                        WHERE id = :id AND owner_id = :owner AND version = :version
                        """), fields)
                .param("id", id)
                .param("owner", ownerId)
                .param("version", expectedVersion)
                .update();
        if (changed == 0) {
            boolean shared = visibility(ownerId, id).orElseThrow(NotFoundException::new);
            throw shared ? new ForbiddenException("read_only") : new ConflictException("stale_version");
        }
        return get(ownerId, id);
    }

    /** Deletes one of the user's places, unless one of their records still refers to it (409 in_use). */
    @Transactional
    void delete(UUID ownerId, UUID id) {
        boolean shared = visibility(ownerId, id).orElseThrow(NotFoundException::new);
        if (shared) {
            throw new ForbiddenException("read_only");
        }
        // Waits for any transaction that is linking a record to this place (Places.usableBy), so the count
        // below includes it
        boolean stillThere = jdbc.sql("SELECT id FROM places WHERE id = :id AND owner_id = :owner FOR UPDATE")
                .param("id", id)
                .param("owner", ownerId)
                .query(UUID.class)
                .optional()
                .isPresent();
        if (!stillThere) {
            throw new NotFoundException();
        }
        Map<String, Long> usedBy = new LinkedHashMap<>();
        for (PlaceReferences reference : references) {
            long count = reference.countUsing(ownerId, id);
            if (count > 0) {
                usedBy.put(reference.kind(), count);
            }
        }
        if (!usedBy.isEmpty()) {
            throw new ConflictException("in_use", Map.<String, Object>of("usedBy", usedBy));
        }
        try {
            jdbc.sql("DELETE FROM places WHERE id = :id AND owner_id = :owner")
                    .param("id", id)
                    .param("owner", ownerId)
                    .update();
        } catch (DataIntegrityViolationException stillReferenced) {
            // The database's own check (a foreign key); the lock above means this shouldn't happen
            throw new ConflictException("in_use");
        }
    }

    // ---- Rules -------------------------------------------------------------------------------------------------

    private static Fields validate(PlaceInput input) {
        String nameAr = TextInput.line("nameAr", input.nameAr(), MAX_NAME);
        String nameEn = TextInput.line("nameEn", input.nameEn(), MAX_NAME);
        if (nameAr == null && nameEn == null) {
            throw new FieldValidationException("nameAr", "name_required");
        }
        Double latitude = input.latitude();
        Double longitude = input.longitude();
        if ((latitude == null) != (longitude == null)) {
            throw new FieldValidationException(latitude == null ? "latitude" : "longitude", "coordinates_incomplete");
        }
        return new Fields(
                nameAr,
                nameEn,
                otherNames(input.otherNames()),
                TextInput.line("countryAr", input.countryAr(), MAX_COUNTRY),
                TextInput.line("countryEn", input.countryEn(), MAX_COUNTRY),
                coordinate("latitude", latitude, 90),
                coordinate("longitude", longitude, 180));
    }

    /** Blank names are dropped, and a name given twice is kept once, in the order given. */
    private static List<String> otherNames(List<String> values) {
        if (values == null) {
            return List.of();
        }
        if (values.size() > MAX_OTHER_NAMES) {
            throw new FieldValidationException("otherNames", "too_many");
        }
        LinkedHashSet<String> names = new LinkedHashSet<>();
        for (String value : values) {
            String name = TextInput.line("otherNames", value, MAX_NAME);
            if (name != null) {
                names.add(name);
            }
        }
        return List.copyOf(names);
    }

    /** Degrees, rounded to 5 decimal places (about a metre), which is as precise as the database keeps them. */
    private static BigDecimal coordinate(String field, Double degrees, int limit) {
        if (degrees == null) {
            return null;
        }
        if (!Double.isFinite(degrees) || degrees < -limit || degrees > limit) {
            throw new FieldValidationException(field, "invalid_coordinate");
        }
        return BigDecimal.valueOf(degrees).setScale(5, RoundingMode.HALF_UP);
    }

    // ---- Mapping -----------------------------------------------------------------------------------------------

    private static JdbcClient.StatementSpec bind(JdbcClient.StatementSpec statement, Fields fields) {
        return statement
                .param("nameAr", fields.nameAr(), Types.VARCHAR)
                .param("nameEn", fields.nameEn(), Types.VARCHAR)
                .param("otherNames", textArray(fields.otherNames()))
                .param("countryAr", fields.countryAr(), Types.VARCHAR)
                .param("countryEn", fields.countryEn(), Types.VARCHAR)
                .param("latitude", fields.latitude(), Types.NUMERIC)
                .param("longitude", fields.longitude(), Types.NUMERIC);
    }

    /** A Postgres text[] (a plain Java array or list would be expanded into separate parameters). */
    private static AbstractSqlTypeValue textArray(List<String> values) {
        return new AbstractSqlTypeValue() {
            @Override
            protected Array createTypeValue(Connection connection, int sqlType, String typeName) throws SQLException {
                return connection.createArrayOf("text", values.toArray(String[]::new));
            }
        };
    }

    private static Place place(ResultSet rs, int rowNum) throws SQLException {
        return new Place(
                rs.getObject("id", UUID.class),
                rs.getString("name_ar"),
                rs.getString("name_en"),
                List.of((String[]) rs.getArray("other_names").getArray()),
                rs.getString("country_ar"),
                rs.getString("country_en"),
                degrees(rs.getBigDecimal("latitude")),
                degrees(rs.getBigDecimal("longitude")),
                rs.getBoolean("shared"),
                rs.getInt("version"),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class));
    }

    private static Double degrees(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }
}
