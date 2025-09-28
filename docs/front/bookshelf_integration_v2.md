# Frontend Guide: Interactive Bookshelf v2

This document outlines the frontend implementation for the new on-demand, category-based "Interactive Bookshelf". This new system is more efficient and responsive than the previous version.

## Core Concept

Instead of receiving all bookshelf items at once, the frontend will now:
1.  Fetch a list of available categories with their assigned colors.
2.  Render category tabs or buttons.
3.  Request the items for a specific category only when the user clicks on its tab/button.

## Step 1: Fetching Categories

On component mount (e.g., when the study mode is initialized), the frontend must fetch the list of available categories.

**Endpoint:** `GET /study/categories`

**Action:** Make a GET request to this endpoint.

**Response Payload Example:**
The endpoint will return a JSON array of category objects.

```json
[
    {"name": "Commentary", "color": "#FF5733"},
    {"name": "Quoting Commentary", "color": "#FFC300"},
    {"name": "Midrash", "color": "#DAF7A6"},
    {"name": "Mishnah", "color": "#C70039"},
    {"name": "Targum", "color": "#900C3F"},
    {"name": "Halakhah", "color": "#581845"},
    // ... and so on for all categories
]
```

**Frontend Task:**
Use this array to dynamically render the category tabs or buttons. The `name` should be the button label, and the `color` should be used for styling the button/tab to make it visually distinct.

## Step 2: Loading Items for a Category

When a user clicks on a category tab (e.g., "Halakhah"), the frontend must fetch the items for that category.

**Endpoint:** `POST /study/bookshelf`

**Action:** Make a POST request to this endpoint.

**Request Body:**
The request must send a JSON object with the current `session_id`, the `ref` of the main text being studied, and a list containing the name of the category to load.

```json
{
  "session_id": "your_current_session_id",
  "ref": "Genesis 1:1", // The ref of the text in the main study window (snapshot.focus.ref)
  "categories": ["Halakhah"] // An array with the name of the category the user clicked
}
```

**Response Payload Example:**
The backend will return a bookshelf object containing the items for the requested category.

```json
{
  "counts": {
    "Halakhah": 5 // Example count
  },
  "items": [
    {
      "ref": "Mishneh Torah, Foundations of the Torah 1:1",
      "heRef": "משנה תורה, הלכות יסודי התורה א:א",
      "indexTitle": "Mishneh Torah, Foundations of the Torah",
      "category": "Halakhah",
      "heCategory": "הלכה",
      "preview": "The foundation of all foundations and the pillar of wisdom is to know that there is a Primary Being...",
      "score": 80
    },
    // ... other items in this category
  ]
}
```

**Frontend Task:**
Upon receiving the response, clear the current list of bookshelf items and render the new list from the `items` array.

## Step 3: Loading All Categories (Optional)

To implement an "All" tab, the frontend can request all categories at once.

**Action:**
Send a POST request to `/study/bookshelf` with all category names in the `categories` array.

**Request Body Example:**
```json
{
  "session_id": "your_current_session_id",
  "ref": "Genesis 1:1",
  "categories": [
    "Commentary",
    "Quoting Commentary",
    "Midrash",
    "Mishnah",
    "Targum",
    "Halakhah",
    "Responsa",
    "Chasidut",
    "Kabbalah",
    "Jewish Thought",
    "Liturgy",
    "Bible",
    "Apocrypha",
    "Modern Works"
  ]
}
```
The backend will return all items from all specified categories, sorted by relevance.
