import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { buildCppSchema, type BuildCppInput } from "./schemas.js";

export interface BuildCppResult {
  ok: boolean;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  hint?: string;
}

export function createBuildCppInvocation(input: BuildCppInput = {}) {
  const parsed = buildCppSchema.parse(input);
  const projectRoot = resolve(parsed.projectRoot);
  const projectPath = resolve(projectRoot, "MistyPlanet.uproject");
  const buildBat = resolve(parsed.engineRoot, "Engine", "Build", "BatchFiles", "Build.bat");
  const args = [
    parsed.target,
    parsed.platform,
    parsed.configuration,
    `-Project=${projectPath}`
  ];

  if (parsed.waitMutex) {
    args.push("-WaitMutex");
  }

  if (parsed.noHotReload) {
    args.push("-NoHotReload");
  }

  return { buildBat, args, projectRoot, projectPath };
}

export async function buildProjectCpp(input: BuildCppInput = {}): Promise<BuildCppResult> {
  const invocation = createBuildCppInvocation(input);

  if (!existsSync(invocation.buildBat)) {
    throw new Error(`Unreal Build.bat not found: ${invocation.buildBat}`);
  }

  if (!existsSync(invocation.projectPath)) {
    throw new Error(`Project file not found: ${invocation.projectPath}`);
  }

  return new Promise((resolveResult, reject) => {
    const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : invocation.buildBat;
    const args =
      process.platform === "win32"
        ? ["/d", "/s", "/c", quoteCommand([invocation.buildBat, ...invocation.args])]
        : invocation.args;
    const child = spawn(command, args, {
      cwd: invocation.projectRoot,
      shell: false,
      windowsVerbatimArguments: process.platform === "win32",
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      const combined = `${stdout}\n${stderr}`;
      const locked =
        exitCode !== 0 &&
        (combined.includes("LNK1104") ||
          combined.includes("UnrealEditor-WidgetBridge.dll") ||
          combined.includes("Unable to build while Live Coding is active"));

      resolveResult({
        ok: exitCode === 0,
        command,
        args,
        exitCode,
        stdout,
        stderr,
        hint: locked
          ? "UE Editor or Live Coding may be locking editor DLLs. Prefer ue.project.rebuild_cpp_with_editor_restart for close -> build -> reopen, or use UE Live Coding intentionally."
          : undefined
      });
    });
  });
}

function quoteCommand(parts: string[]): string {
  const inner = parts.map((part) => `"${part.replace(/"/g, '\\"')}"`).join(" ");
  return `"${inner}"`;
}
