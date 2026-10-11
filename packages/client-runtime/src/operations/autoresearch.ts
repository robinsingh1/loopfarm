const PREFIX = "Autoresearch · ";
const CONTROLS = new Set([
  "help",
  "off",
  "clear",
  "finalize",
  "export",
  "dashboard",
  "--help",
  "-h",
]);

export function autoresearchGoal(text: string): string | null {
  const match = /^\s*\/autoresearch\s+([\s\S]+)$/i.exec(text);
  if (!match || CONTROLS.has(match[1]!.trim().toLowerCase())) return null;
  return match[1]!
    .trim()
    .replace(/^Goal:\s*/i, "")
    .split(/\r?\n/)[0]!
    .trim();
}
export function isAutoresearchTitle(title: string): boolean {
  return title.startsWith(PREFIX);
}
export function autoresearchTitle(text: string): string | null {
  const goal = autoresearchGoal(text);
  return goal ? PREFIX + goal.slice(0, 100) : null;
}
export function buildAutoresearchPrompt(input: {
  goal: string;
  metric: string;
  checks: string;
  iterations: number;
}): string {
  if (![input.goal, input.metric, input.checks].every((value) => value.trim().length > 0))
    throw new Error("Add a goal, measurable metric, and correctness checks.");
  if (!Number.isInteger(input.iterations) || input.iterations < 2 || input.iterations > 5)
    throw new Error("Choose 2–5 experiments, including the baseline.");
  const line = (value: string) => value.trim().replace(/\s+/g, " ");
  return `/autoresearch Goal: ${line(input.goal)}\nMetric and direction: ${line(input.metric)}\nCorrectness checks: ${line(input.checks)}\nExperiment budget: ${input.iterations}, including the baseline. Configure .auto/config.json maxIterations to ${input.iterations} before measuring. Use a clean isolated checkout; keep changes in the agreed project scope. Measure and log the baseline, then test candidates using native run_experiment and log_experiment. Never modify the benchmark or checks to improve the metric. Yield after each logged experiment for Clef. Honor the budget; do not reset it. Report final measurements and validation.`;
}
