package io.github.adamstac.libraryapp.library;

import io.github.adamstac.libraryapp.SignedInUser;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The summary on the signed-in user's home page (SecurityConfig lets only signed-in accounts in). */
@RestController
class HomeController {

    private final HomeService home;

    HomeController(HomeService home) {
        this.home = home;
    }

    @GetMapping("/api/v1/home")
    HomeService.Summary summary(Authentication authentication) {
        return home.summary(SignedInUser.id(authentication));
    }
}
