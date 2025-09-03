---
name: New Detector Request
about: Request detection support for a new anti-bot or CAPTCHA service
title: '[DETECTOR] Add support for [Service Name]'
labels: ['detector', 'enhancement']
assignees: ''

---

## Service Information
- **Service Name**: [e.g. NewBot Pro]
- **Company/Provider**: [e.g. Security Corp]
- **Service Website**: [URL if available]
- **Service Category**: [Anti-Bot / CAPTCHA / WAF / CDN / Fingerprinting]

## Detection Evidence
Please provide evidence that this service exists and should be detected:

### Test URLs
List 3-5 websites that use this service:
- [ ] https://example1.com - [Brief description]
- [ ] https://example2.com - [Brief description]
- [ ] https://example3.com - [Brief description]

### Detection Patterns Found
What patterns have you identified? (Check all that apply and provide details)

#### Cookies
- [ ] Service sets specific cookies
- **Cookie Names**: [e.g. _security_token, antibot_session]
- **Cookie Values/Patterns**: [Any specific patterns in values]

#### HTTP Headers
- [ ] Service adds specific response headers
- **Header Names**: [e.g. X-AntiBot, X-Security-Check]
- **Header Values**: [Typical values or patterns]

#### JavaScript/Scripts
- [ ] Service loads specific JavaScript files
- **Script URLs**: [e.g. cdn.security-service.com/antibot.js]
- **Script Content**: [Unique function names, variables, or code patterns]

#### DOM Elements
- [ ] Service creates specific HTML elements
- **Element Types**: [div, iframe, script, etc.]
- **Classes/IDs**: [Specific CSS classes or IDs]
- **Attributes**: [data-*, src patterns, etc.]

#### Network Requests
- [ ] Service makes requests to specific domains
- **Domains**: [e.g. api.security-service.com, challenge.antibot.net]
- **URL Patterns**: [Common patterns in request URLs]

## Additional Information

### Service Behavior
- How does the service work? [Challenge page, invisible check, etc.]
- When does it trigger? [On page load, form submit, suspicious activity]
- What does users see? [CAPTCHA, waiting page, transparent]

### False Positive Considerations
- Are there any common patterns that might cause false positives?
- Any legitimate services that might have similar signatures?

### Priority/Impact
- How common is this service?
- Why is detecting it important?
- Any specific use cases that would benefit?

### Research/Analysis Done
- [ ] I have tested multiple sites using this service
- [ ] I have analyzed network traffic
- [ ] I have examined page source code
- [ ] I have documented detection patterns
- [ ] I am willing to help test the implementation

## Proposed Detection Rules
If you have ideas for the detection JSON structure:

```json
{
  "id": "service-name",
  "name": "Service Name",
  "category": "Anti-Bot",
  "confidence": 100,
  "website": "https://service-website.com",
  "detection": {
    "cookies": [
      {"name": "cookie_name", "confidence": 90}
    ],
    "headers": [
      {"name": "X-Header", "value": "pattern", "confidence": 95}
    ],
    "urls": [
      {"pattern": "service.js", "confidence": 85}
    ]
  }
}
```

---

### Checklist
- [ ] I have provided test URLs where this service can be found
- [ ] I have identified specific detection patterns
- [ ] I have verified this service is not already detected by ShieldEye
- [ ] I am willing to help test the implementation
- [ ] I understand this may take time to research and implement