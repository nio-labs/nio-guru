// Shared model priority for the NioGuru frontend and backend.
export type Model = { id: string; label: string }

export const DEFAULT_NIO_MODEL_ID = 'nioxs::nio-echo'
export const STEPFUN_IMAGE_MODEL_ID = 'kilo::stepfun/step-3.7-flash:free'
export const STEPFUN_IMAGE_MODEL: Model = { id: STEPFUN_IMAGE_MODEL_ID, label: 'StepFun: Step 3.7 Flash (free) · Kilo Gateway (free)' }

// Batoid Companion Pair Models
export const MANTA_MODEL_ID = 'nioxs::manta'
export const MANTA_MODEL: Model = { id: MANTA_MODEL_ID, label: 'Manta (494M Q4_0 · Nio Edge Full Brain)' }

export const SKATE_MODEL_ID = 'nioxs::skate'
export const SKATE_MODEL: Model = { id: SKATE_MODEL_ID, label: 'Skate (135M Q4_0 · Nio Micro Guru)' }

export const NIO_BATOID_MODELS: readonly Model[] = [
  MANTA_MODEL,
  SKATE_MODEL,
]

export function getStepFunImageModelId(models: readonly Model[]): string {
  return models.find(model => model.id === STEPFUN_IMAGE_MODEL_ID)?.id
    ?? models.find(model => /stepfun/i.test(`${model.id} ${model.label}`))?.id
    ?? STEPFUN_IMAGE_MODEL_ID
}

const modelText = (model: Model) => `${model.id} ${model.label}`.toLowerCase()
const isFree = (model: Model) => /\bfree\b/.test(modelText(model)) || model.id.startsWith('nioxs::')

// Choose only catalog entries marked free, so a paid variant never wins
// merely because its name matches a preferred model.
export function getPreferredNioModelId(models: readonly Model[]): string {
  const freeModels = models.filter(isFree)
  const preferred = freeModels.find(model => /nioxs::manta|manta/.test(modelText(model)))
    ?? freeModels.find(model => /nioxs::skate|skate/.test(modelText(model)))
    ?? freeModels.find(model => /nio[-_]?echo|nioxs::nio[-_]?echo/.test(modelText(model)))
    ?? freeModels.find(model => /stepfun/.test(modelText(model)))
    ?? freeModels.find(model => /kilo-auto\/free|kilo.*auto[\s-]+free|auto[\s-]+free.*kilo|^kilo::kilo-auto/.test(modelText(model)))
    ?? freeModels.find(model => /apodex|appodex/.test(modelText(model)))
  return preferred?.id ?? freeModels[0]?.id ?? models[0]?.id ?? DEFAULT_NIO_MODEL_ID
}
