import { describe, it, expect } from "vitest";
import {
  createPromptTemplate,
  createPromptLibrary,
} from "../prompt-template.js";

describe("PromptTemplate", () => {
  it("extracts variable names from template", () => {
    const tmpl = createPromptTemplate({
      name: "test",
      template: "Hello {{name}}, you have {{count}} items.",
    });
    expect(tmpl.variables).toEqual(["name", "count"]);
  });

  it("renders template with variables", () => {
    const tmpl = createPromptTemplate({
      name: "greet",
      template: "Hello {{name}}, welcome to {{place}}!",
    });
    const result = tmpl.render({ name: "Alice", place: "Lattice" });
    expect(result).toBe("Hello Alice, welcome to Lattice!");
  });

  it("throws on missing variable", () => {
    const tmpl = createPromptTemplate({
      name: "test",
      template: "Hello {{name}}!",
    });
    expect(() => tmpl.render({})).toThrow('Missing template variable: {{name}}');
  });

  it("renders with system prompt", () => {
    const tmpl = createPromptTemplate({
      name: "assistant",
      systemPrompt: "You are a {{role}} assistant.",
      template: "Help with: {{task}}",
    });
    const result = tmpl.renderMessages({
      role: "technical",
      task: "code review",
    });
    expect(result.systemPrompt).toBe("You are a technical assistant.");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]!.content).toBe("Help with: code review");
    expect(result.messages[0]!.role).toBe("user");
  });

  it("extracts variables from system prompt too", () => {
    const tmpl = createPromptTemplate({
      name: "test",
      systemPrompt: "Act as {{role}}.",
      template: "Do {{action}}.",
    });
    expect(tmpl.variables).toEqual(["action", "role"]);
  });

  it("deduplicates variables", () => {
    const tmpl = createPromptTemplate({
      name: "test",
      template: "{{x}} and {{x}} again",
    });
    expect(tmpl.variables).toEqual(["x"]);
  });

  it("handles template with no variables", () => {
    const tmpl = createPromptTemplate({
      name: "static",
      template: "Just a static prompt.",
    });
    expect(tmpl.variables).toEqual([]);
    expect(tmpl.render({})).toBe("Just a static prompt.");
  });
});

describe("PromptLibrary", () => {
  it("registers and retrieves templates", () => {
    const lib = createPromptLibrary();
    const tmpl = createPromptTemplate({
      name: "summarize",
      template: "Summarize: {{text}}",
    });
    lib.register(tmpl);

    const found = lib.get("summarize");
    expect(found).toBeDefined();
    expect(found!.name).toBe("summarize");
  });

  it("returns undefined for unknown template", () => {
    const lib = createPromptLibrary();
    expect(lib.get("nonexistent")).toBeUndefined();
  });

  it("lists all templates", () => {
    const lib = createPromptLibrary();
    lib.register(
      createPromptTemplate({ name: "a", template: "{{x}}" }),
    );
    lib.register(
      createPromptTemplate({ name: "b", template: "{{y}}" }),
    );
    expect(lib.list()).toHaveLength(2);
  });

  it("overwrites template with same name", () => {
    const lib = createPromptLibrary();
    lib.register(
      createPromptTemplate({ name: "test", template: "v1: {{x}}" }),
    );
    lib.register(
      createPromptTemplate({ name: "test", template: "v2: {{x}}" }),
    );
    expect(lib.list()).toHaveLength(1);
    expect(lib.get("test")!.template).toBe("v2: {{x}}");
  });
});
