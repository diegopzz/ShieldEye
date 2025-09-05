# 🛡️ ShieldEye - Web Security Detection Extension

<div align="center">
  <img src="core/icons/icon128.png" alt="ShieldEye Logo" width="128">
  
  [![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://github.com/diegopzz/shieldeye)
  [![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
  [![Chrome](https://img.shields.io/badge/chrome-extension-orange.svg)](https://chrome.google.com)
  [![Edge](https://img.shields.io/badge/edge-compatible-blue.svg)](https://microsoftedge.microsoft.com)
  [![Security](https://img.shields.io/badge/security-policy-red.svg)](docs/docs/SECURITY.md)
</div>

## 📸 Screenshots

  <table>
    <tr>
      <td width="50%">
        <h3 align="center">Detection Overview</h3>
      <img width="456" height="400" alt="image" src="https://github.com/user-attachments/assets/ccefd4dd-c7de-4182-9e14-2bbe7b167f62" />
      </td>
            <td width="50%">
        <h3 align="center">Advanced</h3>
        <img width="456" height="400" alt="image" src="https://github.com/user-attachments/assets/0f838aee-f476-4667-b599-9117b59a079f" />
      </td>
    </tr>
    <tr>
      <td width="50%">
        <h3 align="center">History Tracking</h3>
   <img width="456" height="400" alt="image" src="https://github.com/user-attachments/assets/373f4fe5-d85a-4ae5-837b-1a14821ef872" />
      </td>
      <td width="50%">
        <h3 align="center">Rules Management</h3>
        <img width="456" height="400" alt="image" src="https://github.com/user-attachments/assets/7423fdf7-4d33-4020-8120-7480111b41a5" />
      </td>
    </tr>
  </table>

## 🎯 Overview

ShieldEye is an open-source browser extension that detects and analyzes anti-bot solutions, CAPTCHA services, and security mechanisms on websites. Similar to Wappalyzer but specialized for security detection, ShieldEye helps developers, security researchers, and automation specialists understand the protection layers implemented on web applications.

## ✨ Key Features

### 🔍 Detection Capabilities
- **35+ Detection Systems**: Identifies major security solutions including:
  - **Anti-Bot Services**: Akamai, Cloudflare, DataDome, PerimeterX, Incapsula
  - **CAPTCHA Services**: reCAPTCHA (v2/v3/Enterprise), hCaptcha, FunCaptcha, GeeTest
  - **Fingerprinting Detection**: Canvas, WebGL, and Audio fingerprinting
  - **WAF Solutions**: Various Web Application Firewalls

### 📊 Advanced Analysis
- **Confidence Scoring**: Each detection includes a confidence percentage
- **Multi-Layer Detection**: Analyzes cookies, headers, scripts, and DOM elements
- **Real-Time Monitoring**: Continuous page monitoring
- **Parameter Capture**: Soon

### 🎨 User Experience
- **Dark/Light Theme**: Automatic theme detection
- **Tabbed Interface**: Organized sections for different features
- **Visual Indicators**: Badge counter shows active detections
- **History Tracking**: Keep track of detected services across sites
- **Custom Rules**: Create your own detection patterns

## 🚀 Quick Start

### Installation

For detailed installation instructions, see [docs/INSTALLATION.md](docs/INSTALLATION.md).

**Quick Setup:**
1. Download https://github.com/diegopzz/ShieldEye/releases/tag/RELEASE

2. **Load in Chrome/Edge:**
   - Navigate to `chrome://extensions/` or `edge://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
      Navigate to and select the `ShieldEye` folder from the downloaded repository, then select Core folder

3. **Start detecting:**
   - Click the ShieldEye icon in your toolbar
   - Navigate to any website
   - View detected security services instantly!

## 📁 Project Structure

```
ShieldEye/
├── core/                     # Extension core files
│   ├── manifest.json        # Extension configuration
│   ├── background.js        # Service worker for network monitoring
│   ├── content.js          # Page analysis script
│   ├── popup.html/js/css   # Extension UI
│   ├── detectors/          # Detection configurations
│   │   ├── anti-bot/      # Anti-bot detectors
│   │   ├── captcha/       # CAPTCHA detectors
│   │   └── fingerprinting/# Fingerprinting detectors
│   ├── icons/             # Extension icons
│   ├── modules/           # Additional modules
│   └── scripts/           # Helper scripts
├── docs/                    # Documentation
│   ├── INSTALLATION.md    # Installation guide
│   └── SECURITY.md        # Security policy
├── .github/               # GitHub templates
│   ├── ISSUE_TEMPLATE/   # Issue templates
│   └── pull_request_template.md
├── README.md             # This file
├── CONTRIBUTING.md       # Contributing guidelines
└── LICENSE              # MIT License
```

## 🔧 How It Works

ShieldEye uses multiple detection methods:

1. **Cookie Analysis**: Checks for security-related cookies
2. **Header Inspection**: Monitors HTTP response headers
3. **Script Detection**: Identifies security service scripts
4. **DOM Analysis**: Searches for CAPTCHA and security elements
5. **Network Monitoring**: Tracks requests to security services

## 💡 Usage Examples

### Basic Detection
Simply navigate to any website with the extension installed. Detected services appear in the popup with confidence scores.

### Advanced Capture Mode
Coming soon!

### Custom Rules
Create custom detection rules for services not yet supported:
1. Go to Rules tab
2. Click "Add Rule"
3. Define patterns for cookies, headers, or scripts
4. Save and test on target sites

## 🛠️ Development

### Adding New Detectors

1. Create a JSON file in `detectors/[category]/`:
```json
{
  "id": "service-name",
  "name": "Service Name",
  "category": "Anti-Bot",
  "confidence": 100,
  "detection": {
    "cookies": [{"name": "cookie_name", "confidence": 90}],
    "headers": [{"name": "X-Protected-By", "value": "ServiceName"}],
    "urls": [{"pattern": "service.js", "confidence": 85}]
  }
}
```

2. Register in `detectors/index.json`
3. Test on real websites

### Building from Source

```bash
# No build step required - pure JavaScript
# Just load the unpacked extension in your browser

# Optional: Validate files
node -c background.js
node -c content.js
node -c popup.js
```

## 🔒 Privacy & Security

- **No data collection**: All processing happens locally
- **No external requests**: No telemetry or analytics
- **Local storage only**: Your data stays on your device
- **Open source**: Fully auditable code

### Required Permissions

- `<all_urls>`: To analyze any website
- `cookies`: To detect security cookies
- `webRequest`: To monitor network headers
- `storage`: To save settings and history
- `tabs`: To manage per-tab detection

## 🤝 Contributing

We welcome contributions! Here's how to help:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-detection`)
3. Commit your changes (`git commit -m 'Add amazing detection'`)
4. Push to the branch (`git push origin feature/amazing-detection`)
5. Open a Pull Request

### Contribution Ideas

- Add new service detectors
- Improve detection accuracy
- Enhance UI/UX
- Add documentation
- Report bugs
- Suggest features

## 📊 Supported Services

### Currently Detected (16+)

**Anti-Bot**: Akamai, Cloudflare, DataDome, PerimeterX, Incapsula, Reblaze, F5

**CAPTCHA**: reCAPTCHA, hCaptcha, FunCaptcha/Arkose, GeeTest, Cloudflare Turnstile

**WAF**: AWS WAF, Cloudflare WAF, Sucuri, Imperva

**Fingerprinting**: Canvas, WebGL, Audio, Font detection

## 🐛 Known Issues

- Some services may require page refresh for detection
- Detection accuracy varies by implementation

## 📚 Resources

- [Installation Guide](docs/INSTALLATION.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Security Policy](docs/SECURITY.md)

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Inspired by [Wappalyzer](https://www.wappalyzer.com/)
- Detection techniques from various security research
- Open source community contributions

## 📧 Support

- **Issues**: [GitHub Issues](https://github.com/diegopzz/shieldeye/issues)
- **Security**: [Security Policy](docs/SECURITY.md)

---

<div align="center">
  Made with ❤️ by the open source community
  
  ⭐ Star us on GitHub!
</div>
