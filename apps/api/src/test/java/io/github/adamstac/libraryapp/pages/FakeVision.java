package io.github.adamstac.libraryapp.pages;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;

/**
 * A stand-in for Google Cloud Vision in the tests: records every request it gets (path, headers, body) and answers as
 * told: lines of text, an HTTP status, a redirect, a delay. Plain HTTP on localhost; the real reader only allows that
 * for a local address.
 */
final class FakeVision {

    record Request(String path, Map<String, List<String>> headers, String body) {}

    /** One line of the page: its text, printed height and top */
    record Line(String text, int height, int top) {}

    private final HttpServer server;
    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String answer = "{\"responses\":[{}]}";
    private volatile long delayMillis;
    private volatile String redirectTo;

    FakeVision() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        server.createContext("/", exchange -> {
            byte[] body = exchange.getRequestBody().readAllBytes();
            requests.add(new Request(
                    exchange.getRequestURI().getPath(),
                    Map.copyOf(exchange.getRequestHeaders()),
                    new String(body, StandardCharsets.UTF_8)));
            try {
                Thread.sleep(delayMillis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            if (redirectTo != null) {
                exchange.getResponseHeaders().add("Location", redirectTo);
                exchange.sendResponseHeaders(302, -1);
                exchange.close();
                return;
            }
            byte[] out = answer.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, out.length);
            try (OutputStream stream = exchange.getResponseBody()) {
                stream.write(out);
            }
        });
        server.setExecutor(Executors.newCachedThreadPool()); // a slow answer mustn't hold up the next test's
        server.start();
    }

    String url() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    List<Request> requests() {
        return requests;
    }

    void reset() {
        requests.clear();
        status = 200;
        answer = "{\"responses\":[{}]}";
        delayMillis = 0;
        redirectTo = null;
    }

    /** Answers with these lines, as Google's document text detection would: one paragraph a line */
    void reads(Line... lines) {
        List<String> paragraphs = new ArrayList<>();
        for (Line line : lines) {
            String[] words = line.text().split(" ");
            List<String> json = new ArrayList<>();
            for (int w = 0; w < words.length; w++) {
                int[] cps = words[w].codePoints().toArray();
                List<String> symbols = new ArrayList<>();
                for (int c = 0; c < cps.length; c++) {
                    String kind = c < cps.length - 1 ? null : w < words.length - 1 ? "SPACE" : "EOL_SURE_SPACE";
                    symbols.add("{\"text\":" + quote(new String(Character.toChars(cps[c])))
                            + (kind == null ? "" : ",\"property\":{\"detectedBreak\":{\"type\":\"" + kind + "\"}}")
                            + "}");
                }
                int x = 1000 - 60 * (w + 1);
                json.add("{\"boundingBox\":{\"vertices\":[{\"x\":" + x + ",\"y\":" + line.top() + "},{\"x\":"
                        + (x + 50) + ",\"y\":" + line.top() + "},{\"x\":" + (x + 50) + ",\"y\":"
                        + (line.top() + line.height()) + "},{\"x\":" + x + ",\"y\":" + (line.top() + line.height())
                        + "}]},\"symbols\":[" + String.join(",", symbols) + "]}");
            }
            paragraphs.add("{\"words\":[" + String.join(",", json) + "]}");
        }
        answer = "{\"responses\":[{\"fullTextAnnotation\":{\"pages\":[{\"blocks\":[{\"paragraphs\":["
                + String.join(",", paragraphs) + "]}]}],\"text\":\"ignored\"},\"textAnnotations\":[]}]}";
        status = 200;
    }

    void answers(int status, String body) {
        this.status = status;
        this.answer = body;
    }

    void waits(long millis) {
        this.delayMillis = millis;
    }

    void redirects(String to) {
        this.redirectTo = to;
    }

    private static String quote(String text) {
        StringBuilder out = new StringBuilder("\"");
        for (char c : text.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                default -> {
                    if (c < 0x20) {
                        out.append(String.format("\\u%04x", (int) c));
                    } else {
                        out.append(c);
                    }
                }
            }
        }
        return out.append('"').toString();
    }
}
