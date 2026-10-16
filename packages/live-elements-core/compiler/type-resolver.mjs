import path from 'node:path'
import ts from 'typescript'

export class TypeResolver {
    static defaultCompilerOptions = {
        allowJs: true,
        checkJs: false,
        strict: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        noEmit: true,
        skipLibCheck: true,
        types: [],
    }

    constructor(settings = {}) {
        this.strictDiagnostics = settings.strictDiagnostics ?? true
        this.compilerOptions = { ...TypeResolver.defaultCompilerOptions, ...settings.compilerOptions }
    }

    static create(settings = {}) {
        return new TypeResolver(settings)
    }

    run(requests = []) {
        if (requests.length === 0) {
            return []
        }

        const memoryFileMap = new Map()
        const requestSourcePaths = new Set()
        for (const request of requests) {
            const sourcePath = path.resolve(request.sourcePath)
            requestSourcePaths.add(sourcePath)
            if (request.sourceText) {
                memoryFileMap.set(sourcePath, request.sourceText)
            }
        }

        const options = this.compilerOptions
        const host = TypeResolver.createCompilerHost(options, memoryFileMap)
        const program = ts.createProgram({ rootNames: Array.from(requestSourcePaths), options, host })
        const checker = program.getTypeChecker()
        const diagnosticsBySourcePath = new Map()
        const unmatchedDiagnostics = []

        if (this.strictDiagnostics) {
            for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
                const sourcePath = diagnostic.file?.fileName ? path.resolve(diagnostic.file.fileName) : null
                if (sourcePath === null || !requestSourcePaths.has(sourcePath)) {
                    unmatchedDiagnostics.push(diagnostic)
                    continue
                }

                const bucket = diagnosticsBySourcePath.get(sourcePath) ?? []
                bucket.push(TypeResolver.toContractDiagnostic(diagnostic))
                diagnosticsBySourcePath.set(sourcePath, bucket)
            }
        }

        if (unmatchedDiagnostics.length > 0) {
            throw new Error(ts.formatDiagnosticsWithColorAndContext(unmatchedDiagnostics, {
                getCanonicalFileName: (fileName) => fileName,
                getCurrentDirectory: () => process.cwd(),
                getNewLine: () => '\n',
            }))
        }

        return requests.map((request) => {
            const requestDiagnostics = diagnosticsBySourcePath.get(path.resolve(request.sourcePath))
            if (requestDiagnostics?.some((diagnostic) => diagnostic.severity === 'error')) {
                return {
                    requestId: request.requestId,
                    diagnostics: requestDiagnostics,
                }
            }

            return TypeResolver.resolveRequest(program, checker, request)
        })
    }

    static resolveRequest(program, checker, request) {
        const sourceFile = program.getSourceFile(path.resolve(request.sourcePath))
        if (!sourceFile) {
            throw new Error(`resolveTypes: Program missing source file ${request.sourcePath}`)
        }

        const declaration = TypeResolver.findFunctionDeclaration(sourceFile, request.functionName)
        if (!declaration) {
            throw new Error(
                `resolveTypes: Missing function "${request.functionName}" in ${request.sourcePath}`
            )
        }

        const typeImports = new Set(['FunctionType'])
        const signature = checker.getSignaturesOfType(
            checker.getTypeAtLocation(declaration),
            ts.SignatureKind.Call
        )[0]

        if (!signature) {
            throw new Error(
                `resolveTypes: Function "${request.functionName}" in ${request.sourcePath} has no call signature`
            )
        }

        const context = {
            checker,
            sourcePath: path.resolve(request.sourcePath),
            functionName: request.functionName,
            typeImports,
        }
        const returnType = TypeResolver.typeToRuntimeExpr(checker.getReturnTypeOfSignature(signature), context)
        const params = signature.getParameters().map((param) => {
            const paramType = checker.getTypeOfSymbolAtLocation(param, declaration)
            return TypeResolver.typeToRuntimeExpr(paramType, context)
        })
        const typeParameterNames = (declaration.typeParameters ?? []).map((tp) => tp.name.text)
        const args = `${returnType}${params.length ? `, ${params.join(', ')}` : ''}`

        return {
            requestId: request.requestId,
            typeExpression: typeParameterNames.length
                ? `FunctionType.withParametersFor([${typeParameterNames.map((name) => JSON.stringify(name)).join(', ')}], ${args})`
                : `FunctionType.for(${args})`,
            typeImports: [...typeImports].sort(),
        }
    }

    static toContractDiagnostic(diagnostic) {
        return {
            severity: diagnostic.category === ts.DiagnosticCategory.Warning ? 'warning' : 'error',
            code: diagnostic.code === 2304 ? 'unresolved-identifier' : `ts${diagnostic.code}`,
            message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        }
    }

    static createCompilerHost(options, memoryFileMap) {
        const host = ts.createCompilerHost(options, true)
        const originalFileExists = host.fileExists?.bind(host)
        const originalReadFile = host.readFile?.bind(host)
        const originalGetSourceFile = host.getSourceFile?.bind(host)

        host.fileExists = (fileName) => {
            const normalizedFileName = path.resolve(fileName)
            if (memoryFileMap.has(normalizedFileName)) {
                return true
            }
            return originalFileExists ? originalFileExists(fileName) : false
        }

        host.readFile = (fileName) => {
            const normalizedFileName = path.resolve(fileName)
            if (memoryFileMap.has(normalizedFileName)) {
                return memoryFileMap.get(normalizedFileName)
            }
            return originalReadFile ? originalReadFile(fileName) : undefined
        }

        host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
            const normalizedFileName = path.resolve(fileName)
            if (memoryFileMap.has(normalizedFileName)) {
                return ts.createSourceFile(
                    fileName,
                    memoryFileMap.get(normalizedFileName),
                    languageVersion,
                    true,
                    ts.getScriptKindFromFileName(fileName)
                )
            }

            return originalGetSourceFile
                ? originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
                : undefined
        }

        return host
    }

    static findFunctionDeclaration(sourceFile, functionName) {
        let declaration = null

        const visit = (node) => {
            if (!declaration && ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
                declaration = node
            }
            ts.forEachChild(node, visit)
        }

        visit(sourceFile)

        return declaration
    }

    static typeToRuntimeExpr(type, context) {
        const { checker, sourcePath, functionName, typeImports } = context

        if (type.flags & ts.TypeFlags.Any) {
            if (type.intrinsicName === 'error') {
                throw new Error(
                    `Cannot resolve type "${checker.typeToString(type)}" for ${functionName} in ${sourcePath} - unresolved or error type (e.g. type arguments applied to a non-generic type)`
                )
            }
            typeImports.add('Type')
            return 'Type.any'
        }
        if (type.flags & ts.TypeFlags.Unknown) {
            typeImports.add('Type')
            return 'Type.any'
        }
        if (type.flags & ts.TypeFlags.Number) {
            typeImports.add('Type')
            return 'Type.number'
        }
        if (type.flags & ts.TypeFlags.String) {
            typeImports.add('Type')
            return 'Type.string'
        }
        if (type.flags & ts.TypeFlags.Boolean) {
            typeImports.add('Type')
            return 'Type.boolean'
        }
        if (type.flags & ts.TypeFlags.BigInt) {
            typeImports.add('Type')
            return 'Type.bigint'
        }
        if (type.flags & ts.TypeFlags.ESSymbol) {
            typeImports.add('Type')
            return 'Type.symbol'
        }
        if (type.flags & ts.TypeFlags.Undefined) {
            typeImports.add('Type')
            return 'Type.undefined'
        }
        if (type.flags & ts.TypeFlags.Void) {
            typeImports.add('Type')
            return 'Type.undefined'
        }
        if (type.flags & ts.TypeFlags.Null) {
            typeImports.add('Type')
            return 'Type.null'
        }

        if (type.isLiteral()) {
            return TypeResolver.typeToRuntimeExpr(checker.getBaseTypeOfLiteralType(type), context)
        }

        if (checker.isArrayType(type)) {
            const [elementType] = checker.getTypeArguments(type)
            if (!elementType) {
                throw new Error(
                    `Cannot resolve type "${checker.typeToString(type)}" for ${functionName} in ${sourcePath} - not representable in types.mjs`
                )
            }

            typeImports.add('ArrayType')
            return `ArrayType.for(${TypeResolver.typeToRuntimeExpr(elementType, context)})`
        }

        if (type.flags & ts.TypeFlags.Union) {
            throw new Error(
                `Cannot resolve type "${checker.typeToString(type)}" for ${functionName} in ${sourcePath} - not representable in types.mjs`
            )
        }

        if (type.flags & ts.TypeFlags.Intersection) {
            throw new Error(
                `Cannot resolve type "${checker.typeToString(type)}" for ${functionName} in ${sourcePath} - not representable in types.mjs`
            )
        }

        if (type.flags & ts.TypeFlags.TypeParameter) {
            typeImports.add('TypeVariable')
            return `TypeVariable.for(${JSON.stringify(type.symbol?.getName() ?? checker.typeToString(type))})`
        }

        const callSignatures = type.getCallSignatures()
        if (callSignatures.length > 0) {
            const signature = callSignatures[0]
            const returnType = TypeResolver.typeToRuntimeExpr(checker.getReturnTypeOfSignature(signature), context)
            const params = signature.getParameters().map((param) => {
                const declaration = param.valueDeclaration ?? param.declarations?.[0]
                return TypeResolver.typeToRuntimeExpr(checker.getTypeOfSymbolAtLocation(param, declaration), context)
            })
            typeImports.add('FunctionType')
            return `FunctionType.for(${returnType}${params.length ? `, ${params.join(', ')}` : ''})`
        }

        const symbol = type.getSymbol() ?? type.aliasSymbol
        const typeArguments = checker.getTypeArguments(type)

        if (symbol && typeArguments.length > 0) {
            if ((symbol.flags & ts.SymbolFlags.Value) === 0) {
                throw new Error(
                    `Cannot resolve type "${checker.typeToString(type)}" for ${functionName} in ${sourcePath} - not representable in types.mjs`
                )
            }

            typeImports.add('GenericType')
            return `GenericType.for(${symbol.getName()}, ${typeArguments
                .map((typeArgument) => TypeResolver.typeToRuntimeExpr(typeArgument, context))
                .join(', ')})`
        }

        if (symbol && (symbol.flags & ts.SymbolFlags.Value) !== 0) {
            typeImports.add('Type')
            return `Type.for(${symbol.getName()})`
        }

        const properties = type.getProperties()
        if (properties) {
            const fields = properties.map((property) => {
                const declaration = property.valueDeclaration ?? property.declarations?.[0]
                const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration)
                return `${JSON.stringify(property.getName())}: ${TypeResolver.typeToRuntimeExpr(propertyType, context)}`
            })

            typeImports.add('ObjectType')
            const name = type.aliasSymbol?.getName()
                ?? ((symbol?.flags & ts.SymbolFlags.Interface) !== 0 ? symbol.getName() : null)
            const meta = name ? `, { "name": ${JSON.stringify(name)} }` : ''
            return `ObjectType.for({ ${fields.join(', ')} }${meta})`
        }

        throw new Error(
            `Cannot resolve type "${checker.typeToString(type)}" for ${functionName} in ${sourcePath} - not representable in types.mjs`
        )
    }
}

export function resolveTypes(requests, opts = {}) {
    return TypeResolver.create({
        strictDiagnostics: opts.strictDiagnostics,
        compilerOptions: opts.compilerOptions,
    }).run(requests)
}
