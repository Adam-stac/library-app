package io.github.adamstac.libraryapp.users;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;

class SessionLifetimeFilterTests {

    private final SessionLifetimeFilter filter = new SessionLifetimeFilter(Duration.ofDays(7));

    @Test
    void aSignInYoungerThanTheLimitCarriesOn() throws Exception {
        MockHttpSession session = sessionSignedIn(Duration.ofDays(6));

        run(session);

        assertThat(session.isInvalid()).isFalse();
    }

    @Test
    void aSignInOlderThanTheLimitIsEndedHoweverActiveItIs() throws Exception {
        MockHttpSession session = sessionSignedIn(Duration.ofDays(7).plusMinutes(1));

        MockFilterChain chain = run(session);

        assertThat(session.isInvalid()).isTrue();
        assertThat(chain.getRequest()).as("the request still goes on, now signed out").isNotNull();
    }

    @Test
    void sessionsThatArentSignInsAreLeftAlone() throws Exception {
        MockHttpSession session = new MockHttpSession(); // e.g. only holds a passkey challenge

        run(session);

        assertThat(session.isInvalid()).isFalse();
    }

    private static MockHttpSession sessionSignedIn(Duration ago) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(SignInSessions.SIGNED_IN_AT, System.currentTimeMillis() - ago.toMillis());
        return session;
    }

    private MockFilterChain run(MockHttpSession session) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/auth/me");
        request.setSession(session);
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request, new MockHttpServletResponse(), chain);
        return chain;
    }
}
