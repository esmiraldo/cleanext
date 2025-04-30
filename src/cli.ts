#!/usr/bin/env node

import { detectUnused, removeUnusedFiles, uninstallUnusedPackages } from "./index"
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import fs from "fs"
import inquirer from "inquirer"
import { startInteractiveCLI } from "./interactive"

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
          default: false,
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
    },
    async (argv) => {
      if (argv["fully-interactive"]) {
        await startInteractiveCLI()
        return
      }

      try {
        const result = await detectUnused(argv.directory as string, {
          ignorePatterns: argv.ignore as string[],
          detectUnusedFiles: !argv["skip-files"],
          detectUnusedPackages: !argv["skip-packages"],
        })

        if (argv.json) {
          const jsonOutput = JSON.stringify(result, null, 2)
          if (argv.output) {
            fs.writeFileSync(argv.output as string, jsonOutput)
            console.log(`Results written to ${argv.output}`)
          } else {
            console.log(jsonOutput)
          }
        } else {
          console.log("\n=== Unused Detector Results ===")
          console.log(`Total files scanned: ${result.totalFiles}`)
          console.log(`Total exports found: ${result.totalExports}`)
          console.log(`Total imports found: ${result.totalImports}`)
          console.log(`Unused exports: ${result.unusedExports.length}`)

          if (!argv["skip-files"]) {
            console.log(`Unused files: ${result.unusedFiles.length}`)
          }

          if (!argv["skip-packages"]) {
            console.log(`Unused packages: ${result.unusedPackages.length}`)
          }

          if (result.unusedExports.length > 0) {
            console.log("\nUnused exports:")
            result.unusedExports.forEach((exp) => {
              console.log(`- ${exp.name} in ${exp.filePath}`)
            })
          }

          if (!argv["skip-files"] && result.unusedFiles.length > 0) {
            console.log("\nUnused files:")
            result.unusedFiles.forEach((file) => {
              console.log(`- ${file}`)
            })
          }

          if (!argv["skip-packages"] && result.unusedPackages.length > 0) {
            console.log("\nUnused packages:")
            result.unusedPackages.forEach((pkg) => {
              console.log(`- ${pkg.name}@${pkg.version}`)
            })
          }

          if (
            result.unusedExports.length === 0 &&
            (argv["skip-files"] || result.unusedFiles.length === 0) &&
            (argv["skip-packages"] || result.unusedPackages.length === 0)
          ) {
            console.log("\nGreat job! No unused code or packages found.")
          }

          if (argv.output) {
            const output = {
              summary: {
                totalFiles: result.totalFiles,
                totalExports: result.totalExports,
                totalImports: result.totalImports,
                unusedExports: result.unusedExports.length,
                unusedFiles: result.unusedFiles.length,
                unusedPackages: result.unusedPackages.length,
              },
              unusedExports: result.unusedExports,
              unusedFiles: result.unusedFiles,
              unusedPackages: result.unusedPackages,
            }

            fs.writeFileSync(argv.output as string, JSON.stringify(output, null, 2))
            console.log(`\nResults written to ${argv.output}`)
          }
        }

        if (argv.clean || argv.uninstall) {
          if (argv.interactive) {
            await handleInteractiveCleanup(
              argv.directory as string,
              result,
              argv.clean as boolean,
              argv.uninstall as boolean,
            )
          } else {
            if (argv.clean && result.unusedFiles.length > 0) {
              const removedFiles = removeUnusedFiles(argv.directory as string, result.unusedFiles)
              console.log(`\nRemoved ${removedFiles.length} unused files.`)
            }

            if (argv.uninstall && result.unusedPackages.length > 0) {
              const removedPackages = uninstallUnusedPackages(argv.directory as string, result.unusedPackages)
              console.log(`\nUninstalled ${removedPackages.length} unused packages.`)
            }
          }
        }
      } catch (error) {
        console.error("Error:", error)
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
) {
  if (cleanFiles && result.unusedFiles.length > 0) {
    const { selectedFiles } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedFiles",
        message: "Select files to remove:",
        choices: result.unusedFiles.map((file: string) => ({
          name: file,
          value: file,
        })),
      },
    ])

    if (selectedFiles.length > 0) {
      const removedFiles = removeUnusedFiles(directory, selectedFiles)
      console.log(`\nRemoved ${removedFiles.length} unused files.`)
    } else {
      console.log("\nNo files selected for removal.")
    }
  }

  if (uninstallPackages && result.unusedPackages.length > 0) {
    const { selectedPackages } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedPackages",
        message: "Select packages to uninstall:",
        choices: result.unusedPackages.map((pkg: any) => ({
          name: `${pkg.name}@${pkg.version}`,
          value: pkg,
        })),
      },
    ])

    if (selectedPackages.length > 0) {
      const removedPackages = uninstallUnusedPackages(directory, selectedPackages)
      console.log(`\nUninstalled ${removedPackages.length} unused packages.`)
    } else {
      console.log("\nNo packages selected for uninstallation.")
    }
  }
}
