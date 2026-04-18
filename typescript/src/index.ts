import * as fs from 'fs';
import * as path from 'path';
import { Parser } from './parser.js';
import { generate } from './codegen.js';

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node dist/index.js <input.yap> [output.c]');
    process.exit(1);
}

const inputPath = args[0];
const outputPath = args[1] ?? path.basename(inputPath, path.extname(inputPath)) + '.c';

const source = fs.readFileSync(inputPath, 'utf-8');

try {
    const parser = new Parser(source);
    const program = parser.parseProgram();
    const cCode = generate(program);
    fs.writeFileSync(outputPath, cCode, 'utf-8');
    console.log(`Transpiled ${inputPath} -> ${outputPath}`);
} catch (err) {
    console.error('Error:', (err as Error).message);
    process.exit(1);
}
