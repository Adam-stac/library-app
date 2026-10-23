package io.github.adamstac.libraryapp;

import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Enables scheduled housekeeping jobs, such as deleting expired registrations. */
@Configuration(proxyBeanMethods = false)
@EnableScheduling
class SchedulingConfig {}
