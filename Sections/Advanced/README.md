# Advanced Section

This directory contains the modularized Advanced functionality for the Scrapfly Security Detection Extension.

## Files

### `Advanced.js`
The main Advanced class that handles:
- `displayAdvancedTools()` - Shows advanced tools interface
- `runDeepAnalysis()` - Performs comprehensive security analysis
- `exportData()` - Exports analysis results in various formats (JSON, CSV, TXT, PDF)
- `generateSecurityReport()` - Creates detailed security reports
- `analyzeBypassTechniques()` - Analyzes potential bypass methods
- `loadHTML()` - Loads HTML template dynamically

### `advanced.html`
HTML template containing the Advanced tab structure:
- Empty state placeholder for when DetectorManager isn't initialized
- Advanced content container (populated dynamically by JavaScript)

### `advanced.css`
Styles specific to the Advanced section:
- Advanced tools grid layout
- Tool cards with hover effects
- Analysis results display
- Export modal styling
- Responsive design for mobile

## Features

### Deep Analysis
- Comprehensive security system analysis
- Risk assessment and scoring
- Detailed recommendations
- Performance metrics

### Data Export
- JSON format for programmatic use
- CSV format for spreadsheet analysis
- TXT format for readable summaries
- PDF format for professional reports (coming soon)

### Security Reports
- Professional analysis reports
- Risk assessment summaries
- Bypass technique analysis

## Usage

The Advanced class is instantiated in `popup.js`:

```javascript
class ScrapflyPopup {
  constructor() {
    this.detectorManager = new DetectorManager();
    this.advanced = new Advanced(this.detectorManager);
  }

  async initialize() {
    await this.advanced.initialize();
    this.advanced.displayAdvancedTools();
  }
}
```

## Integration

The Advanced module is loaded in `popup.html`:

```html
<link rel="stylesheet" href="Sections/Advanced/advanced.css">
<script src="Sections/Advanced/Advanced.js"></script>
```

## Dependencies

- `DetectorManager` - For accessing detection data and running analysis
- Chrome Extensions API for tab management and data export
- Global CSS variables from `popup.css`