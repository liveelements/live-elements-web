import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as compiler from 'live-elements-js-compiler';

/**
 * Represents a compilation session for a package's modules.
 */
export class PackageModuleCompilation {
    static currentDir() {
        return path.dirname(fileURLToPath(import.meta.url));
    }

    /**
     * @param {string} buildRoot - The root directory where compiled files are stored.
     * @param {string[]} moduleList - The list of compiled module paths.
     */
    constructor(buildRoot, moduleList = [], errors = []) {
        this.buildRoot = buildRoot;
        this._moduleList = moduleList;
        this._errors = errors;
    }

    /**
     * Returns the list of all compiled modules.
     * @returns {string[]}
     */
    get moduleList() {
        return this._moduleList;
    }

    /**
     * Returns the list of module compilation errors.
     * @returns {{ module: string, mdoule: string, error: string }[]}
     */
    get errors() {
        return this._errors;
    }

    /**
     * Finds files with a specific extension in the build directory.
     * @param {string} extension - The file extension to search for (e.g., '.d.ts').
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
    static create() {
        return new PackageModuleCompiler();
    }

    static _scan(root, ignoreList = []) {
        let dirs = [];
        const scanDir = (directory) => {
            if (directory.includes('node_modules') || directory.includes('build') || directory.includes('.git')) {
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

    static _compileInternal(modulePath, config) {
        return new Promise((resolve, reject) => {
            compiler.default.compileModule(modulePath, config, (result, err) => {
                if (result) {
                    resolve(result);
                } else if (err) {
                    if (err instanceof Error) {
                        reject(err);
                    } else if (err.error) {
                        if (err.source) {
                            err.error.source = err.source;
                            err.error.message += ' At file ' + err.error.source.file + ':' + err.error.source.line + ':' + err.error.source.column;
                        }
                        reject(err.error);
                    } else {
                        reject(err);
                    }
                } else {
                    reject(new Error("Internal lvimport error."));
                }
            });
        });
    }

    /**
     * Compiles all .lv modules found in the specified package path.
     * @param {string} packagePath - The path to the package containing .lv files.
     * @param {string} coreConfigPath - Optional path to a compiler configuration file.
     * @returns {Promise<PackageModuleCompilation>}
     */
    async compile(packagePath, coreConfigPath) {
        if (!coreConfigPath) {
            coreConfigPath = path.resolve(PackageModuleCompilation.currentDir(), '../../live-elements-core/compiler.config.json');
        }
        let compilerConfig = {};
        if (coreConfigPath && fs.existsSync(coreConfigPath)) {
            compilerConfig = JSON.parse(fs.readFileSync(coreConfigPath, 'utf8'));
        }

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

        const modules = PackageModuleCompiler._scan(packagePath, ignoreList);
        const errors = [];
        for (const modulePath of modules) {
            try {
                await PackageModuleCompiler._compileInternal(modulePath, compilerConfig);
            } catch (e) {
                const message = e?.message ?? String(e);
                errors.push({ module: modulePath, mdoule: modulePath, error: message });
            }
        }

        const buildRoot = path.resolve(packagePath, 'build');
        if (!fs.existsSync(buildRoot)) {
            throw new Error(`Build directory not found at: ${buildRoot}`);
        }

        return new PackageModuleCompilation(buildRoot, modules, errors);
    }
}
