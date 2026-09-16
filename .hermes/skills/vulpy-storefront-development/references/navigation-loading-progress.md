# Next.js navigation loading progress timing

## Symptom

A top loading bar appears only after route loading has already started, making the indicator feel late or useless.

## Root cause

A document click listener that calls `startProgress()` inside `setTimeout(0)` yields the event turn. A bubbling-phase document listener also runs after Next.js/client navigation handlers, so rendering can begin before the browser paints the bar.

## Durable fix

Validate the click synchronously (primary button, no modifier, real same-origin internal anchor, destination differs from the current URL, and `defaultPrevented` is false), then call `startProgress()` in the same handler. Register the document listener in capture phase: `addEventListener("click", handler, true)`. Keep route pathname/search-key change as the authoritative completion signal: only then set 100% and hide after the existing short fade. Retain a stale-navigation timeout only as a safety fallback.

## Regression test

Extract a small event/listener helper if needed. Test that `startProgress` is called synchronously without advancing timers, and that a capture-phase listener runs before a bubble-phase navigation handler. Preserve exclusions for modified clicks, external links, hashes, mailto/tel, downloads, new tabs, same-URL links, and prevented interactions.
