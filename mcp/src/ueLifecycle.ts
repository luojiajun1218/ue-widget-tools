import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { buildProjectCpp, type BuildCppResult } from "./projectBuilder.js";
import {
  buildCppSchema,
  closeEditorSchema,
  openEditorSchema,
  rebuildCppWithEditorRestartSchema,
  type CloseEditorInput,
  type OpenEditorInput,
  type RebuildCppWithEditorRestartInput
} from "./schemas.js";

export interface ProcessResult {
  ok: boolean;
  command: string;
  args: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface OpenEditorResult {
  ok: boolean;
  command: string;
  args: string[];
  pid?: number;
}

export interface RebuildWithRestartResult {
  ok: boolean;
  close?: ProcessResult;
  build: BuildCppResult;
  open?: OpenEditorResult;
}

export function createCloseEditorInvocation(input: CloseEditorInput = {}) {
  const parsed = closeEditorSchema.parse(input);
  const args = ["/IM", "UnrealEditor.exe", "/T"];
  if (parsed.force) {
    args.push("/F");
  }

  return {
    command: process.platform === "win32" ? "taskkill.exe" : "pkill",
    args: process.platform === "win32" ? args : ["-f", "UnrealEditor"],
    timeoutMs: parsed.timeoutMs
  };
}

export function createOpenEditorInvocation(input: OpenEditorInput = {}) {
  const parsed = openEditorSchema.parse(input);
  const projectRoot = resolve(parsed.projectRoot);
  const projectPath = resolve(projectRoot, "MistyPlanet.uproject");
  const editorExe = resolve(parsed.engineRoot, "Engine", "Binaries", "Win64", "UnrealEditor.exe");

  return {
    command: editorExe,
    args: [projectPath, ...parsed.extraArgs],
    cwd: projectRoot
  };
}

export async function closeEditor(input: CloseEditorInput = {}): Promise<ProcessResult> {
  const invocation = createCloseEditorInvocation(input);
  return runProcess(invocation.command, invocation.args, { timeoutMs: invocation.timeoutMs });
}

export async function openEditor(input: OpenEditorInput = {}): Promise<OpenEditorResult> {
  const invocation = createOpenEditorInvocation(input);

  if (!existsSync(invocation.command)) {
    throw new Error(`UnrealEditor.exe not found: ${invocation.command}`);
  }

  if (!existsSync(invocation.args[0])) {
    throw new Error(`Project file not found: ${invocation.args[0]}`);
  }

  const child = spawn(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    detached: true,
    shell: false,
    windowsHide: true,
    stdio: "ignore"
  });
  child.unref();

  return {
    ok: true,
    command: invocation.command,
    args: invocation.args,
    pid: child.pid
  };
}

export async function rebuildCppWithEditorRestart(
  input: RebuildCppWithEditorRestartInput = {}
): Promise<RebuildWithRestartResult> {
  const parsed = rebuildCppWithEditorRestartSchema.parse(input);
  const {
    closeEditor: shouldCloseEditor,
    openEditor: shouldOpenEditor,
    forceClose,
    reopenOnFailure,
    ...rawBuildInput
  } = parsed;
  const buildInput = buildCppSchema.parse(rawBuildInput);
  const result: RebuildWithRestartResult = {
    ok: false,
    build: {
      ok: false,
      command: "",
      args: [],
      exitCode: null,
      stdout: "",
      stderr: ""
    }
  };

  if (shouldCloseEditor) {
    result.close = await closeEditor({ force: forceClose });
  }

  result.build = await buildProjectCpp(buildInput);

  if (shouldOpenEditor && (result.build.ok || reopenOnFailure)) {
    result.open = await openEditor({
      projectRoot: parsed.projectRoot,
      engineRoot: parsed.engineRoot
    });
  }

  result.ok = result.build.ok && (result.open?.ok ?? true);
  return result;
}

function runProcess(
  command: string,
  args: string[],
  options: { timeoutMs: number }
): Promise<ProcessResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolveResult({
        ok: exitCode === 0 || exitCode === 128,
        command,
        args,
        exitCode,
        stdout,
        stderr
      });
    });
  });
}
