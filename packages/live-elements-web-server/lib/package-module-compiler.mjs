import path from 'path';
import fs from 'fs';
import * as compiler from 'live-elements-js-compiler';
import { load as loadCompilerConfig } from 'live-elements-core/compilerconfig.mjs';
import { CompiledModuleManifest } from './compiled-module-manifest.mjs';

/**
 * Represents a compilation session for a package's modules.
 */
export class PackageModuleCompilation {
    static MODULE_DESCRIPTOR_FILE = '__module__.lv.json';

    /**
     * @param {string} buildRoot - The root directory where compiled files are stored.
     * @param {CompiledModuleManifest[]} modules - The compiled module manifests.
     */
    constructor(buildRoot, modules = [], errors = []) {
        this.buildRoot = buildRoot;
        this._modules = modules;
        this._errors = errors;
    }

    /**
     * Returns the list of all compiled modules.
     * @returns {CompiledModuleManifest[]}
     */
    get modules() {
        return this._modules;
    }

    /**
     * Returns the list of module compilation errors.
     * @returns {{ module: string, error: string }[]}
     */
    get errors() {
        return this._errors;
    }

    /**
     * Finds files with a specific extension in the build directory.
     * @param {string} extension - The file extension to search for (e.g., '.d.mts').
     * @returns {string[]} - A list of absolute paths to the found files.
     */
    find(extension) {
        const files = [];
        const findFiles = (dir) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        findFiles(fullPath);
                    } else if (entry.name.endsWith(extension)) {
                        files.push(fullPath);
                    }
                }
            } catch (e) {
                console.warn(`Warning: Could not read directory ${dir}: ${e.message}`);
            }
        };
        findFiles(this.buildRoot);
        return files;
    }
}

/**
 * Compiles Live Elements (.lv) modules within a package.
 */
export class PackageModuleCompiler {
    static Skipped = new Set(['node_modules', 'build', '.git'])

    static create(compilerHandle = null) {
        return new PackageModuleCompiler(compilerHandle);
    }

    constructor(compilerHandle = null) {
        this._compilerHandle = compilerHandle;
    }

    _compiler(config) {
        if (!this._compilerHandle) {
            const created = compiler.default.createCompiler(config);
            if (created.error) {
                const error = created.error;
                throw error instanceof Error ? error : new Error(error?.message ?? String(error));
            }
            this._compilerHandle = created.value;
        }
        return this._compilerHandle;
    }

    static _scan(root, ignoreList = []) {
        let dirs = [];
        const scanDir = (directory) => {
            const relSegments = path.relative(root, directory).split(path.sep).filter(Boolean)
            if (relSegments.some((segment) => PackageModuleCompiler.Skipped.has(segment) || segment.startsWith('.'))) {
                return;
            }
            const relPath = path.relative(root, directory);
            if (relPath && ignoreList.some(ig => relPath === ig || relPath.startsWith(ig + path.sep))) {
                return;
            }
            if (directory !== root && fs.existsSync(path.join(directory, 'package.json'))) {
                return;
            }
            const files = fs.readdirSync(directory, { withFileTypes: true });
            let lvFileFound = false;
            for (const file of files) {
                if (file.isDirectory()) {
                    scanDir(path.join(directory, file.name));
                } else if (file.name.endsWith('.lv')) {
                    lvFileFound = true;
                }
            }
            if (lvFileFound) {
                dirs.push(directory);
            }
        };
        scanDir(root);
        return dirs;
    }

    static moduleDirs(packagePath) {
        const packageJsonPath = path.join(packagePath, 'package.json');
        let ignoreList = [];
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const ignoreEntry = pkgJson?.lvcompiler?.modules?.ignore;
                if (ignoreEntry != null) {
                    ignoreList = [].concat(ignoreEntry);
                }
            } catch (e) {
                console.warn(`Warning: Could not read package.json at ${packageJsonPath}: ${e.message}`);
            }
        }

        return PackageModuleCompiler._scan(packagePath, ignoreList)
    }

    static readModuleEntries(buildPath, packagePath) {
        const metadataPath = path.join(buildPath, PackageModuleCompilation.MODULE_DESCRIPTOR_FILE);
        const contents = fs.readFileSync(metadataPath, 'utf8');
        let descriptor;
        try {
            descriptor = JSON.parse(contents);
        } catch (error) {
            throw new Error(
                `Failed to parse compiler metadata "${metadataPath}" (${contents.length} bytes): ${error.message}`,
                { cause: error }
            );
        }

        const uri = descriptor?.uri ?? null;
        if (!uri) {
            throw new Error(`Compiler metadata "${metadataPath}" is missing required "uri".`);
        }

        const modules = [];
        for (const moduleFile of descriptor.exports ?? []) {
            if (moduleFile?._ !== 'ModuleFile') {
                continue;
            }
            if (!moduleFile.fileName) {
                throw new Error(
                    `Compiler metadata "${metadataPath}" has a ModuleFile entry with no "fileName".`
                );
            }

            modules.push(new CompiledModuleManifest(
                uri,
                moduleFile.fileName,
                path.relative(packagePath, path.join(buildPath, `${moduleFile.fileName}.mjs`)),
                moduleFile.exports
            ));
        }

        return modules;
    }

    static fromBuildDir(packagePath) {
        const buildRoot = path.resolve(packagePath, 'build');
        const modules = PackageModuleCompiler.moduleDirs(packagePath).flatMap((modulePath) => {
            const buildPath = path.resolve(
                path.join(packagePath, 'build', path.relative(packagePath, modulePath))
            );
            const metadataPath = path.join(buildPath, PackageModuleCompilation.MODULE_DESCRIPTOR_FILE);
            if (!fs.existsSync(metadataPath)) {
                throw new Error(
                    `Missing compiler metadata for module "${modulePath}" at "${metadataPath}". `
                    + 'Recompile with overwrite to refresh build/.'
                );
            }

            return PackageModuleCompiler.readModuleEntries(buildPath, packagePath);
        });

        modules.sort((left, right) => (
            left.uri.localeCompare(right.uri) || left.fileName.localeCompare(right.fileName)
        ));
        return new PackageModuleCompilation(buildRoot, modules);
    }

    static _toError(value) {
        if (value instanceof Error) {
            return value;
        }
        if (value?.error) {
            if (value.source) {
                value.error.source = value.source;
                value.error.message += ' At file ' + value.source.file
                    + ':' + value.source.line + ':' + value.source.column;
            }
            return value.error;
        }
        return value ?? new Error('Internal lvimport error.');
    }

    static _compile(compilerHandle, modulePaths) {
        return new Promise((resolve, reject) => {
            compiler.default.runCompilerOnPackageModules(compilerHandle, modulePaths, (results, err) => {
                if (!results) {
                    reject(err ? PackageModuleCompiler._toError(err) : new Error('Internal lvimport error.'));
                    return;
                }

                resolve(results.map(({ path: modulePath, buildPath, error }) => (
                    error
                        ? { path: modulePath, buildPath, error: PackageModuleCompiler._toError(error) }
                        : { path: modulePath, buildPath }
                )));
            });
        });
    }

    async compile(packagePath) {
        const compilerHandle = this._compilerHandle ?? this._compiler(await loadCompilerConfig());
        const moduleDirs = PackageModuleCompiler.moduleDirs(packagePath);
        const modules = [];
        const errors = [];
        const results = await PackageModuleCompiler._compile(compilerHandle, moduleDirs);
        for (const { path: modulePath, buildPath, error } of results) {
            try {
                if (error) {
                    throw error;
                }
                if (!buildPath) {
                    throw new Error(`Compiler returned no build path for module "${modulePath}".`);
                }
                const expectedBuildPath = path.resolve(
                    path.join(packagePath, 'build', path.relative(packagePath, modulePath))
                );
                const resolvedBuildPath = path.resolve(buildPath);
                const normalizedBuildPath = fs.existsSync(resolvedBuildPath)
                    ? fs.realpathSync(resolvedBuildPath)
                    : resolvedBuildPath;
                const resolvedExpectedBuildPath = path.resolve(expectedBuildPath);
                const normalizedExpectedBuildPath = fs.existsSync(resolvedExpectedBuildPath)
                    ? fs.realpathSync(resolvedExpectedBuildPath)
                    : resolvedExpectedBuildPath;
                if (
                    normalizedBuildPath !== normalizedExpectedBuildPath
                ) {
                    throw new Error(
                        `Compiler returned build path "${buildPath}" for module "${modulePath}", `
                        + `but "${expectedBuildPath}" was expected.`
                    );
                }

                modules.push(...PackageModuleCompiler.readModuleEntries(expectedBuildPath, packagePath));
            } catch (e) {
                const message = e?.message ?? String(e);
                errors.push({ module: modulePath, error: message });
            }
        }

        const buildRoot = path.resolve(packagePath, 'build');
        if (!fs.existsSync(buildRoot) && errors.length === 0) {
            throw new Error(`Build directory not found at: ${buildRoot}`);
        }

        modules.sort((left, right) => (
            left.uri.localeCompare(right.uri) || left.fileName.localeCompare(right.fileName)
        ));
        return new PackageModuleCompilation(buildRoot, modules, errors);
    }
}
