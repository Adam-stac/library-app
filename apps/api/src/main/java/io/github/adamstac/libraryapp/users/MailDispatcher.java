package io.github.adamstac.libraryapp.users;

import jakarta.annotation.PreDestroy;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Executor;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Sends emails only after the database transaction commits, on a small background queue.
 * So: no email is sent for a change that was rolled back; mail delays never hold database locks;
 * and response times don't depend on the mail server. Tokens are never written to the database.
 * Trade-off: an email can be lost if the server stops right after committing; the person can simply retry.
 */
@Component
class MailDispatcher {

    private static final Logger log = LoggerFactory.getLogger(MailDispatcher.class);

    private final Mailer mailer;
    private final Executor executor;

    @Autowired
    MailDispatcher(Mailer mailer) {
        this(mailer, new ThreadPoolExecutor(
                2, 2, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1000),
                Thread.ofVirtual().name("mail-", 0).factory()));
    }

    MailDispatcher(Mailer mailer, Executor executor) {
        this.mailer = mailer;
        this.executor = executor;
    }

    void sendAfterCommit(String to, RegistrationEmails.Email email) {
        Runnable send = () -> {
            try {
                mailer.send(to, email.subject(), email.body());
            } catch (RuntimeException e) {
                log.error("Could not send email ({})", e.getClass().getSimpleName());
            }
        };
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    dispatch(send);
                }
            });
        } else {
            dispatch(send);
        }
    }

    private void dispatch(Runnable send) {
        try {
            executor.execute(send);
        } catch (RejectedExecutionException e) {
            log.error("Email queue full; email dropped");
        }
    }

    @PreDestroy
    void shutdown() {
        if (executor instanceof ExecutorService service) {
            service.shutdown();
        }
    }
}
