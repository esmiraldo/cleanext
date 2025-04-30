# Unused Detector

A simple tool to detect unimported components, files, and functions in your JavaScript/TypeScript project.

## Installation

\`\`\`bash
npm install -g unused-detector
# or
yarn global add unused-detector
\`\`\`

## Usage

### Command Line

\`\`\`bash
# Scan the current directory
unused-detector

# Scan a specific directory
unused-detector ./src

# Ignore specific patterns
unused-detector ./src --ignore "**/*.test.ts" "**/*.stories.tsx"
\`\`\`

### Programmatic Usage

\`\`\`javascript
import { detectUnused } from 'unused-detector';

async function analyze() {
  const result = await detectUnused('./src', ['**/*.test.ts']);
  console.log('Unused exports:', result.unusedExports);
}

analyze();
\`\`\`

## How It Works

Unused Detector scans your JavaScript and TypeScript files to:

1. Find all exported functions, classes, and variables
2. Find all imports across your codebase
3. Compare the two to identify exports that are never imported

This helps you identify dead code that can be safely removed.

## Limitations

- The tool doesn't track dynamic imports (`import()`)
- It may not detect imports that use string manipulation or complex patterns
- It doesn't track usage through re-exports

## License

MIT
