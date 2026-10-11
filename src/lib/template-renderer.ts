/**
 * Replace {{variable}} placeholders in a template string.
 * Unknown variables are left as-is (e.g., {{missing}}).
 */
export function renderTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (match, key: string) => variables[key] ?? match
  );
}
