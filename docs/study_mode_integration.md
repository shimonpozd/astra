# Frontend Integration Guide: Interactive Study Mode ("Bookshelf")

This document outlines the frontend changes required to implement the new interactive study mode for the `chevruta_bimodal` personality.

## Core Concept

The goal is to transform the side panel into an "Interactive Bookshelf". When a user opens a primary source (e.g., "Shabbat 21a"), this bookshelf will immediately and automatically be populated with all available commentators (Rashi, Tosafot, etc.) and related texts (Midrash, Halakhah) for that specific source.

This is achieved via a new backend event.

## 1. New Event: `commentators_panel_update`

This is the primary event for populating the bookshelf.

*   **When it's sent:** This event is sent once, immediately after a user requests a new primary source.
*   **Action:** The frontend should listen for this `structured_event`. When received, it should **clear** the existing contents of the bookshelf panel and render a new list of commentators based on the payload.

### Event Payload Example:

The event will have `type: "structured_event"` and the internal data type will be `commentators_panel_update`.

```json
{
  "type": "structured_event",
  "data": {
    "type": "commentators_panel_update",
    "data": {
      "reference": "Shabbat 21a",
      "commentators": [
        {
          "ref": "Rashi on Shabbat 21a:1",
          "heRef": "רש"י על שבת כא א:א",
          "indexTitle": "Rashi",
          "category": "Commentary",
          "heCategory": "מפרשים"
        },
        {
          "ref": "Tosafot on Shabbat 21a:1:1",
          "heRef": "תוספות על שבת כא א:א:א",
          "indexTitle": "Tosafot",
          "category": "Commentary",
          "heCategory": "מפרשים"
        },
        {
          "ref": "Rambam, Mishneh Torah, Festivals 3:2",
          "heRef": "רמב"ם, משנה תורה, הלכות חנוכה ג:ב",
          "indexTitle": "Mishneh Torah, Festivals",
          "category": "Halakhah",
          "heCategory": "הלכה"
        }
        // ... and so on for all commentators
      ]
    }
  }
}
```

## 2. "Mark as Read" Functionality

To improve usability, items on the bookshelf should be marked as "read" after the user has viewed them.

*   **How it works:** When a user drags a commentator from the bookshelf into the chat, the backend loads that text and sends a standard `source_event` to display it.
*   **Key Change:** This `source_event` now reliably contains the `ref` of the text that was just loaded.

### `source_event` Payload Example:

```json
{
  "type": "source_event",
  "data": {
    "ref": "Rashi on Shabbat 21a:1", // <--- Use this ref
    "heRef": "רש"י על שבת כא א:א",
    "text": "The commentary text...",
    "he": "טקסט הפרשנות...",
    "indexTitle": "Rashi",
    "lang": "en"
  }
}
```

*   **Action:** When the frontend receives a `source_event`, it should:
    1.  Display the text in the chat window as it currently does.
    2.  Get the `ref` value from the event's data payload.
    3.  Find the element in the bookshelf panel that corresponds to this `ref`.
    4.  Apply a visual indicator to that element (e.g., add a CSS class like `is-read` or `opacity-50`) to show it has been viewed.

## Summary of User Flow

1.  **User enters a reference** (e.g., "Shabbat 21a").
2.  Backend sends a `source_event` for Shabbat 21a (chat updates) AND a `commentators_panel_update` event.
3.  **Frontend:** The bookshelf panel is cleared and repopulated with all commentators from the `commentators_panel_update` event.
4.  **User drags a commentator** (e.g., Rashi) from the panel into the chat. This sends a new message to the backend containing just the `ref` (e.g., "Rashi on Shabbat 21a:1").
5.  Backend sends a `source_event` for Rashi's text.
6.  **Frontend:** The chat is updated with Rashi's text, AND the Rashi item in the bookshelf panel is now visually marked as "read".
