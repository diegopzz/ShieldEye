# Detection Section

This directory contains the modularized Detection functionality for the Scrapfly Security Detection Extension.

## Files

### `Detection.js`
The main Detection class that handles:
- `displayResults()` - Shows detection results with statistics
- `showLoadingState()` / `hideLoadingState()` - Loading state management
- `showEmptyState()` / `showDisabledState()` - State management
- `handleSearch()` - Filter detection results
- `refreshAnalysis()` - Re-run detection on current page
- `loadHTML()` - Loads HTML template dynamically

### `detection.html`
HTML template containing the complete Detection tab structure:
- Loading state with spinner
- Empty state for no detections
- Detection results with stats grid (detections, confidence, difficulty, speed)
- Search functionality
- Results list container
- Refresh button
- Disabled state

### `detection.css`
Styles specific to the Detection section:
- Detection results layout and stats grid
- Search functionality styling
- Detection item cards with hover effects
- Confidence badges (high/medium/low)
- Loading states and transitions

## Usage

The Detection class is instantiated in `popup.js`:

```javascript
class ScrapflyPopup {
  constructor() {
    this.detectorManager = new DetectorManager();
    this.detection = new Detection(this.detectorManager);
  }

  async initialize() {
    await this.detection.initialize();
  }
}
```

## Integration

The Detection module is loaded in `popup.html`:

```html
<link rel="stylesheet" href="Sections/Detection/detection.css">
<script src="Sections/Detection/Detection.js"></script>
```

## Dependencies

- `DetectorManager` - For running detection algorithms on page data
- Global CSS variables from `popup.css`
- Chrome Extensions API for tab management