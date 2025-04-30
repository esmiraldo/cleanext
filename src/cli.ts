#!/usr/bin/env node

import { detectUnused, removeUnusedFiles, uninstallUnusedPackages } from "./index"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import fs from "fs"
import inquirer from "inquirer"
import chalk from "chalk"
import { startInteractiveCLI } from "./interactive"
import ora from "ora"
import gradient from "gradient-string"
import boxen from "boxen"
import { SingleBar, Presets } from "cli-progress"
import terminalLink from "terminal-link"

// Register the autocomplete prompt
import inquirerAutocomplete from "inquirer-autocomplete-prompt"
inquirer.registerPrompt("autocomplete", inquirerAutocomplete)

// Create a beautiful gradient for the title
const titleGradient = gradient("#00b4d8", "#0077b6", "#023e8a")

// Display the app banner
function displayBanner() {
  console.log(
    "\n" +
      boxen(
        titleGradient.multiline(
          "╔═╗╦  ╔═╗╔═╗╔╗╔╔═╗═╗ ╦╔╦╗\n" + "║  ║  ║╣ ╠═╣║║║║╣ ╔╩╦╝ ║ \n" + "╚═╝╩═╝╚═╝╩ ╩╝╚╝╚═╝╩ ╚═ ╩ ",
        ) +
          "\n" +
          chalk.cyan("Advanced Code Cleanup Tool") +
          "\n" +
          chalk.dim("v1.0.0"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "cyan",
        },
      ),
  )
}

// Update the yargs command to include a fully interactive mode
yargs(hideBin(process.argv))
  .command(
    "$0 [directory]",
    "Detect and clean unused code in a directory",
    (yargs) => {
      return yargs
        .positional("directory", {
          describe: "Directory to scan",
          default: process.cwd(),
          type: "string",
        })
        .option("ignore", {
          alias: "i",
          describe: "Additional patterns to ignore",
          type: "array",
          default: [],
        })
        .option("clean", {
          alias: "c",
          describe: "Clean up unused files",
          type: "boolean",
          default: false,
        })
        .option("uninstall", {
          alias: "u",
          describe: "Uninstall unused packages",
          type: "boolean",
          default: false,
        })
        .option("interactive", {
          alias: "int",
          describe: "Interactive mode for selecting what to clean",
          type: "boolean",
          default: false,
        })
        .option("fully-interactive", {
          alias: "fi",
          describe: "Launch fully interactive UI with menus and visualizations",
          type: "boolean",
          default: true, // Set to true by default for better UX
        })
        .option("skip-files", {
          describe: "Skip unused files detection",
          type: "boolean",
          default: false,
        })
        .option("skip-packages", {
          describe: "Skip unused packages detection",
          type: "boolean",
          default: false,
        })
        .option("json", {
          describe: "Output results as JSON",
          type: "boolean",
          default: false,
        })
        .option("output", {
          alias: "o",
          describe: "Output file for results",
          type: "string",
        })
        .option("silent", {
          describe: "Suppress all console output",
          type: "boolean",
          default: false,
        })
        .option("no-banner", {
          describe: "Don't display the banner",
          type: "boolean",
          default: false,
        })
    },
    async (argv) => {
      // Display banner unless suppressed
      if (!argv.silent && !argv["no-banner"]) {
        displayBanner()
      }

      // If fully-interactive mode is enabled, launch the interactive CLI
      if (argv["fully-interactive"] && !argv.json && !argv.silent) {
        await startInteractiveCLI()
        return
      }

      try {
        // Create a progress bar
        const progressBar = new SingleBar(
          {
            format: `${chalk.cyan("Scanning")} |${chalk.cyan("{bar}")}| {percentage}% | {value}/{total} | {phase}`,
            barCompleteChar: "\u2588",
            barIncompleteChar: "\u2591",
            hideCursor: true,
          },
          Presets.shades_classic,
        )

        let currentPhase = "Initializing"

        // Run the detection with progress reporting
        const spinner = !argv.silent ? ora("Scanning for unused code...").start() : null

        const result = await detectUnused(argv.directory as string, {
          ignorePatterns: argv.ignore as string[],
          detectUnusedFiles: !argv["skip-files"],
          detectUnusedPackages: !argv["skip-packages"],
          silent: argv.silent as boolean,
          onProgress: (phase, current, total) => {
            if (argv.silent) return

            if (phase !== currentPhase) {
              currentPhase = phase
              if (spinner) {
                spinner.text = `${currentPhase}...`
              }
            }
          },
        })

        if (spinner) {
          spinner.succeed(`Scan completed in ${(result.scanTime / 1000).toFixed(2)}s`)
        }

        // Output results
        if (argv.json) {
          const jsonOutput = JSON.stringify(result, null, 2)
          if (argv.output) {
            fs.writeFileSync(argv.output as string, jsonOutput)
            if (!argv.silent) {
              console.log(`Results written to ${argv.output}`)
            }
          } else {
            console.log(jsonOutput)
          }
        } else if (!argv.silent) {
          console.log(
            "\n" +
              boxen(
                chalk.bold.white("Scan Results Summary") +
                  "\n\n" +
                  `${chalk.blue("Files Scanned:")} ${result.totalFiles}\n` +
                  `${chalk.blue("Exports Found:")} ${result.totalExports}\n` +
                  `${chalk.blue("Imports Found:")} ${result.totalImports}\n\n` +
                  `${chalk.yellow("Unused Exports:")} ${result.unusedExports.length}\n` +
                  `${chalk.yellow("Unused Files:")} ${result.unusedFiles.length}\n` +
                  `${chalk.yellow("Unused Packages:")} ${result.unusedPackages.length}\n\n` +
                  `${chalk.green("Scan Time:")} ${(result.scanTime / 1000).toFixed(2)}s`,
                {
                  padding: 1,
                  borderStyle: "round",
                  borderColor: "blue",
                },
              ),
          )

          if (result.unusedExports.length > 0) {
            console.log("\n" + chalk.bold.yellow("Unused Exports:"))
            result.unusedExports.forEach((exp) => {
              console.log(
                `  ${chalk.yellow("•")} ${chalk.cyan(exp.name)} in ${chalk.blue(exp.filePath)}:${chalk.green(exp.line.toString())} (${chalk.dim(exp.type)})`,
              )
            })
          }

          if (!argv["skip-files"] && result.unusedFiles.length > 0) {
            console.log("\n" + chalk.bold.yellow("Unused Files:"))
            result.unusedFiles.forEach((file) => {
              const stats = result.fileStats.find((stat) => stat.path === file)
              const sizeStr = stats ? `${(stats.size / 1024).toFixed(1)} KB` : "unknown size"
              console.log(`  ${chalk.yellow("•")} ${chalk.blue(file)} (${chalk.dim(sizeStr)})`)
            })
          }

          if (!argv["skip-packages"] && result.unusedPackages.length > 0) {
            console.log("\n" + chalk.bold.yellow("Unused Packages:"))
            result.unusedPackages.forEach((pkg) => {
              console.log(
                `  ${chalk.yellow("•")} ${chalk.cyan(pkg.name)}@${chalk.blue(pkg.version)} ${pkg.isDev ? chalk.dim("(dev)") : ""}`,
              )
            })
          }

          if (
            result.unusedExports.length === 0 &&
            (argv["skip-files"] || result.unusedFiles.length === 0) &&
            (argv["skip-packages"] || result.unusedPackages.length === 0)
          ) {
            console.log("\n" + chalk.green.bold("✓ Great job! No unused code or packages found."))
          }

          // Save results to file if requested
          if (argv.output) {
            const output = {
              summary: {
                totalFiles: result.totalFiles,
                totalExports: result.totalExports,
                totalImports: result.totalImports,
                unusedExports: result.unusedExports.length,
                unusedFiles: result.unusedFiles.length,
                unusedPackages: result.unusedPackages.length,
                scanTime: result.scanTime,
              },
              unusedExports: result.unusedExports,
              unusedFiles: result.unusedFiles,
              unusedPackages: result.unusedPackages,
              fileStats: result.fileStats,
            }

            fs.writeFileSync(argv.output as string, JSON.stringify(output, null, 2))
            console.log(`\n${chalk.green("✓")} Results written to ${chalk.blue(argv.output)}`)
          }

          // Show help text for interactive mode
          if (!argv.clean && !argv.uninstall && !argv.interactive) {
            console.log("\n" + chalk.dim("Tip: Run with --interactive or --fully-interactive for a better experience"))
            console.log(chalk.dim(`     ${terminalLink("Learn more", "https://github.com/yourusername/cleanext")}`))
          }
        }

        // Clean up if requested
        if (argv.clean || argv.uninstall) {
          if (argv.interactive) {
            await handleInteractiveCleanup(
              argv.directory as string,
              result,
              argv.clean as boolean,
              argv.uninstall as boolean,
              argv.silent as boolean,
            )
          } else {
            if (argv.clean && result.unusedFiles.length > 0) {
              const spinner = !argv.silent ? ora("Removing unused files...").start() : null
              const removedFiles = removeUnusedFiles(argv.directory as string, result.unusedFiles)
              if (spinner) {
                spinner.succeed(`Removed ${removedFiles.length} unused files`)
              }
            }

            if (argv.uninstall && result.unusedPackages.length > 0) {
              const spinner = !argv.silent ? ora("Uninstalling unused packages...").start() : null
              const removedPackages = uninstallUnusedPackages(argv.directory as string, result.unusedPackages)
              if (spinner) {
                spinner.succeed(`Uninstalled ${removedPackages.length} unused packages`)
              }
            }
          }
        }
      } catch (error) {
        console.error(chalk.red("Error:"), error)
        process.exit(1)
      }
    },
  )
  .help().argv

async function handleInteractiveCleanup(
  directory: string,
  result: any,
  cleanFiles: boolean,
  uninstallPackages: boolean,
  silent: boolean,
) {
  if (cleanFiles && result.unusedFiles.length > 0) {
    const { selectedFiles } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedFiles",
        message: "Select files to remove:",
        choices: result.unusedFiles.map((file: string) => {
          const stats = result.fileStats.find((stat: any) => stat.path === file)
          const sizeStr = stats ? `(${(stats.size / 1024).toFixed(1)} KB)` : ""
          return {
            name: `${file} ${chalk.dim(sizeStr)}`,
            value: file,
          }
        }),
        pageSize: 15,
      },
    ])

    if (selectedFiles.length > 0) {
      const { confirmRemove } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmRemove",
          message: `Are you sure you want to remove ${selectedFiles.length} file(s)?`,
          default: false,
        },
      ])

      if (confirmRemove) {
        const spinner = !silent ? ora("Removing files...").start() : null
        const removedFiles = removeUnusedFiles(directory, selectedFiles)
        if (spinner) {
          spinner.succeed(`Successfully removed ${removedFiles.length} file(s)`)
        }
      }
    } else {
      if (!silent) console.log(chalk.yellow("No files selected for removal."))
    }
  }

  if (uninstallPackages && result.unusedPackages.length > 0) {
    const { selectedPackages } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedPackages",
        message: "Select packages to uninstall:",
        choices: result.unusedPackages.map((pkg: any) => ({
          name: `${pkg.name}@${pkg.version} ${pkg.isDev ? chalk.dim("(dev)") : ""}`,
          value: pkg,
        })),
        pageSize: 15,
      },
    ])

    if (selectedPackages.length > 0) {
      const { confirmUninstall } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmUninstall",
          message: `Are you sure you want to uninstall ${selectedPackages.length} package(s)?`,
          default: false,
        },
      ])

      if (confirmUninstall) {
        const spinner = !silent ? ora("Uninstalling packages...").start() : null
        const removedPackages = uninstallUnusedPackages(directory, selectedPackages)
        if (spinner) {
          spinner.succeed(`Successfully uninstalled ${removedPackages.length} package(s)`)
        }
      }
    } else {
      if (!silent) console.log(chalk.yellow("No packages selected for uninstallation."))
    }
  }
}
