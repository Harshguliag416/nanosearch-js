# Contributing to NanoSearch

Thank you for your interest in contributing to `NanoSearch`! We welcome contributions of all kinds, including bug fixes, feature requests, documentation improvements, and feedback.

## Getting Started

1. Fork the repository and clone it locally.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the tests to make sure everything works:
   ```bash
   npm run test
   ```

## Coding Standards

- Write clean, documented, and strongly typed TypeScript.
- Ensure type-checking passes: `npx tsc --noEmit`.
- Keep the core package size in mind; avoid adding external dependencies.

## Submitting Pull Requests

- Keep PRs focused on a single change.
- Make sure to add unit tests for any new features or bug fixes.
- Verify your changes by running formatting and the build command:
   ```bash
   npm run build
   ```
