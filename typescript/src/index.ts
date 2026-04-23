import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser/parser.js';
import type { FnDecl, ObjectTypeDecl, Program } from './parser/parser.js';
import { generate } from './codegen/codegen.js';
import { typecheckProgram } from './typecheck/typecheck.js';

function resolveImportPath(fromFile: string, importPath: string): string {
    const fromDir = path.dirname(fromFile);
    const resolved = path.resolve(fromDir, importPath);
    if (fs.existsSync(resolved)) {
        return resolved;
    }

    if (!resolved.endsWith('.yap')) {
        const withYapExtension = `${resolved}.yap`;
        if (fs.existsSync(withYapExtension)) {
            return withYapExtension;
        }
    }

    throw new Error(`Import not found: '${importPath}' (from ${fromFile})`);
}

function loadProgramFromFile(entryPath: string): Program {
    const visited = new Set<string>();
    const resolving = new Set<string>();
    const allFns: FnDecl[] = [];
    const allObjectTypes: ObjectTypeDecl[] = [];
    const seenObjectTypeNames = new Set<string>();

    const visit = (filePath: string): void => {
        const absolutePath = path.resolve(filePath);
        if (visited.has(absolutePath)) {
            return;
        }
        if (resolving.has(absolutePath)) {
            throw new Error(`Circular import detected involving ${absolutePath}`);
        }

        const source = fs.readFileSync(absolutePath, 'utf-8');
        const program = new Parser(source).parseProgram();

        resolving.add(absolutePath);
        try {
            for (const importPath of program.imports ?? []) {
                const importedFilePath = resolveImportPath(absolutePath, importPath);
                visit(importedFilePath);
            }

            for (const objectType of program.objectTypes ?? []) {
                if (seenObjectTypeNames.has(objectType.name)) {
                    throw new Error(`Duplicate object type declaration '${objectType.name}'`);
                }
                seenObjectTypeNames.add(objectType.name);
                allObjectTypes.push(objectType);
            }
            allFns.push(...program.fns);
            visited.add(absolutePath);
        } finally {
            resolving.delete(absolutePath);
        }
    };

    visit(entryPath);
    if (allObjectTypes.length > 0) {
        return { fns: allFns, objectTypes: allObjectTypes };
    }
    return { fns: allFns };
}

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node dist/index.js <input.yap> [output.c]');
    process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1] ?? path.basename(inputPath, path.extname(inputPath)) + '.c';

try {
    const program = loadProgramFromFile(inputPath);
    typecheckProgram(program);
    const cCode = generate(program);
    fs.writeFileSync(outputPath, cCode, 'utf-8');
    console.log(`Transpiled ${inputPath} -> ${outputPath}`);
} catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
}
