# Contributing to ShieldEye

First off, thank you for considering contributing to ShieldEye! It's people like you that make ShieldEye such a great tool.

## Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Show empathy towards other community members

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and expected**
- **Include screenshots if possible**
- **Include your browser version and OS**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Provide specific examples to demonstrate the steps**
- **Describe the current behavior and expected behavior**
- **Explain why this enhancement would be useful**

### Adding New Detectors

1. **Research the service you want to detect:**
   - Identify unique cookies, headers, scripts, or DOM elements
   - Test on multiple sites using the service
   - Document detection patterns

2. **Create the detector file:**
   ```json
   {
     "id": "service-name",
     "name": "Service Display Name",
     "category": "Anti-Bot|CAPTCHA|WAF|Fingerprinting",
     "confidence": 100,
     "website": "https://service-website.com",
     "icon": "service.png",
     "detection": {
       "cookies": [
         {"name": "cookie_pattern", "confidence": 90}
       ],
       "headers": [
         {"name": "X-Header", "value": "pattern", "confidence": 95}
       ],
       "urls": [
         {"pattern": "service.js", "confidence": 85}
       ],
       "scripts": [
         {"content": "unique_function", "confidence": 80}
       ]
     }
   }
   ```

3. **Test thoroughly:**
   - Test on sites known to use the service
   - Verify no false positives
   - Check confidence scoring

4. **Submit a pull request**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Ensure your code follows the existing style
4. Test your changes thoroughly
5. Update documentation if needed
6. Submit the pull request

## Development Setup

```bash
# Clone your fork
git clone https://github.com/[diegopzz]/shieldeye.git
cd shieldeye/ShieldEye

# Load in browser for testing
# Chrome: chrome://extensions/
# Enable Developer mode → Load unpacked → Select folder

# Validate JavaScript syntax
node -c *.js
node -c modules/*.js

# Test on various websites
# Visit sites with known security services
```

## Style Guide

### JavaScript
- Use ES6+ features
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused
- Use async/await over callbacks

### JSON (Detectors)
- Use 2-space indentation
- Keep detection patterns specific
- Document confidence reasoning
- Test patterns thoroughly

### Commit Messages
- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit first line to 72 characters
- Reference issues and pull requests

## Testing

### Manual Testing
1. Load the extension in developer mode
2. Visit test sites with known services
3. Verify detection accuracy
4. Check for console errors
5. Test all UI features

### Test Sites
- **reCAPTCHA**: https://www.google.com/recaptcha/api2/demo
- **Cloudflare**: Any site behind Cloudflare
- **DataDome**: https://datadome.co/
- **Custom**: Use the included test-recaptcha.html

## Documentation

- Update README.md for new features
- Document new detectors in wiki
- Add inline comments for complex code
- Update CHANGELOG.md

## Questions?

Feel free to open an issue with the label "question" or start a discussion in the GitHub Discussions tab.

Thank you for contributing! 🎉