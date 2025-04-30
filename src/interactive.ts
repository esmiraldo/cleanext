import chalk from "chalk"
import inquirer from "inquirer"
import Table from "cli-table3"
import boxen from "boxen"
import figures from "figures"
import { highlight } from "cli-highlight"
import fs from "fs"
import path from "path"
import { detectUnused, removeUnusedFiles, uninstallUnusedPackages } from "./index"
import type { DetectionResult, ExportInfo, PackageInfo, FileStats } from "./index"
import gradient from "gradient-string"
import { SingleBar, Presets } from "cli-progress"
import Conf from "conf"

// Register the autocomplete prompt
import inquirerAutocomplete from "inquirer-autocomplete-prompt"
inquirer.registerPrompt("autocomplete", inquirerAutocomplete)

// Create a config store for saving preferences
const config = new Conf({
  projectName: "cleanext",
  defaults: {
    recentDirectories: [],
    defaultIgnorePatterns: [],
    theme: "default",
  },
})

// Main menu options
enum MainMenuOption {
  SCAN = "Scan for unused code",
  VIEW_RESULTS = "View detailed results",
  CLEAN_FILES = "Clean unused files",
  CLEAN_PACKAGES = "Uninstall unused packages",
  EXPORT_RESULTS = "Export results to file",
  SETTINGS = "Settings",
  EXIT = "Exit",
}

// Results view options
enum ResultsViewOption {
  EXPORTS = "View unused exports",
  FILES = "View unused files",
  PACKAGES = "View unused packages",
  STATS = "View file statistics",
  BACK = "Back to main menu",
}

// Settings options
enum SettingsOption {
  IGNORE_PATTERNS = "Configure ignore patterns",
  THEME = "Change theme",
  CLEAR_HISTORY = "Clear recent directories",
  BACK = "Back to main menu",
}

// Theme options
enum ThemeOption {
  DEFAULT = "Default",
  OCEAN = "Ocean",
  FOREST = "Forest",
  SUNSET = "Sunset",
  NEON = "Neon",
}

// Global state
let currentResults: DetectionResult | null = null
let currentDirectory: string = process.cwd()
let scanOptions = {
  ignorePatterns: [] as string[],
  detectUnusedFiles: true,
  detectUnusedPackages: true,
}

// Theme colors
const themes = {
  [ThemeOption.DEFAULT]: {
    primary: chalk.cyan,
    secondary: chalk.yellow,
    accent: chalk.green,
    warning: chalk.red,
    dim: chalk.dim,
    title: gradient("#00b4d8", "#0077b6", "#023e8a"),
    borderColor: "cyan",
  },
  [ThemeOption.OCEAN]: {
    primary: chalk.blue,
    secondary: chalk.cyan,
    accent: chalk.green,
    warning: chalk.red,
    dim: chalk.dim,
    title: gradient("#48cae4", "#0096c7", "#023e8a"),
    borderColor: "blue",
  },
  [ThemeOption.FOREST]: {
    primary: chalk.green,
    secondary: chalk.yellow,
    accent: chalk.blue,
    warning: chalk.red,
    dim: chalk.dim,
    title: gradient("#52b788", "#40916c", "#1b4332"),
    borderColor: "green",
  },
  [ThemeOption.SUNSET]: {
    primary: chalk.magenta,
    secondary: chalk.yellow,
    accent: chalk.red,
    warning: chalk.blue,
    dim: chalk.dim,
    title: gradient("#ffb703", "#fb8500", "#d00000"),
    borderColor: "yellow",
  },
  [ThemeOption.NEON]: {
    primary: chalk.hex("#ff00ff"),
    secondary: chalk.hex("#00ffff"),
    accent: chalk.hex("#ffff00"),
    warning: chalk.hex("#ff0000"),
    dim: chalk.dim,
    title: gradient("#ff00ff", "#00ffff", "#ffff00"),
    borderColor: "magenta",
  },
}

// Get current theme
let currentTheme = themes[ThemeOption.DEFAULT] // Default fallback
try {
  const savedTheme = config.get("theme") as ThemeOption
  if (savedTheme && themes[savedTheme]) {
    currentTheme = themes[savedTheme]
  }
} catch (error) {
  console.error("Error loading theme, using default theme instead")
}

/**
 * Display a welcome banner
 */
function displayBanner() {
  // Create a default gradient in case the theme's title is undefined
  const titleGradient = currentTheme.title || gradient("#00b4d8", "#0077b6", "#023e8a")

  console.log(
    "\n" +
      boxen(
        titleGradient.multiline(
          "╔═╗╦  ╔═╗╔═╗╔╗╔╔═╗═╗ ╦╔╦╗\n" + "║  ║  ║╣ ╠═╣║║║║╣ ╔╩╦╝ ║ \n" + "╚═╝╩═╝╚═╝╩ ╩╝╚╝╚═╝╩ ╚═ ╩ ",
        ) +
          "\n" +
          currentTheme.primary("Advanced Code Cleanup Tool") +
          "\n" +
          currentTheme.dim("v1.0.0"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: currentTheme.borderColor,
        },
      ),
  )
}

/**
 * Display the main menu and handle user selection
 */
async function showMainMenu() {
  // Update recent directories
  let recentDirs = config.get("recentDirectories") as string[]
  if (!recentDirs.includes(currentDirectory)) {
    recentDirs.unshift(currentDirectory)
    if (recentDirs.length > 5) recentDirs = recentDirs.slice(0, 5)
    config.set("recentDirectories", recentDirs)
  }

  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "What would you like to do?",
      choices: [
        {
          name: `${currentTheme.primary(figures.play)} ${MainMenuOption.SCAN}`,
          value: MainMenuOption.SCAN,
        },
        {
          name: `${currentTheme.secondary(figures.info)} ${MainMenuOption.VIEW_RESULTS}`,
          value: MainMenuOption.VIEW_RESULTS,
          disabled: !currentResults ? "Run a scan first" : false,
        },
        {
          name: `${currentTheme.warning(figures.warning)} ${MainMenuOption.CLEAN_FILES}`,
          value: MainMenuOption.CLEAN_FILES,
          disabled: !currentResults || currentResults.unusedFiles.length === 0 ? "No unused files to clean" : false,
        },
        {
          name: `${currentTheme.warning(figures.warning)} ${MainMenuOption.CLEAN_PACKAGES}`,
          value: MainMenuOption.CLEAN_PACKAGES,
          disabled:
            !currentResults || currentResults.unusedPackages.length === 0 ? "No unused packages to uninstall" : false,
        },
        {
          name: `${currentTheme.accent(figures.arrowDown)} ${MainMenuOption.EXPORT_RESULTS}`,
          value: MainMenuOption.EXPORT_RESULTS,
          disabled: !currentResults ? "Run a scan first" : false,
        },
        new inquirer.Separator(),
        {
          name: `${currentTheme.secondary(figures.radioOn)} ${MainMenuOption.SETTINGS}`,
          value: MainMenuOption.SETTINGS,
        },
        {
          name: `${currentTheme.warning(figures.cross)} ${MainMenuOption.EXIT}`,
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
    case MainMenuOption.SETTINGS:
      await handleSettings()
      break
    case MainMenuOption.EXIT:
      console.log(currentTheme.accent("Thanks for using CleanExt!"))
      process.exit(0)
  }

  // Return to main menu after action completes
  await showMainMenu()
}

/**
 * Handle the settings menu
 */
async function handleSettings() {
  const { setting } = await inquirer.prompt([
    {
      type: "list",
      name: "setting",
      message: "Settings:",
      choices: [
        {
          name: `${currentTheme.secondary(figures.bullet)} ${SettingsOption.IGNORE_PATTERNS}`,
          value: SettingsOption.IGNORE_PATTERNS,
        },
        {
          name: `${currentTheme.secondary(figures.circleFilled)} ${SettingsOption.THEME}`,
          value: SettingsOption.THEME,
        },
        {
          name: `${currentTheme.warning(figures.cross)} ${SettingsOption.CLEAR_HISTORY}`,
          value: SettingsOption.CLEAR_HISTORY,
        },
        new inquirer.Separator(),
        {
          name: `${currentTheme.primary(figures.arrowLeft)} ${SettingsOption.BACK}`,
          value: SettingsOption.BACK,
        },
      ],
    },
  ])

  switch (setting) {
    case SettingsOption.IGNORE_PATTERNS:
      await handleIgnorePatterns()
      break
    case SettingsOption.THEME:
      await handleThemeChange()
      break
    case SettingsOption.CLEAR_HISTORY:
      config.set("recentDirectories", [])
      console.log(currentTheme.accent("Recent directories cleared!"))
      break
    case SettingsOption.BACK:
      return
  }
}

/**
 * Handle ignore patterns configuration
 */
async function handleIgnorePatterns() {
  const defaultPatterns = config.get("defaultIgnorePatterns") as string[]

  const { patterns } = await inquirer.prompt([
    {
      type: "input",
      name: "patterns",
      message: "Enter default ignore patterns (comma separated):",
      default: defaultPatterns.join(", "),
      filter: (input) =>
        input
          .split(",")
          .map((p: string) => p.trim())
          .filter(Boolean),
    },
  ])

  config.set("defaultIgnorePatterns", patterns)
  scanOptions.ignorePatterns = patterns
  console.log(currentTheme.accent("Default ignore patterns updated!"))
}

/**
 * Handle theme change
 */
async function handleThemeChange() {
  const { theme } = await inquirer.prompt([
    {
      type: "list",
      name: "theme",
      message: "Select a theme:",
      choices: Object.values(ThemeOption),
      default: config.get("theme") || ThemeOption.DEFAULT,
    },
  ])

  config.set("theme", theme)
  currentTheme = themes[theme as ThemeOption]
  console.log(currentTheme.accent("Theme updated!"))
}

// Add this interface before the handleScan function
interface DirectoryPromptAnswers {
  directoryOption: string
  customDirectory?: string
}

/**
 * Handle the scan action
 */
async function handleScan() {
  // Get recent directories
  const recentDirs = config.get("recentDirectories") as string[]

  // Ask for directory to scan
  const directoryPrompt = [
    {
      type: "list",
      name: "directoryOption",
      message: "Select directory to scan:",
      choices: [
        { name: "Current directory", value: "current" },
        { name: "Enter custom path", value: "custom" },
        ...recentDirs.map((dir) => ({ name: `Recent: ${dir}`, value: dir })),
      ],
    },
    {
      type: "input",
      name: "customDirectory",
      message: "Enter the directory path:",
      default: currentDirectory,
      when: (answers: { directoryOption: string }) => answers.directoryOption === "custom",
    },
  ]

  // Use a separate approach to handle the prompt result with proper typing
  const answers = (await inquirer.prompt(directoryPrompt)) as DirectoryPromptAnswers
  const directoryOption = answers.directoryOption

  // Handle the directory selection
  if (directoryOption === "current") {
    currentDirectory = process.cwd()
  } else if (directoryOption === "custom") {
    // Safely access the customDirectory property
    if (answers.customDirectory) {
      currentDirectory = answers.customDirectory
    }
  } else {
    currentDirectory = directoryOption
  }

  // Configure scan options
  const { configureOptions } = await inquirer.prompt([
    {
      type: "confirm",
      name: "configureOptions",
      message: "Would you like to configure scan options?",
      default: false,
    },
  ])

  if (configureOptions) {
    const defaultPatterns = config.get("defaultIgnorePatterns") as string[]

    const { ignorePatterns, detectFiles, detectPackages } = await inquirer.prompt([
      {
        type: "input",
        name: "ignorePatterns",
        message: "Enter patterns to ignore (comma separated):",
        default: [...defaultPatterns, ...scanOptions.ignorePatterns].join(", "),
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

  // Run the scan with progress indicator
  console.log("")
  const progressBar = new SingleBar(
    {
      format: `${currentTheme.primary("Scanning")} |${currentTheme.primary("{bar}")}| {percentage}% | {value}/{total} | {phase}`,
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    },
    Presets.shades_classic,
  )

  let currentPhase = "Initializing"
  progressBar.start(100, 0, { phase: currentPhase })

  try {
    currentResults = await detectUnused(currentDirectory, {
      ...scanOptions,
      onProgress: (phase, current, total) => {
        if (phase !== currentPhase) {
          currentPhase = phase
        }

        // Calculate overall progress (simplified)
        let overallProgress = 0
        if (phase === "Analyzing files") {
          overallProgress = Math.floor((current / total) * 80) // 80% of progress bar
        } else if (phase === "Finding unused exports") {
          overallProgress = 80 + Math.floor((current / total) * 10) // 10% of progress bar
        } else if (phase === "Finding unused files") {
          overallProgress = 90 + Math.floor((current / total) * 5) // 5% of progress bar
        } else if (phase === "Finding unused packages") {
          overallProgress = 95 + Math.floor((current / total) * 5) // 5% of progress bar
        }

        progressBar.update(overallProgress, { phase })
      },
    })

    progressBar.update(100, { phase: "Complete" })
    progressBar.stop()

    // Display summary
    displayResultsSummary(currentResults)
  } catch (error) {
    progressBar.stop()
    console.error(currentTheme.warning(`Scan failed: ${error}`))
  }
}

/**
 * Display a summary of the scan results
 */
function displayResultsSummary(results: DetectionResult) {
  console.log("\n")

  const summaryBox = boxen(
    chalk.bold.white("Scan Results Summary") +
      "\n\n" +
      `${currentTheme.primary("Files Scanned:")} ${results.totalFiles}\n` +
      `${currentTheme.primary("Exports Found:")} ${results.totalExports}\n` +
      `${currentTheme.primary("Imports Found:")} ${results.totalImports}\n\n` +
      `${currentTheme.secondary("Unused Exports:")} ${results.unusedExports.length}\n` +
      `${currentTheme.secondary("Unused Files:")} ${results.unusedFiles.length}\n` +
      `${currentTheme.secondary("Unused Packages:")} ${results.unusedPackages.length}\n\n` +
      `${currentTheme.accent("Scan Time:")} ${(results.scanTime / 1000).toFixed(2)}s`,
    {
      padding: 1,
      borderStyle: "round",
      borderColor: currentTheme.borderColor,
    },
  )

  console.log(summaryBox)
}

/**
 * Handle viewing detailed results
 */
async function handleViewResults() {
  if (!currentResults) {
    console.log(currentTheme.warning("No scan results available. Please run a scan first."))
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
        {
          name: `File Statistics`,
          value: ResultsViewOption.STATS,
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
      await displayUnusedExports(currentResults.unusedExports)
      break
    case ResultsViewOption.FILES:
      await displayUnusedFiles(currentResults.unusedFiles, currentResults.fileStats)
      break
    case ResultsViewOption.PACKAGES:
      await displayUnusedPackages(currentResults.unusedPackages)
      break
    case ResultsViewOption.STATS:
      await displayFileStats(currentResults.fileStats)
      break
    case ResultsViewOption.BACK:
      return
  }
}

/**
 * Display unused exports with filtering and sorting options
 */
async function displayUnusedExports(unusedExports: ExportInfo[]) {
  if (unusedExports.length === 0) {
    console.log(currentTheme.accent("No unused exports found!"))
    return
  }

  // Ask for filtering and sorting options
  const { sortBy, filterType } = await inquirer.prompt([
    {
      type: "list",
      name: "sortBy",
      message: "Sort by:",
      choices: [
        { name: "File path", value: "filePath" },
        { name: "Export name", value: "name" },
        { name: "Type", value: "type" },
        { name: "Line number", value: "line" },
      ],
      default: "filePath",
    },
    {
      type: "list",
      name: "filterType",
      message: "Filter by type:",
      choices: [
        { name: "All types", value: "all" },
        { name: "Functions", value: "function" },
        { name: "Classes", value: "class" },
        { name: "Variables", value: "variable" },
        { name: "Default exports", value: "default" },
        { name: "Other", value: "other" },
      ],
      default: "all",
    },
  ])

  // Filter and sort the exports
  const filteredExports = filterType === "all" ? unusedExports : unusedExports.filter((exp) => exp.type === filterType)

  const sortedExports = [...filteredExports].sort((a, b) => {
    if (sortBy === "line") {
      return a.line - b.line
    }
    return a[sortBy as keyof ExportInfo] > b[sortBy as keyof ExportInfo] ? 1 : -1
  })

  // Display the exports in a table
  const table = new Table({
    head: [
      currentTheme.primary.bold("Export Name"),
      currentTheme.primary.bold("File Path"),
      currentTheme.primary.bold("Type"),
      currentTheme.primary.bold("Line"),
    ],
    colWidths: [30, 50, 15, 10],
  })

  sortedExports.forEach((exp) => {
    table.push([
      currentTheme.secondary(exp.name),
      currentTheme.accent(exp.filePath),
      currentTheme.dim(exp.type),
      currentTheme.dim(exp.line.toString()),
    ])
  })

  console.log("\n" + currentTheme.primary.bold(`Unused Exports (${filteredExports.length}):`))
  console.log(table.toString())

  // Ask if user wants to search
  const { wantSearch } = await inquirer.prompt([
    {
      type: "confirm",
      name: "wantSearch",
      message: "Would you like to search for specific exports?",
      default: false,
    },
  ])

  if (wantSearch) {
    await searchExports(sortedExports)
  } else {
    console.log(currentTheme.dim("\nPress any key to continue..."))
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.once("data", () => {
      process.stdin.setRawMode(false)
    })
  }
}

/**
 * Search for specific exports
 */
async function searchExports(exports: ExportInfo[]) {
  const { searchTerm } = await inquirer.prompt([
    {
      type: "input",
      name: "searchTerm",
      message: "Enter search term (name or file path):",
    },
  ])

  if (searchTerm) {
    const searchTermLower = searchTerm.toLowerCase()
    const matchingExports = exports.filter(
      (exp) => exp.name.toLowerCase().includes(searchTermLower) || exp.filePath.toLowerCase().includes(searchTermLower),
    )

    if (matchingExports.length === 0) {
      console.log(currentTheme.warning("No matching exports found."))
      return
    }

    // If multiple matches, let user select one
    let selectedExport: ExportInfo
    if (matchingExports.length === 1) {
      selectedExport = matchingExports[0]
    } else {
      const { exportIndex } = await inquirer.prompt([
        {
          type: "list",
          name: "exportIndex",
          message: "Multiple matches found. Select one:",
          choices: matchingExports.map((exp, index) => ({
            name: `${exp.name} in ${exp.filePath}`,
            value: index,
          })),
        },
      ])
      selectedExport = matchingExports[exportIndex]
    }

    console.log("\n" + currentTheme.primary.bold("Export Details:"))
    console.log(`${currentTheme.primary("Name:")} ${currentTheme.secondary(selectedExport.name)}`)
    console.log(`${currentTheme.primary("File:")} ${currentTheme.accent(selectedExport.filePath)}`)
    console.log(`${currentTheme.primary("Type:")} ${currentTheme.dim(selectedExport.type)}`)
    console.log(`${currentTheme.primary("Line:")} ${currentTheme.dim(selectedExport.line.toString())}`)

    // Ask if user wants to preview the file
    const { previewFile } = await inquirer.prompt([
      {
        type: "confirm",
        name: "previewFile",
        message: "Would you like to preview this file?",
        default: true,
      },
    ])

    if (previewFile) {
      await previewFileAtLine(selectedExport.filePath, selectedExport.line)
    }

    // Ask if user wants to search again
    const { searchAgain } = await inquirer.prompt([
      {
        type: "confirm",
        name: "searchAgain",
        message: "Would you like to search for another export?",
        default: false,
      },
    ])

    if (searchAgain) {
      await searchExports(exports)
    }
  }
}

/**
 * Preview a file at a specific line
 */
async function previewFileAtLine(filePath: string, line: number) {
  try {
    const fullPath = path.join(currentDirectory, filePath)
    const content = fs.readFileSync(fullPath, "utf-8")
    const lines = content.split("\n")

    // Get the lines around the target line
    const startLine = Math.max(0, line - 5)
    const endLine = Math.min(lines.length, line + 5)
    const contextLines = lines.slice(startLine, endLine)

    // Highlight the target line
    const highlightedContent = contextLines
      .map((text, i) => {
        const lineNumber = startLine + i + 1
        const isTargetLine = lineNumber === line
        const lineNumberStr = isTargetLine ? currentTheme.secondary(`${lineNumber}`) : currentTheme.dim(`${lineNumber}`)

        return `${lineNumberStr.padStart(6)} ${isTargetLine ? currentTheme.secondary("▶") : " "} ${text}`
      })
      .join("\n")

    const fileExtension = path.extname(filePath).substring(1)

    console.log("\n" + currentTheme.primary.bold(`Preview of ${filePath} around line ${line}:`))
    console.log(
      boxen(
        highlight(highlightedContent, {
          language: fileExtension || "plaintext",
          theme: {
            keyword: chalk.blue,
            built_in: chalk.cyan,
            string: chalk.green,
            number: chalk.yellow,
            comment: chalk.gray,
          },
        }),
        { padding: 1, borderColor: currentTheme.borderColor },
      ),
    )
  } catch (error) {
    console.error(currentTheme.warning(`Error reading file: ${error}`))
  }
}

/**
 * Display unused files with filtering and sorting options
 */
async function displayUnusedFiles(unusedFiles: string[], fileStats: FileStats[]) {
  if (unusedFiles.length === 0) {
    console.log(currentTheme.accent("No unused files found!"))
    return
  }

  // Ask for sorting options
  const { sortBy } = await inquirer.prompt([
    {
      type: "list",
      name: "sortBy",
      message: "Sort by:",
      choices: [
        { name: "File path", value: "path" },
        { name: "Size (largest first)", value: "size-desc" },
        { name: "Size (smallest first)", value: "size-asc" },
        { name: "Last modified (newest first)", value: "date-desc" },
        { name: "Last modified (oldest first)", value: "date-asc" },
      ],
      default: "path",
    },
  ])

  // Get stats for the unused files
  const unusedFileStats = fileStats.filter((stat) => unusedFiles.includes(stat.path))

  // Sort the files
  const sortedFiles = [...unusedFileStats].sort((a, b) => {
    switch (sortBy) {
      case "size-desc":
        return b.size - a.size
      case "size-asc":
        return a.size - b.size
      case "date-desc":
        return b.lastModified.getTime() - a.lastModified.getTime()
      case "date-asc":
        return a.lastModified.getTime() - b.lastModified.getTime()
      default:
        return a.path.localeCompare(b.path)
    }
  })

  // Display the files in a table
  const table = new Table({
    head: [
      currentTheme.primary.bold("#"),
      currentTheme.primary.bold("File Path"),
      currentTheme.primary.bold("Size"),
      currentTheme.primary.bold("Last Modified"),
    ],
    colWidths: [5, 50, 15, 25],
  })

  sortedFiles.forEach((file, index) => {
    table.push([
      currentTheme.secondary((index + 1).toString()),
      currentTheme.accent(file.path),
      currentTheme.dim(formatBytes(file.size)),
      currentTheme.dim(file.lastModified.toLocaleString()),
    ])
  })

  console.log("\n" + currentTheme.primary.bold(`Unused Files (${unusedFiles.length}):`))
  console.log(table.toString())

  // Ask if user wants to preview any file
  const { previewFile } = await inquirer.prompt([
    {
      type: "confirm",
      name: "previewFile",
      message: "Would you like to preview any of these files?",
      default: false,
    },
  ])

  if (previewFile) {
    const { fileIndex } = await inquirer.prompt([
      {
        type: "list",
        name: "fileIndex",
        message: "Select a file to preview:",
        choices: sortedFiles.map((file, index) => ({
          name: `${file.path} (${formatBytes(file.size)})`,
          value: index,
        })),
      },
    ])

    const selectedFile = sortedFiles[fileIndex]
    await previewFile(selectedFile.path)
  }

  console.log(currentTheme.dim("\nPress any key to continue..."))
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false)
  })
}

/**
 * Preview a file
 */
async function previewFile(filePath: string) {
  try {
    const fullPath = path.join(currentDirectory, filePath)
    const content = fs.readFileSync(fullPath, "utf-8")
    const fileExtension = path.extname(filePath).substring(1)

    console.log("\n" + currentTheme.primary.bold(`Preview of ${filePath}:`))
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
        { padding: 1, borderColor: currentTheme.borderColor },
      ),
    )
  } catch (error) {
    console.error(currentTheme.warning(`Error reading file: ${error}`))
  }
}

/**
 * Display unused packages
 */
async function displayUnusedPackages(unusedPackages: PackageInfo[]) {
  if (unusedPackages.length === 0) {
    console.log(currentTheme.accent("No unused packages found!"))
    return
  }

  const table = new Table({
    head: [
      currentTheme.primary.bold("#"),
      currentTheme.primary.bold("Package Name"),
      currentTheme.primary.bold("Version"),
      currentTheme.primary.bold("Type"),
    ],
    colWidths: [5, 40, 15, 15],
  })

  unusedPackages.forEach((pkg, index) => {
    table.push([
      currentTheme.secondary((index + 1).toString()),
      currentTheme.accent(pkg.name),
      currentTheme.dim(pkg.version),
      currentTheme.dim(pkg.isDev ? "devDependency" : "dependency"),
    ])
  })

  console.log("\n" + currentTheme.primary.bold(`Unused Packages (${unusedPackages.length}):`))
  console.log(table.toString())

  console.log(currentTheme.dim("\nPress any key to continue..."))
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false)
  })
}

/**
 * Display file statistics
 */
async function displayFileStats(fileStats: FileStats[]) {
  if (fileStats.length === 0) {
    console.log(currentTheme.accent("No file statistics available!"))
    return
  }

  // Ask for sorting options
  const { sortBy } = await inquirer.prompt([
    {
      type: "list",
      name: "sortBy",
      message: "Sort by:",
      choices: [
        { name: "File path", value: "path" },
        { name: "Size (largest first)", value: "size-desc" },
        { name: "Size (smallest first)", value: "size-asc" },
        { name: "Exports (most first)", value: "exports-desc" },
        { name: "Imports (most first)", value: "imports-desc" },
      ],
      default: "path",
    },
  ])

  // Sort the files
  const sortedFiles = [...fileStats].sort((a, b) => {
    switch (sortBy) {
      case "size-desc":
        return b.size - a.size
      case "size-asc":
        return a.size - b.size
      case "exports-desc":
        return b.exports - a.exports
      case "imports-desc":
        return b.imports - a.imports
      default:
        return a.path.localeCompare(b.path)
    }
  })

  const table = new Table({
    head: [
      currentTheme.primary.bold("#"),
      currentTheme.primary.bold("File Path"),
      currentTheme.primary.bold("Size"),
      currentTheme.primary.bold("Exports"),
      currentTheme.primary.bold("Imports"),
    ],
    colWidths: [5, 50, 15, 10, 10],
  })

  sortedFiles.forEach((file, index) => {
    table.push([
      currentTheme.secondary((index + 1).toString()),
      currentTheme.accent(file.path),
      currentTheme.dim(formatBytes(file.size)),
      currentTheme.dim(file.exports.toString()),
      currentTheme.dim(file.imports.toString()),
    ])
  })

  console.log("\n" + currentTheme.primary.bold(`File Statistics (${fileStats.length}):`))
  console.log(table.toString())

  console.log(currentTheme.dim("\nPress any key to continue..."))
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.once("data", () => {
    process.stdin.setRawMode(false)
  })
}

/**
 * Handle cleaning unused files
 */
async function handleCleanFiles() {
  if (!currentResults || currentResults.unusedFiles.length === 0) {
    console.log(currentTheme.warning("No unused files to clean."))
    return
  }

  // Let user select files to clean
  const { selectedFiles } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedFiles",
      message: "Select files to remove:",
      choices: currentResults.unusedFiles.map((file) => {
        const stats = currentResults?.fileStats.find((stat) => stat.path === file)
        const sizeStr = stats ? `(${formatBytes(stats.size)})` : ""
        return {
          name: `${file} ${currentTheme.dim(sizeStr)}`,
          value: file,
        }
      }),
      pageSize: 15,
    },
  ])

  if (selectedFiles.length === 0) {
    console.log(currentTheme.warning("No files selected for removal."))
    return
  }

  const { confirmClean } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmClean",
      message: currentTheme.warning(
        `Are you sure you want to delete ${selectedFiles.length} file(s)? This action is irreversible!`,
      ),
      default: false,
    },
  ])

  if (confirmClean) {
    try {
      const removedFiles = removeUnusedFiles(currentDirectory, selectedFiles)
      console.log(currentTheme.accent(`Successfully removed ${removedFiles.length} file(s).`))

      // Update the results
      if (currentResults) {
        currentResults.unusedFiles = currentResults.unusedFiles.filter((file) => !selectedFiles.includes(file))
      }
    } catch (error) {
      console.error(currentTheme.warning(`Error removing files: ${error}`))
    }
  }
}

/**
 * Handle uninstalling unused packages
 */
async function handleCleanPackages() {
  if (!currentResults || currentResults.unusedPackages.length === 0) {
    console.log(currentTheme.warning("No unused packages to uninstall."))
    return
  }

  // Let user select packages to uninstall
  const { selectedPackages } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "selectedPackages",
      message: "Select packages to uninstall:",
      choices: currentResults.unusedPackages.map((pkg) => ({
        name: `${pkg.name}@${pkg.version} ${pkg.isDev ? currentTheme.dim("(dev)") : ""}`,
        value: pkg,
      })),
      pageSize: 15,
    },
  ])

  if (selectedPackages.length === 0) {
    console.log(currentTheme.warning("No packages selected for uninstallation."))
    return
  }

  const { confirmUninstall } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmUninstall",
      message: currentTheme.warning(`Are you sure you want to uninstall ${selectedPackages.length} package(s)?`),
      default: false,
    },
  ])

  if (confirmUninstall) {
    try {
      const removedPackages = uninstallUnusedPackages(currentDirectory, selectedPackages)
      console.log(currentTheme.accent(`Successfully uninstalled ${removedPackages.length} package(s).`))

      // Update the results
      if (currentResults) {
        const removedPackageNames = new Set(removedPackages)
        currentResults.unusedPackages = currentResults.unusedPackages.filter(
          (pkg) => !removedPackageNames.has(pkg.name),
        )
      }
    } catch (error) {
      console.error(currentTheme.warning(`Error uninstalling packages: ${error}`))
    }
  }
}

/**
 * Handle exporting results to a file
 */
async function handleExportResults() {
  if (!currentResults) {
    console.log(currentTheme.warning("No scan results available. Please run a scan first."))
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
      default: (answers: { format: string }) => `cleanext-results.${answers.format}`,
    },
  ])

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
    console.log(currentTheme.accent(`Results exported to ${filename} successfully!`))
  } catch (error) {
    console.error(currentTheme.warning(`Error exporting results: ${error}`))
  }
}

/**
 * Generate a Markdown report from the results
 */
function generateMarkdownReport(results: DetectionResult): string {
  return `# CleanExt Results

## Summary

- **Files Scanned:** ${results.totalFiles}
- **Exports Found:** ${results.totalExports}
- **Imports Found:** ${results.totalImports}
- **Unused Exports:** ${results.unusedExports.length}
- **Unused Files:** ${results.unusedFiles.length}
- **Unused Packages:** ${results.unusedPackages.length}
- **Scan Time:** ${(results.scanTime / 1000).toFixed(2)}s

## Unused Exports

${
  results.unusedExports.length === 0
    ? "No unused exports found."
    : results.unusedExports
        .map((exp) => `- **${exp.name}** in \`${exp.filePath}\` (${exp.type}, line ${exp.line})`)
        .join("\n")
}

## Unused Files

${
  results.unusedFiles.length === 0
    ? "No unused files found."
    : results.unusedFiles
        .map((file) => {
          const stats = results.fileStats.find((stat) => stat.path === file)
          const sizeStr = stats ? `(${(stats.size / 1024).toFixed(1)} KB)` : ""
          return `- \`${file}\` ${sizeStr}`
        })
        .join("\n")
}

## Unused Packages

${
  results.unusedPackages.length === 0
    ? "No unused packages found."
    : results.unusedPackages.map((pkg) => `- **${pkg.name}** (${pkg.version}) ${pkg.isDev ? "(dev)" : ""}`).join("\n")
}

---
Generated by CleanExt on ${new Date().toLocaleString()}
`
}

/**
 * Generate an HTML report from the results
 */
function generateHtmlReport(results: DetectionResult): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CleanExt Results</title>
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
  <h1>CleanExt Results</h1>
  
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
    <div class="summary-item">
      <div class="summary-label">Scan Time</div>
      <div class="summary-value">${(results.scanTime / 1000).toFixed(2)}s</div>
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
          <th>Type</th>
          <th>Line</th>
        </tr>
      </thead>
      <tbody>
        ${results.unusedExports
          .map(
            (exp) =>
              `<tr>
            <td>${exp.name}</td>
            <td>${exp.filePath}</td>
            <td>${exp.type}</td>
            <td>${exp.line}</td>
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
          <th>Size</th>
          <th>Last Modified</th>
        </tr>
      </thead>
      <tbody>
        ${results.unusedFiles
          .map((file) => {
            const stats = results.fileStats.find((stat) => stat.path === file)
            const size = stats ? formatBytes(stats.size) : "unknown"
            const lastModified = stats ? stats.lastModified.toLocaleString() : "unknown"
            return `<tr>
              <td>${file}</td>
              <td>${size}</td>
              <td>${lastModified}</td>
            </tr>`
          })
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
          <th>Type</th>
        </tr>
      </thead>
      <tbody>
        ${results.unusedPackages
          .map(
            (pkg) =>
              `<tr>
            <td>${pkg.name}</td>
            <td>${pkg.version}</td>
            <td>${pkg.isDev ? "devDependency" : "dependency"}</td>
          </tr>`,
          )
          .join("")}
      </tbody>
    </table>`
  }
  
  <div class="footer">
    Generated by CleanExt on ${new Date().toLocaleString()}
  </div>
</body>
</html>`
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}

// Start the interactive CLI
export async function startInteractiveCLI() {
  displayBanner()
  showMainMenu()
}
