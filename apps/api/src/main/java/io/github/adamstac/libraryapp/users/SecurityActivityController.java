package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The security page: where you're signed in, and what has happened to your account. Signed-in accounts only. */
@RestController
@RequestMapping("/api/v1/auth")
class SecurityActivityController {

    static final int EVENTS_SHOWN = 50;

    private final ActiveSessions sessions;
    private final SecurityEvents events;

    SecurityActivityController(ActiveSessions sessions, SecurityEvents events) {
        this.sessions = sessions;
        this.events = events;
    }

    @GetMapping("/sessions")
    List<ActiveSessions.ActiveSession> sessions(Authentication authentication, HttpServletRequest request) {
        return sessions.list(userId(authentication), request.getSession().getId());
    }

    @PostMapping("/sessions/{handle}/end")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void end(@PathVariable String handle, Authentication authentication, HttpServletRequest request) {
        sessions.end(userId(authentication), request.getSession().getId(), handle);
    }

    @PostMapping("/sessions/end-others")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void endOthers(Authentication authentication, HttpServletRequest request) {
        sessions.endOthers(userId(authentication), request.getSession().getId());
    }

    @GetMapping("/security-events")
    List<SecurityEvents.Event> events(Authentication authentication) {
        return events.recent(userId(authentication), EVENTS_SHOWN);
    }

    private static UUID userId(Authentication authentication) {
        return UUID.fromString(authentication.getName());
    }
}
