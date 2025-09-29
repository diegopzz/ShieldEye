# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Scrapfly Security Detection Chrome Extension - A Manifest V3 browser extension that detects CAPTCHAs, anti-bot systems, and fingerprinting technologies on websites. Features a modular architecture with sophisticated detection system and modern UI.

## Development Commands

This is a pure JavaScript browser extension with no build system:

1. **Load Extension**: Chrome Extensions page → Developer mode → Load unpacked → Select `core/` folder
2. **Reload Extension**: Click reload button in Chrome Extensions page after code changes
3. **Debug Popup**: Right-click extension icon → Inspect popup
4. **Debug Background**: Chrome Extensions page → Service worker link
5. **Debug Content Script**: Regular DevTools on any webpage

## Architecture

### Core Flow
1. **Content Script** (`content.js`) runs on every page, collects page data via `DetectionEngineManager`
2. **Background Service Worker** (`background.js`) processes detection, manages storage, handles inter-component messaging
3. **Popup UI** (`popup.js`) displays results via modular sections (Detection, History, Rules, Advanced, Settings)

### Module System

#### Core Managers (Singleton Pattern)
- **DetectorManager** (`Modules/DetectorManager.js`): Central detector CRUD, storage, pattern matching
  - `initialize()` - Loads detectors from storage or JSON files
  - `matchPattern()` - Unified regex/whole-word/case-sensitive matching
  - `reloadFromJSON()` - Recovery from data corruption
- **DetectionEngineManager** (`Modules/DetectionEngineManager.js`): Page data collection & detection
  - `collectPageData()` - Gathers cookies, DOM, scripts, headers
  - `detectOnPage()` - Runs all detectors against page data
  - Static methods: `getStoredDetection()`, `storeDetection()`, `cleanExpiredDetections()`
- **CategoryManager** (`Modules/CategoryManager.js`): Category metadata and colors
- **NotificationManager** (`Modules/NotificationManager.js`): Toast notifications, confirmations, badges
  - Includes `NotificationHelper` wrapper for safe fallbacks

#### UI Managers
- **PaginationManager** (`Modules/PaginationManager.js`): Reusable pagination component
- **ColorManager** (`Modules/ColorManager.js`): Color picker UI, RGB/HSL/Hex conversion
- **SearchManager** (`Modules/SearchManager.js`): Advanced search with operators
  - IMPORTANT: Uses deep cloning to avoid mutating detector objects
- **ConfidenceManager** (`Modules/ConfidenceManager.js`): Confidence scoring calculations

### Section Architecture

Each UI section is self-contained:
```
Sections/[Name]/
├── [Name].js       # Logic class
├── [name].html     # Template (loaded via fetch)
├── [name].css      # Section-specific styles
└── README.md       # Documentation
```

Sections: Detection, History, Rules, Advanced, Settings

### Advanced Section Modules

Dynamic module loading for detector-specific tools:
```
Sections/Advanced/Modules/[DetectorName]/
├── [Name]Interceptor.js  # Network interception (service worker)
└── [Name]Advanced.js      # UI module
```

#### reCAPTCHA Capture System
- **ReCaptchaInterceptor**: Intercepts network requests in service worker
  - Captures anchor (siteKey) and reload/userverify (action) requests
  - Auto-stops when both captured
  - Decodes protobuf data using pbf.js
- **ReCaptchaAdvanced**: UI for capture tools
  - Shows capture progress with timer
  - Displays results with 30-minute expiration
  - Pagination for history (3 items/page)

#### Akamai Capture System
- **AkamaiInterceptor**: Captures ALL POST requests when active
  - Cannot rely on URL patterns (dynamic/obfuscated)
  - Looks for `sensor_data` in request body
- **AkamaiAdvanced**: Decodes and displays sensor data

### Detection System

JSON-driven detectors in `detectors/[category]/[name].json`:

Categories:
- **antibot**: Cloudflare, Akamai, DataDome, PerimeterX, etc.
- **captcha**: reCAPTCHA, hCaptcha, FunCaptcha, GeeTest
- **fingerprint**: Canvas, WebGL, WebRTC, Font, Audio fingerprinting

Detection Methods:
- **content**: Search scripts/classes/values (single input, scope options)
- **cookies**: Match cookie name/value pairs (dual input)
- **headers**: Match header name/value pairs (dual input)
- **urls**: Match URL patterns (single input)
- **dom**: Match DOM selectors (single input)

Pattern Options (per field):
- `nameRegex`/`valueRegex`: Enable regex
- `nameWholeWord`/`valueWholeWord`: Word boundaries
- `nameCaseSensitive`/`valueCaseSensitive`: Case sensitivity

### Storage Architecture
```javascript
'scrapfly_detectors'         // All detector definitions
'scrapfly_categories'        // Category configuration
'scrapfly_history'           // Detection history (max 100)
'scrapfly_detection_storage' // Cached detections (12-hour expiry)
'scrapfly_advanced_history'  // Capture results (30-min expiry)
'scrapfly_advanced_selected' // Session state (3-min expiry)
```

### Message Flow

1. **Content → Background**: `DETECTION_DATA`, `PAGE_LOAD_NOTIFICATION`
2. **Background → Content**: `RUN_DETECTION`, `REQUEST_PAGE_DATA`
3. **Popup → Background**: `GET_DETECTION_DATA`, `REQUEST_DETECTION`, `RELOAD_DETECTORS`
4. **Advanced → Background**: `RECAPTCHA_START_CAPTURE`, `AKAMAI_START_CAPTURE`

### Initialization Sequence

1. **Background Service Worker**:
   - `initialize()` → DetectorManager loads from storage/JSON
   - Sets up header capture, message listeners, tab listeners
   - Runs cleanup interval (5 min) for expired detections

2. **Popup Opens**:
   - `ScrapflyPopup.initialize()` → All sections initialize
   - Each section loads HTML template via `fetch()`
   - Event listeners attached via delegation

3. **Content Script**:
   - Guards against redeclaration: `if (typeof DetectionEngineManager === 'undefined')`
   - Uses `var` for globals to handle extension reloads

## Caching System

### Detection Cache
- **Storage**: `scrapfly_detection_storage` with URL hash keys
- **Expiry**: 12 hours per URL (configurable via `EXPIRY_HOURS`)
- **Flow**: `PAGE_LOAD_NOTIFICATION` → Cache check → Hit: Use cached / Miss: Collect & detect
- **Bypass**: `RUN_DETECTION` message forces fresh detection (manual trigger from popup)
- **Cleanup**: Background runs `cleanExpiredDetections()` every 5 minutes

### Cache Optimization Notes
- Tab update listeners should NOT send `RUN_DETECTION` (bypasses cache)
- Content script's `PAGE_LOAD_NOTIFICATION` properly checks cache first
- Detection results include `detectionCount`, `detectionMethods`, and full `detectionResults`

## Critical Implementation Details

### Extension Reload Handling
- Content scripts use type guards: `if (typeof ClassName === 'undefined')`
- Global variables use `var` with fallbacks: `var x = x || defaultValue`
- Service worker uses `importScripts()` not ES6 imports

### HTML Template Loading
Templates loaded dynamically, must NOT include outer wrapper:
```javascript
// WRONG: <div id="sectionTab">content</div>
// RIGHT: content only (wrapper exists in popup.html)
```

### Pattern Matching
All detection uses unified `matchPattern()` helper:
- Handles regex, whole word, case sensitivity
- Check both `nameRegex` and `regex` for backward compatibility

### Data Integrity
- SearchManager creates deep copies to prevent mutations
- DetectorManager includes corruption detection/recovery
- Storage migrated from `.json` suffix keys

### CSS Variables
Work in stylesheets but NOT inline styles in extensions:
```css
/* Works */ .class { color: var(--text-primary); }
/* Fails */ style="color: var(--text-primary)"
```

### Utils Module
Static utility methods in `Utils/utils.js`:
- `hashUrl()` - Generate URL hash for caching
- `shouldSkipDetection()` - Prevent duplicate detection requests

## Common Issues & Solutions

1. **Element not found**: Ensure `await loadHTML()` completes before DOM access
2. **CSS variables failing**: Use classes not inline styles
3. **Duplicate containers**: Templates shouldn't include wrapper divs
4. **Icon loading**: Use `chrome.runtime.getURL()` with error fallbacks
5. **Modal conflicts**: Use `stopPropagation()` on trigger events
6. **Color picker lag**: Use CSS gradients not pixel-by-pixel canvas
7. **Empty methods persisting**: Filter in `saveRule()` before storage
8. **Detection method badges**: Check both property names for compatibility
9. **Script redeclaration**: Use typeof guards for extension reloads
10. **Akamai detection**: Don't rely on URL patterns - user triggers manually
11. **Cache not working**: Ensure tab listeners don't send `RUN_DETECTION` automatically