# Settings Section

This directory contains the modularized Settings functionality for the Scrapfly Security Detection Extension.

## Files

### `Settings.js`
The main Settings class that handles:
- `showSettings()` / `hideSettings()` - Modal management
- `loadSettings()` / `saveSettings()` - Chrome storage integration
- `validateSettings()` - Form validation
- `resetToDefaults()` - Reset all settings to default values
- `clearAllData()` - Remove all extension data
- `updateSetting()` - Update individual settings
- `loadHTML()` - Loads HTML template dynamically

### `settings.html`
HTML template containing the complete Settings modal structure:
- Modal header with close button
- General settings toggles (notifications, auto-detection)
- Numeric inputs (history limit)
- Range slider (confidence threshold)
- Data management actions
- Modal footer with action buttons

### `settings.css`
Styles specific to the Settings section:
- Modal overlay and content styling
- Switch component styling
- Form elements (inputs, sliders, buttons)
- Notification system for success/error messages
- Responsive design

## Settings Configuration

### Available Settings
- **Notifications Enabled**: Show notifications when security systems are detected
- **Auto Detection Enabled**: Automatically detect security systems on page load
- **History Limit**: Maximum number of history items to store (10-1000)
- **Confidence Threshold**: Minimum confidence level for detections (0-100%)

### Data Management
- **Clear All Data**: Removes all extension data including history, rules, and settings
- **Reset to Defaults**: Restores all settings to their default values

## Usage

The Settings class is instantiated in `popup.js`:

```javascript
class ScrapflyPopup {
  constructor() {
    this.settings = new Settings();
  }

  async initialize() {
    await this.settings.initialize();
  }
}
```

## Data Structure

Settings are stored in Chrome storage as:

```javascript
{
  timestamp: "2023-01-01T12:00:00.000Z",
  settings: {
    notificationsEnabled: true,
    autoDetectionEnabled: true,
    historyLimit: 100,
    confidenceThreshold: 70
  }
}
```

## Integration

The Settings module is loaded in `popup.html`:

```html
<link rel="stylesheet" href="Sections/Settings/settings.css">
<script src="Sections/Settings/Settings.js"></script>
```

## Dependencies

- Chrome Extensions API for storage and runtime management
- Global CSS variables from `popup.css`

## Event Handling

The settings modal can be opened by:
- Clicking the settings button in the header
- The modal includes validation and confirmation dialogs for destructive actions