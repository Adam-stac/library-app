# 0011. Reading a book's title page from a photo

- **Status:** Accepted (approved by Adam on 31 October 2026)
- **Date:** 2026-10-31

## Context

Adam's first case study, adding his own books, showed where the time goes. An ISBN identifies a copy but fills
little. Many classical printings have none. The free catalogues know a few Arabic editions at best, and ADR 0010 left
them deferred. The scholars' catalogue finds famous works and most authors, but not the edition: the muḥaqqiq, the
publisher, the place, the year and the edition statement. Those are printed on the title page and the copyright page,
in wording that barely varies between publishers: «تأليف», «تحقيق», «دار …», «الطبعة الأولى», «ردمك».

So a photo of those pages could fill most of the form in one step. Two ways of reading text from a photo were tried on
his copy of *Mutammimat al-Ājurrūmiyya*:

- **Tesseract** (free, open source, could run in the browser) read the ornate cover as noise. Even cropped, enlarged and
  cleaned up, each part came back 26–43% confident, and the fragments it got were misspelt.
- **Google Lens**, on his phone, read everything cleanly, publisher included. Lens itself offers apps no access. Its
  counterpart for apps is **Google Cloud Vision**: the first 1,000 images a month free, then $1.50 per 1,000 (read on 31
  October 2026). For one reader cataloguing their own shelves, that is likely nothing.

Adam can't take on open-ended costs, and a photo of a page sent to Google is the first time the app would send a
reader's content to an outside service. So the cost, the privacy and the way fields are filled need deciding before any
code.

## Decision

**"Read the cover or title page" becomes the first step of Add a book**, above the ISBN, which stays second; title and author,
found from the scholars' catalogue as you type, come third. The photo is read by Google Cloud Vision, from our server,
within a monthly cap. The app sorts the lines into fields by the fixed wording of Arabic title pages. **The printed page
wins over the catalogue, and the reader confirms everything.**

1. **The flow.** "Photograph the cover or title page" opens the camera (or a photo the reader picks). Either works: the
   cover is quicker, and the title page (the first printed page inside) is plainer and often adds the publisher and
   year. A second photo, of the copyright page, is optional, for the ISBN and the edition details. What was read fills only the empty fields, each with the note "Please confirm. Read
   from the photo.", and every line read is listed below the form: a line in the wrong field, or missed, is moved
   with a tap. Nothing is saved until the reader presses Save, as with every suggestion (ADR 0010).

2. **What leaves the device, and what doesn't.** A phone's photo carries hidden details: where and when it was taken,
   and the phone. In the browser, before anything is sent, the photo is redrawn at most 2,000 pixels on its long side
   and re-encoded as a plain JPEG, which leaves all of that behind. Only that image goes to our server, and from there only the image goes to Google: no account, email, cookie or session. A line beside the
   button says the photo is read by Google. We keep neither the photo nor the text: both are held only while the
   request runs. Google's terms for online requests say the image is processed in memory and not stored, only request
   metadata (time, size) is logged, and the content is not used to train its models (Cloud Vision data usage, read 31
   October 2026). Google's EU endpoint is used if it serves this feature, to be confirmed in the build.

3. **The server's part.** `POST /api/v1/page-readings`, signed in, with the CSRF token. It takes one image of at most
   4 MB that decodes as JPEG or PNG within a pixel limit (so a small file can't unpack into a huge one). It sends it to
   one fixed Google host over HTTPS: no redirects followed, a timeout of about 10 seconds, a size limit on the answer.
   The answer is untrusted. Every line is checked like text a reader typed (ADR 0006), and a bad line is dropped. Errors
   come back as codes only (`unavailable`, `timed_out`, `limit_reached`), never with the image or its text, and the log
   records the outcome and a count only.

4. **Cost is capped by the app, not by hope.** Each reading is counted in the database: per account (30 a day, 300 a
   month) and for the whole app (1,000 a month by default, Google's free amount). At either limit the button says
   reading pages is paused until the next day or month and the reader can type as before. Raising the app-wide cap is a
   deliberate setting by the administrator. A budget alert in Google Cloud is the second line, not the first.

5. **The API key.** A key restricted to the Cloud Vision API, read from the server's environment, never logged, never
   sent to the browser, and never in the repository. With no key set the feature is off: the button doesn't show. So
   development, CI and the browser tests need no Google account; tests use a fake Vision server.

6. **How lines become fields.** By rules, in one small module, unit-tested on real title-page texts:

   | On the page | Field |
   | --- | --- |
   | The largest text near the top | Title |
   | After «تأليف», «للإمام», «لشيخ الإسلام», «صنّفه», «جمعه» | Author |
   | A span of Hijri years such as «(٩٠٢–٩٥٤هـ)» near the author | The author's death year |
   | After «تحقيق», «حقّقه», «تحقيق وتعليق», «اعتنى به», «خرّج أحاديثه», «ضبطه» | Muḥaqqiq |
   | «دار …», «مكتبة …», «مؤسسة …», «الناشر» | Publisher |
   | A known city near the publisher (بيروت، القاهرة، دمشق، الرياض، عمّان…) | Place of publication |
   | «الطبعة …», a Hijri or Gregorian year (هـ، م) | Edition and year |
   | «ردمك» or a 978/979 number with a correct check digit | ISBN, which then runs the checks in ADR 0010 |

   No AI picks the fields, so the same page always gives the same answer, and a wrong rule can be found and fixed.

7. **The page wins; the catalogue suggests; the reader decides.** The title as printed, the muḥaqqiq, the publisher,
   the place, the year and the edition come from the page only. The author's name is the printed one. If it matches a
   scholar in the catalogue, linking them is offered ("Use al-Ḥaṭṭāb (d. 954 AH) from the catalogue?") and happens only
   on a tap. A death year printed on the page is used over the catalogue's, and a difference is shown. When the reading
   and the catalogue differ by a letter or two, the difference is pointed out rather than either being trusted
   silently.

## Alternatives considered

- **Tesseract in the browser:** free, and the photo would never leave the device. It couldn't read the cover we tried,
  even cleaned up. It may manage plain title pages; if it proves good enough, it could be added later as a private,
  free first try, with Google only when it fails. Not chosen now, because it would mean shipping a WebAssembly reader
  (a CSP change) for results we haven't shown to be good enough.
- **An AI model that reads the photo and fills the fields itself:** reads covers well, but costs more per photo, and
  its field choices can't be tested the same way twice. Adam ruled it out on cost.
- **Google Lens:** offers no access to apps.
- **No photo reading:** typing stays possible and works today, but the case study showed it is the slow part.

## Consequences

- Adding a book can take one photo, a few taps to confirm, and Save. The ISBN and the catalogue remain for books whose
  pages don't read well, and for readers who prefer not to send a photo.
- **The app's first outside call carrying a reader's content.** The threat model `page-reading.md` covers it before any
  code. The privacy notice and the About page say which service reads photos and on what terms.
- Adam sets up a Google Cloud project with the Cloud Vision API, a restricted key and a budget alert. The go-live
  checklist gets those items, and the re-reading of Google's terms joins the terms check from ADR 0010.
- If anyone is ever charged for the app, Google's terms are reviewed again, as for every outside service.
- The rules in point 6 will need new cue words as unusual title pages turn up. Each fix comes with the page's text as
  a test case.
