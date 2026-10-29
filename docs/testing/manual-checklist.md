# Testing by hand

The automated tests check what a machine can: every journey, axe's accessibility rules, reflow, and that nothing
changes how a page looks by accident. They can't tell whether the app is pleasant and clear to use with a keyboard,
a screen reader or a real phone. Go through this list before a release, and after a change to the frame (Layout),
forms, or anything that moves focus. It takes about 30 minutes. Note anything wrong as an issue.

## Keyboard only (no mouse or touchpad)
- [ ] From the top of any page, Tab reaches every link and button in reading order: right to left in Arabic, left
      to right in English. Nothing is skipped, and nothing hidden takes focus.
- [ ] Focus is always visible: a clear outline on every link, button, field and tab.
- [ ] The account menu and More (phone) open with Enter or Space, close with Escape, and focus returns to the button.
- [ ] Add a book with only the keyboard: type the title, pick an author from the list with the arrow keys and
      Enter, choose a science, save.
- [ ] Delete a benefit, then reach Undo with Tab before the message goes (it waits while focused), and press it.
- [ ] Start typing in a form, then follow a link: the "Leave without saving?" dialog opens with "Keep editing"
      focused, Escape keeps you on the page, and focus can't leave the dialog while it's open.
- [ ] Leave a field with a mistake in it (a latitude of 100): the error shows on leaving, and is read with the field.

## Screen reader, in Arabic and in English
Use VoiceOver (Mac or iPhone), NVDA (Windows) or TalkBack (Android), with the app set to each language in turn.
- [ ] The page's language is announced correctly, and Arabic is read with an Arabic voice.
- [ ] Each page has one heading at the top (its title), and the landmarks (navigation, main) are announced.
- [ ] The home page's "Where you are" reads the bookmark as a sentence ("Volume 3, page 212"), not the big number
      on its own; the sciences ring reads as the list of sciences.
- [ ] After saving, the confirmation ("Book added.") is read without moving focus.
- [ ] After deleting, "… was moved to the bin" is read, and Undo can be found.
- [ ] A form's own error (such as "We couldn't save this") is read when it appears, and each field's error is read with the field.
- [ ] While a page loads, "Loading…" is read, not the grey blocks.

## Zoom and text size
- [ ] Browser zoom at 200%: every page still works, with nothing cut off and no scrolling sideways.
- [ ] The device's large text setting (or the browser's minimum font size at 24 px): text grows and still fits.
- [ ] Reduce motion is on: nothing slides or pulses (the Undo message appears without rising; placeholders don't
      pulse).
- [ ] Reduce transparency is on (Mac and iOS): the frosted bars and card are solid.

## A real phone (one iPhone, one Android)
- [ ] The tab bar and search box sit above the home indicator, and the keyboard doesn't hide the field being typed in.
- [ ] Every button is easy to tap (the app aims for 44 px), and nothing needs a precise tap.
- [ ] Turning the phone sideways keeps everything usable.
- [ ] Arabic text is never cut off at the top or bottom (Lateef's tall letters), in titles and in fields.

## Light and dark
- [ ] Automatic follows the device; Light and Dark in Settings change it at once, and it stays after a reload.
- [ ] In both, every text is easy to read, including on the deep green cards and the Undo message.
