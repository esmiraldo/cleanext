import chalk from "chalk"
import inquirer from "inquirer"
import ora from "ora"
import Table from "cli-table3"
import boxen from "boxen"
import figures from "figures"
import { highlight } from "cli-highlight"
import fs from "fs"
import path from "path"
import { detectUnused, removeUnusedFiles, uninstallUnusedPackages } from "./index"
import type { DetectionResult, ExportInfo, PackageInfo } from "./index"

enum MainMenuOption {
  SCAN = "Scan for unused code",
  VIEW_RESULTS = "View detailed results",
  CLEAN_FILES = "Clean unused files",
  CLEAN_PACKAGES = "Uninstall unused packages",
  EXPORT_RESULTS = "Export results to file",
  EXIT = "Exit",
}

enum ResultsViewOption {
  EXPORTS = "View unused exports",
  FILES = "View unused files",
  PACKAGES = "View unused packages",
  BACK = "Back to main menu",
}

let currentResults: DetectionResult | null = null
let currentDirectory: string = process.cwd()
let scanOptions = {
  ignorePatterns: [] as string[],
  detectUnusedFiles: true,
  detectUnusedPackages: true,
}

function displayBanner() {
  const title = chalk.bold.greenBright("Unused Detector Advanced")
  const subtitle = chalk.yellowBright("Interactive Mode")

  console.log(
    boxen(`${title}\n${subtitle}`, {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "green",
    }),
  )
}

async function showMainMenu() {
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        {
          name: `${chalk.green(figures.play)} ${MainMenuOption.SCAN}`,
          value: MainMenuOption.SCAN,
        },
        {
          name: `${chalk.blue(figures.info)} ${MainMenuOption.VIEW_RESULTS}`,
          value: MainMenuOption.VIEW_RESULTS,
          disabled: !currentResults ? "Run a scan first" : false,
        },
        {
          name: `${chalk.yellow(figures.warning)} ${MainMenuOption.CLEAN_FILES}`,
          value: MainMenuOption.CLEAN_FILES,
          disabled: !currentResults || currentResults.unusedFiles.length === 0 ? "No unused files to clean" : false,
        },
        {
          name: `${chalk.yellow(figures.warning)} ${MainMenuOption.CLEAN_PACKAGES}`,
          value: MainMenuOption.CLEAN_PACKAGES,
          disabled:
            !currentResults || currentResults.unusedPackages.length === 0 ? "No unused packages to uninstall" : false,
        },
        {
          name: `${chalk.magenta(figures.arrowDown)} ${MainMenuOption.EXPORT_RESULTS}`,
          value: MainMenuOption.EXPORT_RESULTS,
          disabled: !currentResults ? "Run a scan first" : false,
        },
        new inquirer.Separator(),
        {
          name: `${chalk.red(figures.cross)} ${MainMenuOption.EXIT}`,
          value: MainMenuOption.EXIT,
        },
      ],
    },
  ])

  switch (action) {
    case MainMenuOption.SCAN:
      await handleScan()
      break
    case MainMenuOption.VIEW_RESULTS:
      await handleViewResults()
      break
    case MainMenuOption.CLEAN_FILES:
      await handleCleanFiles()
      break
    case MainMenuOption.CLEAN_PACKAGES:
      await handleCleanPackages()
      break
    case MainMenuOption.EXPORT_RESULTS:
      await handleExportResults()
      break
    case MainMenuOption.EXIT:
      console.log(chalk.green("Thanks for using Unused Detector Advanced!"))
      process.exit(0)
  }

  await showMainMenu()
}

async function handleScan() {
  const { directory, configureOptions } = await inquirer.prompt([
    {
      type: "input",
      name: "directory",
      message: "Enter the directory to scan:",
      default: currentDirectory,
    },
    {
      type: "confirm",
      name: "configureOptions",
      message: "Would you like to configure scan options?",
      default: false,
    },
  ])

  currentDirectory = directory

  if (configureOptions) {
    const { ignorePatterns, detectFiles, detectPackages } = await inquirer.prompt([
      {
        type: "input",
        name: "ignorePatterns",
        message: "Enter patterns to ignore (comma separated):",
        default: scanOptions.ignorePatterns.join(","),
        filter: (input) =>
          input
            .split(",")
            .map((p: string) => p.trim())
            .filter(Boolean),
      },
      {
        type: "confirm",
        name: "detectFiles",
        message: "Detect unused files?",
        default: scanOptions.detectUnusedFiles,
      },
      {
        type: "confirm",
        name: "detectPackages",
        message: "Detect unused packages?",
        default: scanOptions.detectUnusedPackages,
      },
    ])

    scanOptions = {
      ignorePatterns,
      detectUnusedFiles: detectFiles,
      detectUnusedPackages: detectPackages,
    }
  }

  const spinner = ora("Scanning for unused code...").start()

  try {
    currentResults = await detectUnused(currentDirectory, scanOptions)
    spinner.succeed("Scan completed successfully!")

    displayResultsSummary(currentResults)
  } catch (error) {
    spinner.fail(`Scan failed: ${error}`)
  }
}

function displayResultsSummary(results: DetectionResult) {
  console.log("\n")

  const summaryBox = boxen(
    chalk.bold.white("Scan Results Summary") +
      "\n\n" +
      `${chalk.blue("Files Scanned:")} ${results.totalFiles}\n` +
      `${chalk.blue("Exports Found:")} ${results.totalExports}\n` +
      `${chalk.blue("Imports Found:")} ${results.totalImports}\n\n` +
      `${chalk.yellow("Unused Exports:")} ${results.unusedExports.length}\n` +
      `${chalk.yellow("Unused Files:")} ${results.unusedFiles.length}\n` +
      `${chalk.yellow("Unused Packages:")} ${results.unusedPackages.length}`,
    {
      padding: 1,
      borderStyle: "round",
      borderColor: "blue",
    },
  )

  console.log(summaryBox)
}

async function handleViewResults() {
  if (!currentResults) {
    console.log(chalk.red("No scan results available. Please run a scan first."))
    return
  }

  const { view } = await inquirer.prompt([
    {
      type: "list",
      name: "view",
      message: "What would you like to view?",
      choices: [
        {
          name: `Unused Exports (${currentResults.unusedExports.length})`,
          value: ResultsViewOption.EXPORTS,
          disabled: currentResults.unusedExports.length === 0 ? "No unused exports found" : false,
        },
        {
          name: `Unused Files (${currentResults.unusedFiles.length})`,
          value: ResultsViewOption.FILES,
          disabled: currentResults.unusedFiles.length === 0 ? "No unused files found" : false,
        },
        {
          name: `Unused Packages (${currentResults.unusedPackages.length})`,
          value: ResultsViewOption.PACKAGES,
          disabled: currentResults.unusedPackages.length === 0 ? "No unused packages found" : false,
        },
        new inquirer.Separator(),
        {
          name: "Back to main menu",
          value: ResultsViewOption.BACK,
        },
      ],
    },
  ])

  switch (view) {
    case ResultsViewOption.EXPORTS:
      displayUnusedExports(currentResults.unusedExports)
      break
    case ResultsViewOption.FILES:
      await displayUnusedFiles(currentResults.unusedFiles)
      break
    case ResultsViewOption.PACKAGES:
      displayUnusedPackages(currentResults.unusedPackages)
      break
    case ResultsViewOption.BACK:
      return
  }
}

function displayUnusedExports(unusedExports: ExportInfo[]) {
  if (unusedExports.length === 0) {
    console.log(chalk.green("No unused exports found!"))
    return
  }

  const table = new Table({
    head: [chalk.white.bold("Export Name"), chalk.white.bold("File Path")],
    colWidths: [30, 50],
  })

  unusedExports.forEach((exp) => {
    table.push([chalk.yellow(exp.name), chalk.blue(exp.filePath)])
  })

  console.log("\n" + chalk.bold.white("Unused Exports:"))
  console.log(table.toString())

  console.log(chalk.dim("\nPress any key to continue..."))
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false)
  })
}

async function displayUnusedFiles(unusedFiles: string[]) {
  if (unusedFiles.length === 0) {
    console.log(chalk.green("No unused files found!"))
    return
  }

  const table = new Table({
    head: [chalk.white.bold("#"), chalk.white.bold("File Path")],
    colWidths: [5, 75],
  })

  unusedFiles.forEach((file, index) => {
    table.push([chalk.yellow((index + 1).toString()), chalk.blue(file)])
  })

  console.log("\n" + chalk.bold.white("Unused Files:"))
  console.log(table.toString())

  const { previewFile } = await inquirer.prompt([
    {
      type: "confirm",
      name: "previewFile",
      message: "Would you like to preview any of these files?",
      default: false,
    },
  ])

  if (previewFile) {
    await handleFilePreview(unusedFiles)
  }
}


async function handleFilePreview(files: string[]) {
  const { fileIndex } = await inquirer.prompt([
    {
      type: "list",
      name: "fileIndex",
      message: "Select a file to preview:",
      choices: files.map((file, index) => ({
        name: file,
        value: index,
      })),
    },
  ])

  const filePath = path.join(currentDirectory, files[fileIndex])

  try {
    const content = fs.readFileSync(filePath, "utf-8")
    const fileExtension = path.extname(filePath).substring(1)

    console.log("\n" + chalk.bold.white(`Preview of ${files[fileIndex]}:`))
    console.log(
      boxen(
        highlight(content.substring(0, 1000) + (content.length > 1000 ? "..." : ""), {
          language: fileExtension || "plaintext",
          theme: {
            keyword: chalk.blue,
            built_in: chalk.cyan,
            string: chalk.green,
            number: chalk.yellow,
            comment: chalk.gray,
          },
        }),
        { padding: 1, borderColor: "blue" },
      ),
    )

    const { previewAnother } = await inquirer.prompt([
      {
        type: "confirm",
        name: "previewAnother",
        message: "Would you like to preview another file?",
        default: false,
      },
    ])

    if (previewAnother) {
      await handleFilePreview(files)
    }
  } catch (error) {
    console.error(chalk.red(`Error reading file: ${error}`))
  }
}

function displayUnusedPackages(unusedPackages: PackageInfo[]) {
  if (unusedPackages.length === 0) {
    console.log(chalk.green("No unused packages found!"))
    return
  }

  const table = new Table({
    head: [chalk.white.bold("Package Name"), chalk.white.bold("Version")],
    colWidths: [40, 20],
  })

  unusedPackages.forEach((pkg) => {
    table.push([chalk.yellow(pkg.name), chalk.blue(pkg.version)])
  })

  console.log("\n" + chalk.bold.white("Unused Packages:"))
  console.log(table.toString())

  console.log(chalk.dim("\nPress any key to continue..."))
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false)
  })
}

async function handleCleanFiles() {
  if (!currentResults || currentResults.unusedFiles.length === 0) {
    console.log(chalk.yellow("No unused files to clean."))
    return
  }

  const { selectedFiles } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedFiles",
      message: "Select files to remove:",
      choices: currentResults.unusedFiles.map((file) => ({
        name: file,
        value: file,
      })),
      pageSize: 15,
    },
  ])

  if (selectedFiles.length === 0) {
    console.log(chalk.yellow("No files selected for removal."))
    return
  }

  const { confirmRemove } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmRemove",
      message: `Are you sure you want to remove ${selectedFiles.length} file(s)?`,
      default: false,
    },
  ])

  if (confirmRemove) {
    const spinner = ora("Removing files...").start()

    try {
      const removedFiles = removeUnusedFiles(currentDirectory, selectedFiles)
      spinner.succeed(`Successfully removed ${removedFiles.length} file(s).`)

      // Update current results
      if (currentResults) {
        currentResults.unusedFiles = currentResults.unusedFiles.filter((file) => !selectedFiles.includes(file))
      }
    } catch (error) {
      spinner.fail(`Error removing files: ${error}`)
    }
  }
}

async function handleCleanPackages() {
  if (!currentResults || currentResults.unusedPackages.length === 0) {
    console.log(chalk.yellow("No unused packages to uninstall."))
    return
  }

  const { selectedPackages } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedPackages",
      message: "Select packages to uninstall:",
      choices: currentResults.unusedPackages.map((pkg) => ({
        name: `${pkg.name}@${pkg.version}`,
        value: pkg,
      })),
      pageSize: 15,
    },
  ])

  if (selectedPackages.length === 0) {
    console.log(chalk.yellow("No packages selected for uninstallation."))
    return
  }

  const { confirmUninstall } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmUninstall",
      message: `Are you sure you want to uninstall ${selectedPackages.length} package(s)?`,
      default: false,
    },
  ])

  if (confirmUninstall) {
    const spinner = ora("Uninstalling packages...").start()

    try {
      const removedPackages = uninstallUnusedPackages(currentDirectory, selectedPackages)
      spinner.succeed(`Successfully uninstalled ${removedPackages.length} package(s).`)

      if (currentResults) {
        const removedPackageNames = new Set(removedPackages)
        currentResults.unusedPackages = currentResults.unusedPackages.filter(
          (pkg) => !removedPackageNames.has(pkg.name),
        )
      }
    } catch (error) {
      spinner.fail(`Error uninstalling packages: ${error}`)
    }
  }
}

async function handleExportResults() {
  if (!currentResults) {
    console.log(chalk.red("No scan results available. Please run a scan first."))
    return
  }

  const { format, filename } = await inquirer.prompt([
    {
      type: "list",
      name: "format",
      message: "Select export format:",
      choices: [
        { name: "JSON", value: "json" },
        { name: "Markdown", value: "md" },
        { name: "HTML", value: "html" },
      ],
    },
    {
      type: "input",
      name: "filename",
      message: "Enter filename:",
      default: (answers: { format: string }) => `unused-detector-results.${answers.format}`,
    },
  ])

  const spinner = ora(`Exporting results to ${filename}...`).start()

  try {
    let content = ""

    switch (format) {
      case "json":
        content = JSON.stringify(currentResults, null, 2)
        break
      case "md":
        content = generateMarkdownReport(currentResults)
        break
      case "html":
        content = generateHtmlReport(currentResults)
        break
    }

    fs.writeFileSync(path.join(process.cwd(), filename), content)
    spinner.succeed(`Results exported to ${filename}`)
  } catch (error) {
    spinner.fail(`Error exporting results: ${error}`)
  }
}

function generateMarkdownReport(results: DetectionResult): string {
  return `# Unused Detector Results

## Summary

- **Files Scanned:** ${results.totalFiles}
- **Exports Found:** ${results.totalExports}
- **Imports Found:** ${results.totalImports}
- **Unused Exports:** ${results.unusedExports.length}
- **Unused Files:** ${results.unusedFiles.length}
- **Unused Packages:** ${results.unusedPackages.length}

## Unused Exports

${
  results.unusedExports.length === 0
    ? "No unused exports found."
    : results.unusedExports.map((exp) => `- **${exp.name}** in \`${exp.filePath}\``).join("\n")
}

## Unused Files

${
  results.unusedFiles.length === 0
    ? "No unused files found."
    : results.unusedFiles.map((file) => `- \`${file}\``).join("\n")
}

## Unused Packages

${
  results.unusedPackages.length === 0
    ? "No unused packages found."
    : results.unusedPackages.map((pkg) => `- **${pkg.name}** (${pkg.version})`).join("\n")
}

---
Generated by Unused Detector Advanced on ${new Date().toLocaleString()}
`
}

function generateHtmlReport(results: DetectionResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unused Detector Results</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2 {
      color: #2c3e50;
    }
    .summary {
      background-color: #f8f9fa;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .summary-item {
      display: inline-block;
      margin-right: 20px;
      margin-bottom: 10px;
    }
    .summary-label {
      font-weight: bold;
      color: #6c757d;
    }
    .summary-value {
      font-size: 1.2em;
      font-weight: bold;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f2f2f2;
    }
    .empty-message {
      color: #28a745;
      font-style: italic;
    }
    .footer {
      margin-top: 30px;
      color: #6c757d;
      font-size: 0.9em;
      border-top: 1px solid #ddd;
      padding-top: 10px;
    }
  </style>
</head>
<body>
  <h1>Unused Detector Results</h1>
  
  <div class="summary">
    <div class="summary-item">
      <div class="summary-label">Files Scanned</div>
      <div class="summary-value">${results.totalFiles}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Exports Found</div>
      <div class="summary-value">${results.totalExports}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Imports Found</div>
      <div class="summary-value">${results.totalImports}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Unused Exports</div>
      <div class="summary-value">${results.unusedExports.length}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Unused Files</div>
      <div class="summary-value">${results.unusedFiles.length}</div>
    </div>
    <div class="summary-item">
      <div class="summary-label">Unused Packages</div>
      <div class="summary-value">${results.unusedPackages.length}</div>
    </div>
  </div>
  
  <h2>Unused Exports</h2>
  ${
    results.unusedExports.length === 0
      ? '<p class="empty-message">No unused exports found.</p>'
      : `<table>
      <thead>
        <tr>
          <th>Export Name</th>
          <th>File Path</th>
        </tr>
      </thead>
      <tbody>
        ${results.unusedExports
          .map(
            (exp) =>
              `<tr>
            <td>${exp.name}</td>
            <td>${exp.filePath}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
  }
  
  <h2>Unused Files</h2>
  ${
    results.unusedFiles.length === 0
      ? '<p class="empty-message">No unused files found.</p>'
      : `<table>
      <thead>
        <tr>
          <th>File Path</th>
        </tr>
      </thead>
      <tbody>
        ${results.unusedFiles
          .map(
            (file) =>
              `<tr>
            <td>${file}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
  }
  
  <h2>Unused Packages</h2>
  ${
    results.unusedPackages.length === 0
      ? '<p class="empty-message">No unused packages found.</p>'
      : `<table>
      <thead>
        <tr>
          <th>Package Name</th>
          <th>Version</th>
        </tr>
      </thead>
      <tbody>
        ${results.unusedPackages
          .map(
            (pkg) =>
              `<tr>
            <td>${pkg.name}</td>
            <td>${pkg.version}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
  }
  
  <div class="footer">
    Generated by Unused Detector Advanced on ${new Date().toLocaleString()}
  </div>
</body>
</html>`
}

export async function startInteractiveCLI() {
  displayBanner()
  await showMainMenu()
}
