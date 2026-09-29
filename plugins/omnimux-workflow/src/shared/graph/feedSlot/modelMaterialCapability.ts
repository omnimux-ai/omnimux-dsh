import type { CapabilityCatalog } from '../../api.ts';
import { bindableSlots, buildContractView, resolveModelView } from '../../validation/compatKernel.ts';
import { deriveSlotLayout } from './deriveSlotLayout.ts';
import type { SlotLayout } from './types.ts';

/**
 * Model-level material capability display: when the selected operation has no
 * bindable media slots but another listed operation of the same model does,
 * borrow that operation's slot layout so the material wells stay visible.
 * The returned layout is flagged with `displayOnlyFromOperation`; submitting
 * through these slots must first switch the node's operation to that id.
 */
export function deriveModelSlotLayout(
  catalog: CapabilityCatalog | null | undefined,
  modelId: string | undefined,
  operationId: string | undefined,
  options?: { outputType?: string },
): SlotLayout {
  const own = deriveSlotLayout(catalog, modelId, operationId, options);
  if (own.preset !== 'none' && own.slots.length) return own;
  const model = resolveModelView(buildContractView(catalog), modelId);
  if (!model) return own;
  const currentOutputType = options?.outputType
    ?? model.operations.find((op) => op.id === operationId)?.output.type;
  const borrowed = model.operations.find(
    (op) => op.id !== operationId
      && op.listed
      && (!currentOutputType || op.output.type === currentOutputType)
      && bindableSlots(op).length,
  );
  if (!borrowed) return own;
  const layout = deriveSlotLayout(catalog, modelId, borrowed.id, options);
  if (layout.preset === 'none' || !layout.slots.length) return own;
  layout.displayOnlyFromOperation = borrowed.id;
  return layout;
}
