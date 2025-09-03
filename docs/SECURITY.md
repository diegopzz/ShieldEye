# Security Policy

## Supported Versions

We actively support the following versions of ShieldEye with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take the security of ShieldEye seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by:

1. **Email**: Send an email to the project maintainers with details of the vulnerability
2. **GitHub Security Advisory**: Use GitHub's private vulnerability reporting feature
3. **Direct Message**: Contact maintainers directly through GitHub

### What to Include

When reporting a vulnerability, please include as much of the following information as possible:

- **Type of issue** (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- **Full paths** of source file(s) related to the manifestation of the issue
- **Location** of the affected source code (tag/branch/commit or direct URL)
- **Special configuration** required to reproduce the issue
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact** of the issue, including how an attacker might exploit it

### Response Timeline

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Status Updates**: We will keep you informed of our progress throughout the process
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Safe Harbor

We support safe harbor for security researchers who:

- Make a good faith effort to avoid privacy violations, destruction of data, and disruption of our services
- Only interact with accounts you own or with explicit permission of the account holder
- Do not access a system beyond what is necessary to demonstrate the vulnerability
- Report the vulnerability as soon as possible after discovery
- Do not violate any law or breach any agreement

### Responsible Disclosure

- We request that you give us reasonable time to investigate and address the vulnerability before making any information public
- We will work with you to ensure we understand the issue fully
- We will credit you for the discovery (unless you prefer to remain anonymous)
- We may release a security advisory once the issue is resolved

## Security Features

ShieldEye is designed with security and privacy in mind:

### Data Protection
- **Local Processing**: All detection and analysis happens locally on your device
- **No External Requests**: Extension doesn't send data to external servers
- **No Telemetry**: We don't collect analytics or usage statistics
- **Local Storage**: All user data remains on the user's device

### Extension Security
- **Minimal Permissions**: We request only the permissions necessary for functionality
- **Content Security Policy**: Proper CSP implementation to prevent XSS
- **Input Validation**: All user inputs are validated and sanitized
- **Safe DOM Manipulation**: Careful handling of dynamic content

### Code Security
- **Open Source**: Full source code available for security auditing
- **Regular Reviews**: Code is regularly reviewed for security issues
- **Dependency Management**: Minimal external dependencies, regularly updated
- **Static Analysis**: Code is analyzed for common security vulnerabilities

## Security Best Practices for Users

To use ShieldEye securely:

1. **Download from Official Sources**: Only install from official browser extension stores or verified repositories
2. **Keep Updated**: Always use the latest version with security patches
3. **Review Permissions**: Understand what permissions the extension requests
4. **Report Issues**: Report any suspicious behavior or potential vulnerabilities
5. **Use Official Repositories**: Only trust official ShieldEye repositories and releases

## Security Considerations

### Detected Service Data
- ShieldEye identifies security services but doesn't interact with them maliciously
- Detection data is stored locally and not transmitted externally
- Users can export their own detection data but should handle it responsibly

### Parameter Capture
- The parameter capture feature is intended for legitimate security research and automation
- Users are responsible for complying with website terms of service
- Captured data should be handled securely and not shared inappropriately

### Custom Rules
- Custom detection rules run locally and don't affect website functionality
- Rules should be created responsibly and not used for malicious purposes
- Sharing custom rules should follow responsible disclosure practices

## Contact

For security-related questions or concerns that are not vulnerabilities, please:

- Open a GitHub issue with the "security" label
- Start a discussion in the GitHub Discussions section
- Contact maintainers directly for sensitive inquiries

## Acknowledgments

We appreciate the security community's efforts in making ShieldEye more secure. Security researchers who responsibly disclose vulnerabilities will be credited in our security advisories and release notes (unless they prefer to remain anonymous).

---

*This security policy is based on industry best practices and will be updated as needed to reflect our evolving security posture.*