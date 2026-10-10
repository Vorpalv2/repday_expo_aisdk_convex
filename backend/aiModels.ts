export const AI_COACH_MODELS = [
  { id: 'openai/gpt-5-mini', label: 'GPT-5 mini', detail: 'Chat model · uses monthly Gateway credits' },
] as const;

export type AICoachModelId = (typeof AI_COACH_MODELS)[number]['id'];
export const DEFAULT_AI_COACH_MODEL: AICoachModelId = 'openai/gpt-5-mini';

export function isAICoachModelId(value: unknown): value is AICoachModelId {
  return AI_COACH_MODELS.some((model) => model.id === value);
}
