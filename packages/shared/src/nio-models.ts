// Shared model priority for the NioGuru frontend and backend.
type Model = { id: string; label: string }

export const DEFAULT_NIO_MODEL_ID = 'kilo::kilo-auto/free'

const modelText = (model: Model) => `${model.id} ${model.label}`.toLowerCase()
const isFree = (model: Model) => /\bfree\b/.test(modelText(model))

// Choose only catalog entries marked free, so a paid variant never wins
// merely because its name matches a preferred model.
export function getPreferredNioModelId(models: readonly Model[]): string {
  const freeModels = models.filter(isFree)
  const preferred = freeModels.find(model => /apodex|appodex/.test(modelText(model)))
    ?? freeModels.find(model => /north[\s-]+mini[\s-]+code/.test(modelText(model)))
    ?? freeModels.find(model => /kilo-auto\/free|kilo.*auto[\s-]+free|auto[\s-]+free.*kilo/.test(modelText(model)))
  return preferred?.id ?? freeModels[0]?.id ?? models[0]?.id ?? DEFAULT_NIO_MODEL_ID
}
