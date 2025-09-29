# History Section

This directory contains the modularized History functionality for the Scrapfly Security Detection Extension.

## Files

### `History.js`
The main History class that handles:
- `displayHistory()` - Shows browsing history with detections
- `addHistoryItem()` - Adds new detection to history
- `clearHistory()` - Removes all history entries
- `handleSearch()` - Filter history entries
- `loadHistoryFromStorage()` / `saveHistoryToStorage()` - Chrome storage integration
- `loadHTML()` - Loads HTML template dynamically

### `history.html`
HTML template containing the complete History tab structure:
- Search functionality for filtering history
- Clear history button
- History list container
- Empty state for when no history exists

### `history.css`
Styles specific to the History section:
- History item cards with hover effects
- Timestamp and favicon styling
- Detection tags display
- Clear button styling
- Search functionality

## Usage

The History class is instantiated in `popup.js`:

```javascript
class ScrapflyPopup {
  constructor() {
    this.history = new History();
  }

  async initialize() {
    await this.history.initialize();
    this.history.displayHistory();
  }
}
```

## Data Structure

History items are stored in Chrome storage as:

```javascript
{
  id: "timestamp-id",
  url: "https://example.com",
  title: "Page Title",
  favicon: "favicon-url",
  timestamp: "2023-01-01T12:00:00.000Z",
  detections: [/* detection objects */],
  totalDetections: 3
}
```

## Integration

The History module is loaded in `popup.html`:

```html
<link rel="stylesheet" href="Sections/History/history.css">
<script src="Sections/History/History.js"></script>
```

## Dependencies

- Chrome Extensions API for storage and tab management
- Global CSS variables from `popup.css`