package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.FieldValidationException;
import io.github.adamstac.libraryapp.TextInput;
import io.github.adamstac.libraryapp.reference.ScholarWorks;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Finding a classical work to fill in the book form (ADR 0010, layer 2, slice L3): reference data from Wikidata, the
 * same for every signed-in reader, read-only. Nothing about the reader is read or kept, and nothing leaves the app.
 */
@RestController
class ScholarWorksController {

    static final int MAX_QUERY = 100;
    static final int MAX_RESULTS = 10;

    /** The works found, best match first. */
    public record Results(List<ScholarWorks.Work> items) {}

    private final ScholarWorks works;

    ScholarWorksController(ScholarWorks works) {
        this.works = works;
    }

    /**
     * {@code q} is a title or an author's name, in Arabic or English (at most 100 characters, with at least two
     * letters or digits); {@code limit} is how many to return (at most 10).
     */
    @GetMapping("/api/v1/reference/works")
    Results search(@RequestParam(required = false) String q, @RequestParam(defaultValue = "8") int limit) {
        String text = TextInput.line("q", q, MAX_QUERY);
        if (text == null || text.codePoints().filter(Character::isLetterOrDigit).count() < 2) {
            throw new FieldValidationException("q", "required");
        }
        return new Results(works.search(text, Math.max(1, Math.min(limit, MAX_RESULTS))));
    }
}
