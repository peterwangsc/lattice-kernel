import type { Message } from "@lattice-kernel/schemas";

export interface PromptTemplate {
  readonly name: string;
  readonly description?: string;
  readonly systemPrompt?: string;
  readonly template: string;
  readonly variables: string[];
  render(vars: Record<string, string>): string;
  renderMessages(vars: Record<string, string>): {
    systemPrompt?: string;
    messages: Message[];
  };
}

export interface PromptTemplateConfig {
  name: string;
  description?: string;
  systemPrompt?: string;
  /** Template string with {{variable}} placeholders. */
  template: string;
}

/**
 * Creates a reusable prompt template with variable interpolation.
 *
 * Variables use {{name}} syntax. The template validates that all
 * required variables are provided at render time.
 */
export function createPromptTemplate(
  config: PromptTemplateConfig,
): PromptTemplate {
  const variablePattern = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];

  // Extract variable names from template
  let match: RegExpExecArray | null;
  const pattern = new RegExp(variablePattern.source, "g");
  while ((match = pattern.exec(config.template)) !== null) {
    if (!variables.includes(match[1]!)) {
      variables.push(match[1]!);
    }
  }

  // Also extract from system prompt
  if (config.systemPrompt) {
    const sysPattern = new RegExp(variablePattern.source, "g");
    while ((match = sysPattern.exec(config.systemPrompt)) !== null) {
      if (!variables.includes(match[1]!)) {
        variables.push(match[1]!);
      }
    }
  }

  function interpolate(text: string, vars: Record<string, string>): string {
    return text.replace(variablePattern, (_, name: string) => {
      if (!(name in vars)) {
        throw new Error(
          `Missing template variable: {{${name}}} in template "${config.name}"`,
        );
      }
      return vars[name]!;
    });
  }

  return {
    name: config.name,
    description: config.description,
    systemPrompt: config.systemPrompt,
    template: config.template,
    variables,

    render(vars: Record<string, string>): string {
      return interpolate(config.template, vars);
    },

    renderMessages(vars: Record<string, string>): {
      systemPrompt?: string;
      messages: Message[];
    } {
      const renderedSystem = config.systemPrompt
        ? interpolate(config.systemPrompt, vars)
        : undefined;
      const renderedContent = interpolate(config.template, vars);

      return {
        systemPrompt: renderedSystem,
        messages: [{ role: "user", content: renderedContent }],
      };
    },
  };
}

export interface PromptLibrary {
  register(template: PromptTemplate): void;
  get(name: string): PromptTemplate | undefined;
  list(): PromptTemplate[];
}

export function createPromptLibrary(): PromptLibrary {
  const templates = new Map<string, PromptTemplate>();

  return {
    register(template: PromptTemplate): void {
      templates.set(template.name, template);
    },

    get(name: string): PromptTemplate | undefined {
      return templates.get(name);
    },

    list(): PromptTemplate[] {
      return [...templates.values()];
    },
  };
}
