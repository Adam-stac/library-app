package io.github.adamstac.libraryapp;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/**
 * Turns errors into RFC 9457 problem details with machine-readable codes, never internals.
 * The web app translates the codes into Arabic or English.
 */
@RestControllerAdvice
class ApiErrorHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiErrorHandler.class);

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail body = ex.getBody();
        body.setProperty(
                "errors",
                ex.getBindingResult().getFieldErrors().stream()
                        .map(error -> fieldError(error.getField(), error.getDefaultMessage()))
                        .toList());
        return handleExceptionInternal(ex, body, headers, status, request);
    }

    /**
     * A query parameter or path part of the wrong type (e.g. {@code ?size=abc}). Spring's default answer repeats
     * the value back; this one names only the parameter.
     */
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid request content.");
        String field = ex.getPropertyName();
        body.setProperty("errors", List.of(fieldError(field == null ? "request" : field, "invalid")));
        return handleExceptionInternal(ex, body, headers, HttpStatus.BAD_REQUEST, request);
    }

    @ExceptionHandler(FieldValidationException.class)
    ProblemDetail fieldValidation(FieldValidationException ex) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid request content.");
        body.setProperty("errors", List.of(fieldError(ex.field(), ex.code())));
        return body;
    }

    @ExceptionHandler(InvalidRequestException.class)
    ProblemDetail invalidRequest(InvalidRequestException ex) {
        ProblemDetail body =
                ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "The request could not be completed.");
        body.setProperty("code", ex.code());
        return body;
    }

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ProblemDetail> notFound() {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Not found.");
        body.setProperty("code", "not_found");
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(body);
    }

    @ExceptionHandler(ConflictException.class)
    ResponseEntity<ProblemDetail> conflict(ConflictException ex) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "The request could not be completed.");
        body.setProperty("code", ex.code());
        ex.details().forEach(body::setProperty);
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    /**
     * The database's own checks (a CHECK, or a link between records checked at commit) refused a change that the
     * API's rules let through. That is a bug in the API's rules, but the data stays safe; the answer is 409. The
     * exception's message is never logged or returned, because it can contain what the user typed.
     */
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<ProblemDetail> refusedByTheDatabase(DataIntegrityViolationException ex) {
        log.warn("The database refused a change that the API allowed ({})", ex.getClass().getSimpleName());
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "The request could not be completed.");
        body.setProperty("code", "conflict");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(body);
    }

    @ExceptionHandler(ForbiddenException.class)
    ResponseEntity<ProblemDetail> forbidden(ForbiddenException ex) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, "This can't be changed.");
        body.setProperty("code", ex.code());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(body);
    }

    @ExceptionHandler(LimitReachedException.class)
    ResponseEntity<ProblemDetail> limitReached(LimitReachedException ex) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, "A limit was reached.");
        body.setProperty("code", ex.code());
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(body);
    }

    @ExceptionHandler(UpstreamException.class)
    ResponseEntity<ProblemDetail> upstream(UpstreamException ex) {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, "Please try again shortly.");
        body.setProperty("code", ex.code());
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(body);
    }

    @ExceptionHandler(ServiceBusyException.class)
    ResponseEntity<ProblemDetail> busy() {
        ProblemDetail body = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Please try again shortly.");
        body.setProperty("code", "busy");
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .header(HttpHeaders.RETRY_AFTER, "5")
                .body(body);
    }

    private static Map<String, String> fieldError(String field, String code) {
        return Map.of("field", field, "code", code == null ? "invalid" : code);
    }
}
