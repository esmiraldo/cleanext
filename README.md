# CleanExt - Advanced Code Cleanup Tool

An advanced tool to detect and clean unimported components, files, functions, and unused npm packages in your JavaScript/TypeScript project.
[![npm version](https://img.shields.io/npm/v/cleanext?color=61dafb&logo=npm&label=Latest)](https://www.npmjs.com/package/cleanext)
[![npm downloads](https://img.shields.io/npm/dm/cleanext?color=4BC51D&logo=npm&label=Downloads)](https://npm-stat.com/charts.html?package=cleanext)
[![Node.js](https://img.shields.io/badge/Node.js-≥14.0.0-339933?logo=node.js)](package.json)
## Features

> - 🔍 detects unused exports (functions, components, variables)
- 📁 identifies files that are not imported anywhere
- 📦 finds npm packages that are installed but not used
- 🧹 provides options to clean up unused files
- 🗑️ can uninstall unused npm packages
- 🖱️ interactive mode for selective cleanup
- 🎨 **new: fully interactive ui with menus and visualizations**
- 👁️ file preview functionality
- 🌈 colorful and formatted output
- 💾 export results in multiple formats (json, markdown, html)
- 🔄 json output for integration with other tools

## Installation

#### # Install globally
`npm install -g cleanext`

#### # Or use without installation
`npx cleanext
`

## Usage

### Basic Usage

#### # Scan the current directory
`cleanext`

#### # Scan a specific directory
`cleanext ./src
`

### Interactive Mode

#### # Launch the fully interactive UI
`cleanext --fully-interactive
`
#### # Or use the short flag
`cleanext -fi
`

The interactive UI provides:
- A user-friendly menu system
- Colorful and formatted output
- File preview functionality
- Interactive file and package selection
- Multiple export formats (JSON, Markdown, HTML)

### Advanced Options

#### # Ignore specific patterns
`cleanext --ignore "**/*.stories.tsx" "**/*.test.js"
`
#### # Clean up unused files
`cleanext --clean
`
#### # Uninstall unused packages
`cleanext --uninstall
`
#### # Interactive mode for selective cleanup
`cleanext --interactive --clean --uninstall
`
#### # Skip specific checks
`cleanext --skip-files --skip-packages
`
#### # Output results as JSON
`cleanext --json
`
#### # Save results to a file
`cleanext --output results.json
`

### Running Without npm Installation


#### # Clone the repository
`git clone https://github.com/esmiraldo/cleanext.git
cd cleanext`

#### # Install dependencies
`npm install
`
#### # Build the TypeScript code
`npm run build
`
#### # Run the tool
`node dist/cli.js ./your-project-directory
`
#### # Or run in interactive mode
`node dist/cli.js --fully-interactive
`

#### ## How It Works

CleanExt scans your JavaScript and TypeScript files to:

1. Find all exported functions, classes, and variables
2. Find all imports across your codebase
3. Compare the two to identify exports that are never imported
4. Identify files that are not imported anywhere
5. Check package.json dependencies against actual imports
6. Provide options to clean up unused code and packages

#### ## Limitations

- The tool doesn't track dynamic imports (`import()`)
- It may not detect imports that use string manipulation or complex patterns
- It doesn't track usage through re-exports
- Some false positives may occur for entry point files or components used only in HTML

#### ## License

MIT
