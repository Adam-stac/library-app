package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Component;

/**
 * Turns a verified sign-in (password and code, or passkey) into a signed-in session: records it in the security
 * log, notes the device for the "where you're signed in" list, and emails the owner about a new device.
 */
@Component
class SignInSessions {

    /** Session attributes describing the session, for the list of active sessions and the absolute time limit. */
    static final String DEVICE = "library.session.device";
    static final String IP = "library.session.ip";
    static final String SIGNED_IN_AT = "library.session.signedInAt";
    static final String METHOD = "library.session.method";

    // How the person signed in, recorded with the event
    static final String BY_PASSWORD = "password";
    static final String BY_PASSWORD_AND_CODE = "password_and_code";
    static final String BY_PASSKEY = "passkey";

    private final CsrfTokenRepository csrfTokens;
    private final SecurityEvents events;
    private final MailDispatcher mail;
    private final String baseUrl;
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    SignInSessions(
            CsrfTokenRepository csrfTokens,
            SecurityEvents events,
            MailDispatcher mail,
            @Value("${app.base-url}") String baseUrl) {
        this.csrfTokens = csrfTokens;
        this.events = events;
        this.mail = mail;
        this.baseUrl = baseUrl;
    }

    /** Session fixation: never carry a session from before sign-in; always start a brand-new one. */
    HttpSession startFresh(HttpServletRequest request) {
        HttpSession previous = request.getSession(false);
        if (previous != null) {
            previous.invalidate();
        }
        return request.getSession(true);
    }

    /** Marks the current session as signed in to the account, and replaces the CSRF token. */
    void complete(
            LoginService.Account account, String method, HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                account.id().toString(), null, AuthorityUtils.createAuthorityList("ROLE_USER")));
        contextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);

        String device = events.currentDevice();
        HttpSession session = request.getSession();
        session.setAttribute(DEVICE, device);
        session.setAttribute(IP, events.currentIp());
        session.setAttribute(SIGNED_IN_AT, System.currentTimeMillis());
        session.setAttribute(METHOD, method);

        boolean newDevice = events.isNewDevice(account.id(), device);
        events.record(account.id(), SecurityEvents.SIGN_IN, method);
        if (newDevice) {
            mail.sendAfterCommit(account.email(), AccountEmails.newSignIn(
                    account.language(), device, baseUrl + "/security", baseUrl + "/forgot-password"));
        }

        // A fresh CSRF token after sign-in (the old one is cleared; the next request receives a new one)
        csrfTokens.saveToken(null, request, response);
    }
}
