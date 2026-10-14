// Generates the TypeScript lexers/parsers/visitors from the ANTLR grammars in
// src/engine/parsers/antlr into src/engine/parsers/generated (gitignored).
// Runs on postinstall and before builds; run manually after editing a grammar.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const grammarDir = join(root, "src", "engine", "parsers", "antlr");
const outDir = join(root, "src", "engine", "parsers", "generated");

const grammars = readdirSync(grammarDir).filter(f => f.endsWith(".g4")).sort().map(f => join(grammarDir, f));

rmSync(outDir, { recursive: true, force: true });
const result = spawnSync(process.execPath, [
    join(root, "node_modules", "antlr-ng", "dist", "cli", "runner.js"),
    "-Dlanguage=TypeScript",
    "--generate-visitor",
    "--generate-listener", "false",
    "--warnings-are-errors",
    "-o", outDir,
    "--lib", grammarDir,
    ...grammars,
], { stdio: "inherit" });

if (result.status !== 0)
{
    console.error("Parser generation failed");
    process.exit(result.status ?? 1);
}
// Make every lexer extend JavaLexer, which fixes antlr4ng's handling of an empty text override
// (see src/engine/parsers/grammar/JavaLexer.ts):
for (const file of readdirSync(outDir).filter(f => f.endsWith(".ts")))
{
    const path = join(outDir, file);
    const src = readFileSync(path, "utf8");
    if (!src.includes(" extends antlr.Lexer {"))
        continue;
    writeFileSync(path, src
        .replace(" extends antlr.Lexer {", " extends JavaLexer {")
        .replace('import * as antlr from "antlr4ng";', 'import * as antlr from "antlr4ng";\nimport { JavaLexer } from "../grammar/JavaLexer.js";'));
}
console.log(`Generated parsers for ${grammars.length} grammars into ${outDir}`);
