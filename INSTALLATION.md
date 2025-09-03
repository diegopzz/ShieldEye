# ShieldEye Installation Guide

This guide will walk you through installing ShieldEye browser extension for web security detection.

## 📋 Requirements

- **Supported Browsers:**
  - Google Chrome 88+ (Manifest V3 support)
  - Microsoft Edge 88+ (Chromium-based)
  - Opera 74+ (with Chrome extension support)
  - Brave Browser 1.20+

- **Operating Systems:**
  - Windows 10/11
  - macOS 10.15+
  - Linux (Ubuntu 20.04+, Fedora 34+, etc.)

## 🚀 Installation Methods

### Method 1: Install from Source (Recommended for Development)

#### Step 1: Download the Source Code

**Option A: Git Clone (Recommended)**
```bash
git clone https://github.com/[diegopzz]/shieldeye.git
cd shieldeye
```

**Option B: Download ZIP**
1. Go to the [GitHub repository](https://github.com/[diegopzz]/shieldeye)
2. Click the green "Code" button
3. Select "Download ZIP"
4. Extract the ZIP file to your desired location

#### Step 2: Load Extension in Browser

**For Google Chrome:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked" button
4. Navigate to and select the `ShieldEye` folder from the downloaded repository
5. The extension should now appear in your extensions list

**For Microsoft Edge:**
1. Open Edge and navigate to `edge://extensions/`
2. Enable "Developer mode" (toggle in left sidebar)
3. Click "Load unpacked" button
4. Navigate to and select the `ShieldEye` folder from the downloaded repository
5. The extension should now appear in your extensions list

**For Opera:**
1. Open Opera and navigate to `opera://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked" button
4. Navigate to and select the `ShieldEye` folder from the downloaded repository
5. The extension should now appear in your extensions list

#### Step 3: Verify Installation

1. Look for the ShieldEye icon in your browser toolbar
2. Click the icon to open the popup
3. You should see the ShieldEye interface with tabs for Detection, History, Rules, and Advanced
4. The extension should show "No anti-bot solutions detected" on most regular pages

### Method 2: Install from Extension Store (Future)

> **Note**: ShieldEye is not yet available on the Chrome Web Store or Edge Add-ons store. This method will be available in future releases.

## ⚙️ Configuration

### Initial Setup

1. **Enable the Extension:**
   - Click the ShieldEye icon in your toolbar
   - Toggle the switch in the top-right to enable detection

2. **Pin the Extension (Recommended):**
   - Click the puzzle piece icon (Extensions) in your browser toolbar
   - Find ShieldEye and click the pin icon to keep it visible

3. **Grant Permissions:**
   - The extension may prompt for additional permissions on first use
   - These are required for detecting security services on websites

### Permissions Explained

ShieldEye requires the following permissions:

- **`<all_urls>`**: To analyze any website you visit
- **`cookies`**: To detect security-related cookies
- **`webRequest`**: To monitor HTTP headers for security indicators
- **`storage`**: To save your settings and detection history locally
- **`tabs`**: To manage detection per browser tab
- **`scripting`**: To inject detection scripts into web pages
- **`webNavigation`**: To track page navigation events

All data processing happens locally on your device. No data is sent to external servers.

## 🔧 Troubleshooting

### Common Issues

#### Extension Won't Load
- **Cause**: Browser doesn't support Manifest V3
- **Solution**: Update your browser to the latest version
- **Alternative**: Try a different supported browser

#### No Detections Showing
- **Cause**: Extension is disabled or not working on the current site
- **Solutions**:
  1. Check that the toggle switch is enabled (top-right of popup)
  2. Refresh the page after enabling the extension
  3. Try visiting a known site with security services (e.g., any site behind Cloudflare)

#### Popup Won't Open
- **Cause**: Extension installation incomplete or corrupted
- **Solutions**:
  1. Reload the extension: Go to extensions page, find ShieldEye, click reload
  2. Reinstall: Remove and reinstall the extension
  3. Check browser console for errors (F12 → Console)

#### Detection Inaccurate
- **Cause**: Outdated detection rules or edge cases
- **Solutions**:
  1. Update to latest version from GitHub
  2. Report the issue with specific website details
  3. Check if custom rules are interfering

### Getting Help

If you encounter issues not covered here:

1. **Check Console Errors:**
   - Press F12 in your browser
   - Go to Console tab
   - Look for red error messages related to ShieldEye

2. **Report Issues:**
   - Visit the [GitHub Issues](https://github.com/[diegopzz]/shieldeye/issues) page
   - Use the Bug Report template
   - Include browser version, OS, and specific error details

3. **Community Support:**
   - Check [GitHub Discussions](https://github.com/[diegopzz]/shieldeye/discussions)
   - Ask questions in the Q&A section

## 🔄 Updating

### Manual Updates (Development Installation)

1. **Git Update:**
   ```bash
   cd shieldeye
   git pull origin main
   ```

2. **Reload Extension:**
   - Go to your browser's extensions page
   - Find ShieldEye
   - Click the reload/refresh icon

3. **Verify Update:**
   - Open ShieldEye popup
   - Check version number in settings

### Automatic Updates (Store Installation - Future)

When available via browser stores, updates will be automatic.

## 🚫 Uninstalling

### Remove Extension

**Chrome/Edge/Opera:**
1. Go to extensions page (`chrome://extensions/`, `edge://extensions/`, etc.)
2. Find ShieldEye
3. Click "Remove" button
4. Confirm removal

### Clean Up Data

Extension data is automatically removed when uninstalling. However, if you want to manually clear data:

**Chrome:**
1. Go to `chrome://settings/content/cookies`
2. Search for "chrome-extension"
3. Remove any ShieldEye-related entries

**Edge:**
1. Go to `edge://settings/content/cookies`
2. Search for "extension"
3. Remove any ShieldEye-related entries

## 📱 Mobile Support

ShieldEye is currently not supported on mobile browsers due to extension API limitations. Mobile support may be considered for future versions.

## 🔒 Security Notes

- **Local Processing**: All detection happens locally on your device
- **No Data Collection**: ShieldEye doesn't send any data to external servers
- **Privacy First**: Your browsing data remains private
- **Open Source**: Full code is available for security auditing

## 📋 System Requirements

### Minimum Requirements
- RAM: 2GB available
- Disk Space: 50MB free space
- Internet: Required for initial download and updates

### Recommended Requirements
- RAM: 4GB+ available
- Disk Space: 100MB+ free space
- Internet: Stable connection for real-time detection

---

## 🆘 Need Help?

- 📖 **Documentation**: Check the [README](README.md) and [Wiki](https://github.com/[diegopzz]/shieldeye/wiki)
- 🐛 **Bug Reports**: Use [GitHub Issues](https://github.com/[diegopzz]/shieldeye/issues)
- 💬 **Discussions**: Join [GitHub Discussions](https://github.com/[diegopzz]/shieldeye/discussions)
- 🔒 **Security**: Review our [Security Policy](SECURITY.md)

---

**Happy Detecting! 🛡️**