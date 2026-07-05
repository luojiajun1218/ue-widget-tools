import { describe, expect, it } from "vitest";

import {
  createCloseEditorInvocation,
  createOpenEditorInvocation
} from "../ueLifecycle.js";

describe("UE editor lifecycle helpers", () => {
  it("creates a Windows taskkill invocation for UnrealEditor", () => {
    const invocation = createCloseEditorInvocation({ force: true });

    expect(invocation.command).toBe("taskkill.exe");
    expect(invocation.args).toEqual(["/IM", "UnrealEditor.exe", "/T", "/F"]);
  });

  it("creates a hidden UnrealEditor launch invocation for the project", () => {
    const invocation = createOpenEditorInvocation({
      projectRoot: "C:/Projects/MistyPlanet",
      engineRoot: "C:/Program Files/Epic Games/UE_5.7"
    });

    expect(invocation.command).toBe("C:\\Program Files\\Epic Games\\UE_5.7\\Engine\\Binaries\\Win64\\UnrealEditor.exe");
    expect(invocation.args).toEqual(["C:\\Projects\\MistyPlanet\\MistyPlanet.uproject"]);
    expect(invocation.cwd).toBe("C:\\Projects\\MistyPlanet");
  });
});
