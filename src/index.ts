#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { glob } from "glob"
import { parse } from "@babel/parser"
import traverse from "@babel/traverse"
import { execSync } from "child_process"

// Types for our exports and imports tracking
type ExportInfo = {
  name: string
  filePath: string
  type: "function" | "class" | "variable" | "default" | "other"
  line: number
}

type ImportInfo = {
  name: string
  importedIn: string
  source?: string
  line: number
}

type PackageInfo = {
  name: string
  version: string
  isUsed: boolean
  isDev: boolean
}

type FileStats = {
  path: string
  size: number
  lastModified: Date
  exports: number
  imports: number
}

type DetectionResult = {
  totalFiles: number
  totalExports: number
  totalImports: number
  unusedExports: ExportInfo[]
  unusedFiles: string[]
  unusedPackages: PackageInfo[]
  fileStats: FileStats[]
  scanTime: number
}

// Add these exports at the top of the file, after the imports
export type { ExportInfo, ImportInfo, PackageInfo, FileStats, DetectionResult }

// Default directories and files to ignore
const DEFAULT_IGNORE = [
  "node_modules/**",
  ".next/**",
  "dist/**",
  "build/**",
  "coverage/**",
  "**/*.test.{js,jsx,ts,tsx}",
  "**/*.spec.{js,jsx,ts,tsx}",
  "**/*.d.ts",
  "**/*.min.js",
]

// Helper function to check if a file should be ignored
function shouldIgnoreFile(filePath: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some((pattern) => {
    // Convert glob pattern to regex pattern
    const regexPattern = pattern.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(filePath)
  })
}

// Main function to detect unused exports, files, and packages
export async function detectUnused(
  directory: string,
  options: {
    ignorePatterns?: string[]
    detectUnusedFiles?: boolean
    detectUnusedPackages?: boolean
    silent?: boolean
    onProgress?: (phase: string, current: number, total: number) => void
  } = {},
): Promise<DetectionResult> {
  const {
    ignorePatterns = [],
    detectUnusedFiles = true,
    detectUnusedPackages = true,
    silent = false,
    onProgress = () => {},
  } = options

  const startTime = Date.now()

  if (!silent) {
    console.log("Scanning directory:", directory)
  }

  // Combine default ignore patterns with user-provided ones
  const allIgnorePatterns = [...DEFAULT_IGNORE, ...ignorePatterns]

  // Get all JS/TS files
  const files = await glob("**/*.{js,jsx,ts,tsx}", {
    cwd: directory,
    ignore: allIgnorePatterns,
    absolute: true,
  })

  if (!silent) {
    console.log(`Found ${files.length} files to analyze`)
  }

  const exports: ExportInfo[] = []
  const imports: ImportInfo[] = []
  const packageImports: Set<string> = new Set()
  const fileImportMap: Map<string, string[]> = new Map()
  const fileStats: FileStats[] = []

  // Parse each file to find exports and imports
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress("Analyzing files", i + 1, files.length)

    try {
      const content = fs.readFileSync(file, "utf-8")
      const relativePath = path.relative(directory, file)

      // Skip files in node_modules and other ignored directories
      if (shouldIgnoreFile(relativePath, allIgnorePatterns)) {
        continue
      }

      // Get file stats
      const stats = fs.statSync(file)
      fileStats.push({
        path: relativePath,
        size: stats.size,
        lastModified: stats.mtime,
        exports: 0,
        imports: 0,
      })

      const ast = parse(content, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "classProperties", "decorators-legacy"],
      })

      fileImportMap.set(relativePath, [])

      // Find exports
      traverse(ast, {
        ExportNamedDeclaration(nodePath) {
          const declaration = nodePath.node.declaration
          const currentFileStats = fileStats.find((stat) => stat.path === relativePath)
          if (currentFileStats) {
            currentFileStats.exports++
          }

          // Handle function/class declarations
          if (
            declaration &&
            (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") &&
            declaration.id
          ) {
            exports.push({
              name: declaration.id.name,
              filePath: relativePath,
              type: declaration.type === "FunctionDeclaration" ? "function" : "class",
              line: declaration.loc?.start.line || 0,
            })
          }

          // Handle variable declarations
          if (declaration && declaration.type === "VariableDeclaration") {
            declaration.declarations.forEach((declarator) => {
              if (declarator.id.type === "Identifier") {
                exports.push({
                  name: declarator.id.name,
                  filePath: relativePath,
                  type: "variable",
                  line: declarator.loc?.start.line || 0,
                })
              }
            })
          }

          // Handle export specifiers
          if (nodePath.node.specifiers) {
            nodePath.node.specifiers.forEach((specifier) => {
              if (specifier.type === "ExportSpecifier") {
                exports.push({
                  name: specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value,
                  filePath: relativePath,
                  type: "other",
                  line: specifier.loc?.start.line || 0,
                })
              }
            })
          }
        },
        ExportDefaultDeclaration(nodePath) {
          const declaration = nodePath.node.declaration
          const currentFileStats = fileStats.find((stat) => stat.path === relativePath)
          if (currentFileStats) {
            currentFileStats.exports++
          }

          // Handle named default exports
          if (declaration.type === "Identifier") {
            exports.push({
              name: `default(${declaration.name})`,
              filePath: relativePath,
              type: "default",
              line: declaration.loc?.start.line || 0,
            })
          } else {
            exports.push({
              name: "default",
              filePath: relativePath,
              type: "default",
              line: nodePath.node.loc?.start.line || 0,
            })
          }
        },
      })

      // Find imports
      traverse(ast, {
        ImportDeclaration(nodePath) {
          const source = nodePath.node.source.value as string
          const currentFileStats = fileStats.find((stat) => stat.path === relativePath)
          if (currentFileStats) {
            currentFileStats.imports++
          }

          // Track package imports (non-relative paths)
          if (!source.startsWith(".") && !source.startsWith("/")) {
            // Extract the package name (e.g., 'lodash/fp' -> 'lodash')
            const packageName = source.split("/")[0]
            packageImports.add(packageName)
          } else {
            // For relative imports, resolve the full path
            let importPath = source
            if (
              !importPath.endsWith(".js") &&
              !importPath.endsWith(".jsx") &&
              !importPath.endsWith(".ts") &&
              !importPath.endsWith(".tsx")
            ) {
              // Try to resolve the file extension
              const possibleExtensions = [".js", ".jsx", ".ts", ".tsx"]
              const dir = path.dirname(file)

              for (const ext of possibleExtensions) {
                const fullPath = path.resolve(dir, `${importPath}${ext}`)
                if (fs.existsSync(fullPath)) {
                  importPath = `${importPath}${ext}`
                  break
                }

                // Check for index files
                const indexPath = path.join(dir, importPath, `index${ext}`)
                if (fs.existsSync(indexPath)) {
                  importPath = path.join(importPath, `index${ext}`)
                  break
                }
              }
            }

            // Normalize the path
            const resolvedPath = path.resolve(path.dirname(file), importPath)
            const relativeToRoot = path.relative(directory, resolvedPath)

            // Add to the file import map
            const currentImports = fileImportMap.get(relativePath) || []
            currentImports.push(relativeToRoot)
            fileImportMap.set(relativePath, currentImports)
          }

          nodePath.node.specifiers.forEach((specifier) => {
            if (specifier.type === "ImportSpecifier" || specifier.type === "ImportDefaultSpecifier") {
              imports.push({
                name: specifier.local.name,
                importedIn: relativePath,
                source: nodePath.node.source.value as string,
                line: specifier.loc?.start.line || 0,
              })
            }
          })
        },
      })
    } catch (error) {
      // Skip errors from node_modules and other ignored directories
      const relativePath = path.relative(directory, file)
      if (!shouldIgnoreFile(relativePath, allIgnorePatterns) && !silent) {
        console.error(`Error parsing ${relativePath}:`, error)
      }
    }
  }

  // Find unused exports
  onProgress("Finding unused exports", 0, 1)
  const unusedExports = exports.filter((exp) => {
    return !imports.some((imp) => imp.name === exp.name)
  })
  onProgress("Finding unused exports", 1, 1)

  // Find unused files (files that are not imported anywhere)
  let unusedFiles: string[] = []
  if (detectUnusedFiles) {
    onProgress("Finding unused files", 0, 1)
    const allImportedFiles = new Set<string>()
    fileImportMap.forEach((importedFiles) => {
      importedFiles.forEach((file) => allImportedFiles.add(file))
    })

    // Get all files relative to the root
    const allRelativeFiles = files
      .map((file) => path.relative(directory, file))
      .filter((file) => !shouldIgnoreFile(file, allIgnorePatterns))

    // Find files that are not imported anywhere
    unusedFiles = allRelativeFiles.filter((file) => {
      // Skip entry points like index.js, app.js, main.js
      const basename = path.basename(file)
      if (
        [
          "index.js",
          "index.tsx",
          "index.ts",
          "index.jsx",
          "app.js",
          "app.tsx",
          "app.ts",
          "app.jsx",
          "main.js",
          "main.tsx",
          "main.ts",
          "main.jsx",
        ].includes(basename)
      ) {
        return false
      }

      return !allImportedFiles.has(file)
    })
    onProgress("Finding unused files", 1, 1)
  }

  // Find unused packages
  let unusedPackages: PackageInfo[] = []
  if (detectUnusedPackages) {
    onProgress("Finding unused packages", 0, 1)
    const packageJsonPath = path.join(directory, "package.json")
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
        const dependencies = packageJson.dependencies || {}
        const devDependencies = packageJson.devDependencies || {}

        // Check each dependency to see if it's used
        const checkDeps = (deps: Record<string, string>, isDev: boolean) => {
          return Object.entries(deps)
            .map(([name, version]) => ({
              name,
              version: version as string,
              isUsed: packageImports.has(name),
              isDev,
            }))
            .filter((pkg) => !pkg.isUsed)
        }

        unusedPackages = [...checkDeps(dependencies, false), ...checkDeps(devDependencies, true)]
      } catch (error) {
        if (!silent) {
          console.error("Error parsing package.json:", error)
        }
      }
    }
    onProgress("Finding unused packages", 1, 1)
  }

  const endTime = Date.now()
  const scanTime = endTime - startTime

  return {
    totalFiles: files.length,
    totalExports: exports.length,
    totalImports: imports.length,
    unusedExports,
    unusedFiles,
    unusedPackages,
    fileStats,
    scanTime,
  }
}

// Function to clean up unused files
export function removeUnusedFiles(directory: string, unusedFiles: string[]): string[] {
  const removedFiles: string[] = []

  for (const file of unusedFiles) {
    const fullPath = path.join(directory, file)
    try {
      fs.unlinkSync(fullPath)
      removedFiles.push(file)
    } catch (error) {
      console.error(`Error removing file ${file}:`, error)
    }
  }

  return removedFiles
}

// Function to uninstall unused packages
export function uninstallUnusedPackages(directory: string, unusedPackages: PackageInfo[]): string[] {
  if (unusedPackages.length === 0) return []

  const packageNames = unusedPackages.map((pkg) => pkg.name)

  try {
    // Check if yarn.lock exists to determine package manager
    const useYarn = fs.existsSync(path.join(directory, "yarn.lock"))
    const usePnpm = fs.existsSync(path.join(directory, "pnpm-lock.yaml"))

    let command = ""
    if (useYarn) {
      command = `yarn remove ${packageNames.join(" ")}`
    } else if (usePnpm) {
      command = `pnpm remove ${packageNames.join(" ")}`
    } else {
      command = `npm uninstall ${packageNames.join(" ")}`
    }

    execSync(command, { cwd: directory, stdio: "inherit" })
    return packageNames
  } catch (error) {
    console.error("Error uninstalling packages:", error)
    return []
  }
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2)
  const directory = args[0] || process.cwd()

  try {
    const result = await detectUnused(directory)

    console.log("\n=== Unused Detector Results ===")
    console.log(`Total files scanned: ${result.totalFiles}`)
    console.log(`Total exports found: ${result.totalExports}`)
    console.log(`Total imports found: ${result.totalImports}`)
    console.log(`Unused exports: ${result.unusedExports.length}`)
    console.log(`Unused files: ${result.unusedFiles.length}`)
    console.log(`Unused packages: ${result.unusedPackages.length}`)

    if (result.unusedExports.length > 0) {
      console.log("\nUnused exports:")
      result.unusedExports.forEach((exp) => {
        console.log(`- ${exp.name} in ${exp.filePath}`)
      })
    }

    if (result.unusedFiles.length > 0) {
      console.log("\nUnused files:")
      result.unusedFiles.forEach((file) => {
        console.log(`- ${file}`)
      })
    }

    if (result.unusedPackages.length > 0) {
      console.log("\nUnused packages:")
      result.unusedPackages.forEach((pkg) => {
        console.log(`- ${pkg.name}@${pkg.version}`)
      })
    }

    if (result.unusedExports.length === 0 && result.unusedFiles.length === 0 && result.unusedPackages.length === 0) {
      console.log("\nGreat job! No unused code or packages found.")
    }
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

// Run CLI if called directly
if (require.main === module) {
  main()
}
