package io.github.adamstac.libraryapp.users;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.session.web.http.CookieSerializer;
import org.springframework.session.web.http.DefaultCookieSerializer;

@Configuration(proxyBeanMethods = false)
class SessionConfig {

    /**
     * The session cookie: unreadable by JavaScript (HttpOnly), HTTPS only (Secure), not sent on cross-site
     * requests that change things (SameSite=Lax). The __Host- prefix makes browsers reject it unless it is
     * Secure with Path=/ and no Domain, so no other subdomain can set or override it.
     */
    @Bean
    CookieSerializer cookieSerializer() {
        DefaultCookieSerializer serializer = new DefaultCookieSerializer();
        serializer.setCookieName("__Host-SESSION");
        serializer.setCookiePath("/");
        serializer.setUseHttpOnlyCookie(true);
        serializer.setUseSecureCookie(true);
        serializer.setSameSite("Lax");
        return serializer;
    }
}
