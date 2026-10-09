export const AI_COACH_MODELS = [
  { id: 'google/gemini-3.5-flash-lite', label: 'Gemini Flash Lite', detail: 'Fast and economical' },
  { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', detail: 'Balanced' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku', detail: 'Detailed responses' },
] as const;

export type AICoachModelId = (typeof AI_COACH_MODELS)[number]['id'];
export const DEFAULT_AI_COACH_MODEL: AICoachModelId = 'openai/gpt-5-mini';

export function isAICoachModelId(value: unknown): value is AICoachModelId {
  return AI_COACH_MODELS.some((model) => model.id === value);
}
