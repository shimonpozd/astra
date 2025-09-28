# Frontend Implementation: Translation Caching

This document outlines the steps for implementing a client-side caching mechanism for the on-demand translation feature.

## 1. Goal

The objective is to prevent the application from making redundant API calls to the translation service for texts that have already been translated in the current session. This will improve performance and reduce unnecessary LLM usage.

## 2. Problem

Currently, if a user translates a text, reverts to the original view, and then clicks the translate button again on the same text, the application sends a new request to the `/api/actions/translate` endpoint. This is inefficient, slow, and costly.

## 3. Solution

Implement a simple in-memory cache on the client-side within the `useTranslation` hook. This cache will store the results of translation requests and serve them directly if the same text is requested again.

## 4. Implementation Details

-   **File to Modify:** `src/hooks/useTranslation.ts`

### 4.1. Create a Cache Store

Declare a `Map` object outside the `useTranslation` hook. This will ensure the cache persists across component re-renders and is shared by all components that use the hook.

```typescript
// At the top of the file, outside the hook
const translationCache = new Map<string, string>();
```

### 4.2. Modify the `translate` Function

1.  **Create a Cache Key:** Inside the `useTranslation` hook, create a unique key for the current text. A simple and effective way is to concatenate the Hebrew and English texts.

    ```typescript
    const cacheKey = `${hebrewText}::${englishText}`;
    ```

2.  **Check the Cache:** In the `translate` function, before initiating the API call, check if a translation for the `cacheKey` already exists in the `translationCache`.

    ```typescript
    if (translationCache.has(cacheKey)) {
      setTranslatedText(translationCache.get(cacheKey)!);
      return; // Exit the function, skipping the API call
    }
    ```

3.  **Store the New Translation:** After a new translation is successfully fetched from the API response, store the result in the cache.

    ```typescript
    const data = await response.json();
    const cleanTranslation = data.translation.replace(/<[^>]*>/g, '');
    setTranslatedText(cleanTranslation);

    // Store in cache for future use
    translationCache.set(cacheKey, cleanTranslation);
    ```

By implementing these changes, the `useTranslation` hook will first look for a translation in the local cache and will only make a network request if one is not found.
