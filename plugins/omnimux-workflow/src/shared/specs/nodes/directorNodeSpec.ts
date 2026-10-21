import type { NodeSpec } from '../contracts.ts';

/** Director editing is local and explicit; exported media lives in ordinary material nodes. */
export const directorNodeSpec: NodeSpec = {
  type: 'director',
  ports: [{ side: 'in', acceptedTypes: ['text', 'image'], multi: true }],
  tools: {},
  defaultTool: 'director',
  executorKey: 'director',
};
