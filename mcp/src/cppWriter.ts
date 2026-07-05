import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { generateWidgetCpp } from "./cppGenerator.js";
import { writeWidgetCppSchema, type WriteWidgetCppInput } from "./schemas.js";

export interface WriteWidgetCppOptions {
  projectRoot?: string;
}

export interface WrittenWidgetCpp {
  headerPath: string;
  cppPath: string;
}

export function writeWidgetCpp(input: WriteWidgetCppInput, options: WriteWidgetCppOptions = {}): WrittenWidgetCpp {
  const parsed = writeWidgetCppSchema.parse(input);
  const projectRoot = path.resolve(options.projectRoot ?? defaultProjectRoot());
  const fileStem = headerFileName(parsed.className).replace(/\.h$/, "");
  const publicGeneratedDir = path.join(projectRoot, "Source", "MistyPlanet", "Public", "UI", "Generated");
  const privateGeneratedDir = path.join(projectRoot, "Source", "MistyPlanet", "Private", "UI", "Generated");
  const headerPath = resolveGuardedPath(parsed.headerPath, publicGeneratedDir, `${fileStem}.h`, "Public/UI/Generated");
  const cppPath = resolveGuardedPath(parsed.cppPath, privateGeneratedDir, `${fileStem}.cpp`, "Private/UI/Generated");
  const { headerPath: _headerPath, cppPath: _cppPath, ...generatorInput } = parsed;
  const generated = generateWidgetCpp(generatorInput);

  mkdirSync(path.dirname(headerPath), { recursive: true });
  mkdirSync(path.dirname(cppPath), { recursive: true });
  writeFileSync(headerPath, generated.header, "utf8");
  writeFileSync(cppPath, generated.cpp, "utf8");

  return { headerPath, cppPath };
}

function resolveGuardedPath(candidate: string | undefined, allowedDir: string, defaultFileName: string, label: string): string {
  const resolved = path.resolve(allowedDir, candidate ?? defaultFileName);
  const relative = path.relative(allowedDir, resolved);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Generated C++ path must stay inside Source/MistyPlanet/${label}`);
  }

  return resolved;
}

function defaultProjectRoot(): string {
  const sourceDir = path.dirname(fileURLToPath(import.meta.url));

  return path.resolve(sourceDir, "..", "..", "..");
}

function headerFileName(className: string): string {
  const fileStem = className.startsWith("U") && className.length > 1 ? className.slice(1) : className;

  return `${fileStem}.h`;
}
