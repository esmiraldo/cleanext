# CleanExt - Advanced Code Cleanup Tool

An advanced tool to detect and clean unimported components, files, functions, and unused npm packages in your JavaScript/TypeScript project.

## Features

- 🔍 Detects unused exports (functions, components, variables)
- 📁 Identifies files that are not imported anywhere
- 📦 Finds npm packages that are installed but not used
- 🧹 Provides options to clean up unused files
- 🗑️ Can uninstall unused npm packages
- 🖱️ Interactive mode for selective cleanup
- 🎨 **NEW: Fully interactive UI with menus and visualizations**
- 👁️ File preview functionality
- 🌈 Colorful and formatted output
- 💾 Export results in multiple formats (JSON, Markdown, HTML)
- 🔄 JSON output for integration with other tools

## Installation

# Install globally
npm install -g cleanext

# Or use without installation
npx cleanext


## Usage

### Basic Usage

# Scan the current directory
cleanext

# Scan a specific directory
cleanext ./src


### Interactive Mode

# Launch the fully interactive UI
cleanext --fully-interactive

# Or use the short flag
cleanext -fi


The interactive UI provides:
- A user-friendly menu system
- Colorful and formatted output
- File preview functionality
- Interactive file and package selection
- Multiple export formats (JSON, Markdown, HTML)

### Advanced Options

# Ignore specific patterns
cleanext --ignore "**/*.stories.tsx" "**/*.test.js"

# Clean up unused files
cleanext --clean

# Uninstall unused packages
cleanext --uninstall

# Interactive mode for selective cleanup
cleanext --interactive --clean --uninstall

# Skip specific checks
cleanext --skip-files --skip-packages

# Output results as JSON
cleanext --json

# Save results to a file
cleanext --output results.json


### Running Without npm Installation


# Clone the repository
git clone https://github.com/esmiraldo/cleanext.git
cd cleanext

# Install dependencies
npm install

# Build the TypeScript code
npm run build

# Run the tool
node dist/cli.js ./your-project-directory

# Or run in interactive mode
node dist/cli.js --fully-interactive


## How It Works

CleanExt scans your JavaScript and TypeScript files to:

1. Find all exported functions, classes, and variables
2. Find all imports across your codebase
3. Compare the two to identify exports that are never imported
4. Identify files that are not imported anywhere
5. Check package.json dependencies against actual imports
6. Provide options to clean up unused code and packages

## Limitations

- The tool doesn't track dynamic imports (`import()`)
- It may not detect imports that use string manipulation or complex patterns
- It doesn't track usage through re-exports
- Some false positives may occur for entry point files or components used only in HTML

## License

MIT
