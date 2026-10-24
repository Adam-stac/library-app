package io.github.adamstac.libraryapp.users;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.context.SecurityContextHolderStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Component;

/** Turns a verified sign-in (password and code, or passkey) into a signed-in session. */
@Component
class SignInSessions {

    private final CsrfTokenRepository csrfTokens;
    private final SecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();
    private final SecurityContextHolderStrategy contextHolder = SecurityContextHolder.getContextHolderStrategy();

    SignInSessions(CsrfTokenRepository csrfTokens) {
        this.csrfTokens = csrfTokens;
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
    void complete(LoginService.Account account, HttpServletRequest request, HttpServletResponse response) {
        SecurityContext context = contextHolder.createEmptyContext();
        context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
                account.id().toString(), null, AuthorityUtils.createAuthorityList("ROLE_USER")));
        contextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);

        // A fresh CSRF token after sign-in (the old one is cleared; the next request receives a new one)
        csrfTokens.saveToken(null, request, response);
    }
}
