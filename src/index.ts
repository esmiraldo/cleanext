#!/usr/bin/env node

import fs from "fs"
import path from "path"
import { glob } from "glob"
import { parse } from "@babel/parser"
import traverse from "@babel/traverse"
import { execSync } from "child_process"

type ExportInfo = {
  name: string
  filePath: string
}

type ImportInfo = {
  name: string
  importedIn: string
  source?: string
}

type PackageInfo = {
  name: string
  version: string
  isUsed: boolean
}

type DetectionResult = {
  totalFiles: number
  totalExports: number
  totalImports: number
  unusedExports: ExportInfo[]
  unusedFiles: string[]
  unusedPackages: PackageInfo[]
}

export type { ExportInfo, ImportInfo, PackageInfo, DetectionResult }

const DEFAULT_IGNORE = [
  "node_modules/**",
  ".next/**",
  "dist/**",
  "build/**",
  "coverage/**",
  "**/*.test.{js,jsx,ts,tsx}",
  "**/*.spec.{js,jsx,ts,tsx}",
  "**/*.d.ts",
]

export async function detectUnused(
  directory: string,
  options: {
    ignorePatterns?: string[]
    detectUnusedFiles?: boolean
    detectUnusedPackages?: boolean
  } = {},
): Promise<DetectionResult> {
  const { ignorePatterns = [], detectUnusedFiles = true, detectUnusedPackages = true } = options

  console.log("Scanning directory:", directory)

  const allIgnorePatterns = [...DEFAULT_IGNORE, ...ignorePatterns]

  const files = await glob("**/*.{js,jsx,ts,tsx}", {
    cwd: directory,
    ignore: allIgnorePatterns,
    absolute: true,
  })

  console.log(`Found ${files.length} files to analyze`)

  const exports: ExportInfo[] = []
  const imports: ImportInfo[] = []
  const packageImports: Set<string> = new Set()
  const fileImportMap: Map<string, string[]> = new Map()

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, "utf-8")
      const ast = parse(content, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "classProperties", "decorators-legacy"],
      })

      const relativePath = path.relative(directory, file)
      fileImportMap.set(relativePath, [])

      traverse(ast, {
        ExportNamedDeclaration(nodePath) {
          const declaration = nodePath.node.declaration

          if (
            declaration &&
            (declaration.type === "FunctionDeclaration" || declaration.type === "ClassDeclaration") &&
            declaration.id
          ) {
            exports.push({
              name: declaration.id.name,
              filePath: relativePath,
            })
          }

          if (declaration && declaration.type === "VariableDeclaration") {
            declaration.declarations.forEach((declarator) => {
              if (declarator.id.type === "Identifier") {
                exports.push({
                  name: declarator.id.name,
                  filePath: relativePath,
                })
              }
            })
          }

          if (nodePath.node.specifiers) {
            nodePath.node.specifiers.forEach((specifier) => {
              if (specifier.type === "ExportSpecifier") {
                exports.push({
                  name: specifier.exported.type === "Identifier" ? specifier.exported.name : specifier.exported.value,
                  filePath: relativePath,
                })
              }
            })
          }
        },
        ExportDefaultDeclaration(nodePath) {
          const declaration = nodePath.node.declaration

          if (declaration.type === "Identifier") {
            exports.push({
              name: `default(${declaration.name})`,
              filePath: relativePath,
            })
          } else {
            exports.push({
              name: "default",
              filePath: relativePath,
            })
          }
        },
      })

      traverse(ast, {
        ImportDeclaration(nodePath) {
          const source = nodePath.node.source.value as string

          if (!source.startsWith(".") && !source.startsWith("/")) {
            const packageName = source.split("/")[0]
            packageImports.add(packageName)
          } else {
            let importPath = source
            if (
              !importPath.endsWith(".js") &&
              !importPath.endsWith(".jsx") &&
              !importPath.endsWith(".ts") &&
              !importPath.endsWith(".tsx")
            ) {
              const possibleExtensions = [".js", ".jsx", ".ts", ".tsx"]
              const dir = path.dirname(file)

              for (const ext of possibleExtensions) {
                const fullPath = path.resolve(dir, `${importPath}${ext}`)
                if (fs.existsSync(fullPath)) {
                  importPath = `${importPath}${ext}`
                  break
                }

                const indexPath = path.join(dir, importPath, `index${ext}`)
                if (fs.existsSync(indexPath)) {
                  importPath = path.join(importPath, `index${ext}`)
                  break
                }
              }
            }

            const resolvedPath = path.resolve(path.dirname(file), importPath)
            const relativeToRoot = path.relative(directory, resolvedPath)
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
              })
            }
          })
        },
      })
    } catch (error) {
      console.error(`Error parsing ${file}:`, error)
    }
  }

  const unusedExports = exports.filter((exp) => {
    return !imports.some((imp) => imp.name === exp.name)
  })

  let unusedFiles: string[] = []
  if (detectUnusedFiles) {
    const allImportedFiles = new Set<string>()
    fileImportMap.forEach((importedFiles) => {
      importedFiles.forEach((file) => allImportedFiles.add(file))
    })

    const allRelativeFiles = files.map((file) => path.relative(directory, file))

    unusedFiles = allRelativeFiles.filter((file) => {
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
  }

  let unusedPackages: PackageInfo[] = []
  if (detectUnusedPackages) {
    const packageJsonPath = path.join(directory, "package.json")
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"))
        const dependencies = {
          ...(packageJson.dependencies || {}),
          ...(packageJson.devDependencies || {}),
        }

        // Check each dependency to see if it's used
        unusedPackages = Object.entries(dependencies)
          .map(([name, version]) => ({
            name,
            version: version as string,
            isUsed: packageImports.has(name),
          }))
          .filter((pkg) => !pkg.isUsed)
      } catch (error) {
        console.error("Error parsing package.json:", error)
      }
    }
  }

  return {
    totalFiles: files.length,
    totalExports: exports.length,
    totalImports: imports.length,
    unusedExports,
    unusedFiles,
    unusedPackages,
  }
}

export function removeUnusedFiles(directory: string, unusedFiles: string[]): string[] {
  const removedFiles: string[] = []

  for (const file of unusedFiles) {
    const fullPath = path.join(directory, file)
    try {
      fs.unlinkSync(fullPath)
      removedFiles.push(file)
      console.log(`Removed unused file: ${file}`)
    } catch (error) {
      console.error(`Error removing file ${file}:`, error)
    }
  }

  return removedFiles
}

export function uninstallUnusedPackages(directory: string, unusedPackages: PackageInfo[]): string[] {
  if (unusedPackages.length === 0) return []

  const packageNames = unusedPackages.map((pkg) => pkg.name)
  console.log(`Uninstalling unused packages: ${packageNames.join(", ")}`)

  try {
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

if (require.main === module) {
  main()
}
