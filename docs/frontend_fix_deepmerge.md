# Frontend Task: Fix Deep Merge in General Settings

## 1. File to Edit

`astra-web-client/src/pages/admin/GeneralSettings.tsx`

## 2. The Problem

The `fetchConfig` function in this component is responsible for loading the application configuration from the `/admin/config` API and merging it with a default state defined inside the component.

Currently, it uses a **shallow merge**:

```typescript
const mergedConfig = { ...config, ...data };
```

This is incorrect because it completely overwrites nested objects. For example, if the default state is ` { research: { iterations: { min: 1, max: 5 } } }` and the API returns `{ research: { max_depth: 3 } }` (without the `iterations` key), the shallow merge will result in the `iterations` object being lost entirely.

This is why some numerical and nested settings are not appearing in the UI.

## 3. The Solution

Replace the shallow merge with a **deep (recursive) merge** function. This will ensure that nested objects are merged field by field, preserving default values when they are not present in the API response.

### Step 1: Add a Deep Merge Utility

A utility function for deep merging needs to be available. You can add this to a utils file or directly in the component if preferred.

Here is a simple, dependency-free implementation:

```typescript
const isObject = (item: any): item is Record<string, any> => {
  return (item && typeof item === 'object' && !Array.isArray(item));
};

const deepMerge = (target: any, ...sources: any[]): any => {
  if (!sources.length) return target;
  const source = sources.shift();

  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key]) Object.assign(target, { [key]: {} });
        deepMerge(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }

  return deepMerge(target, ...sources);
};
```

### Step 2: Update the `fetchConfig` Function

In the `fetchConfig` function, change the merge logic to use the new utility.

**Before:**
```typescript
// ...
if (response.ok) {
  const data = await response.json();
  // Merge API data with default config
  const mergedConfig = { ...config, ...data }; // <-- SHALLOW MERGE
  setConfig(mergedConfig);
  setOriginalConfig(JSON.parse(JSON.stringify(mergedConfig)));
} 
// ...
```

**After:**
```typescript
// ...
if (response.ok) {
  const data = await response.json();
  // Create a deep copy of the default config to avoid mutation
  const newConfig = JSON.parse(JSON.stringify(config));
  // Deep merge the fetched data into the new config object
  const mergedConfig = deepMerge(newConfig, data); // <-- DEEP MERGE
  setConfig(mergedConfig);
  setOriginalConfig(JSON.parse(JSON.stringify(mergedConfig)));
} 
// ...
```

This change will correctly combine the default and fetched configurations, ensuring all UI fields are populated as expected.
