package io.github.adamstac.libraryapp;

import org.springframework.boot.SpringApplication;

public class TestLibraryApplication {

	public static void main(String[] args) {
		SpringApplication.from(LibraryApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
