// Shared model priority for the NioGuru frontend and backend.
type Model = { id: string; label: string }

export const DEFAULT_NIO_MODEL_ID = 'kilo::kilo-auto/free'
export const STEPFUN_IMAGE_MODEL_ID = 'kilo::stepfun/step-3.7-flash:free'
export const STEPFUN_IMAGE_MODEL = { id: STEPFUN_IMAGE_MODEL_ID, label: 'StepFun: Step 3.7 Flash (free) · Kilo Gateway (free)' }

export function getStepFunImageModelId(models: readonly Model[]): string {
  return models.find(model => model.id === STEPFUN_IMAGE_MODEL_ID)?.id
    ?? models.find(model => /stepfun/i.test(`${model.id} ${model.label}`))?.id
    ?? STEPFUN_IMAGE_MODEL_ID
}

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
