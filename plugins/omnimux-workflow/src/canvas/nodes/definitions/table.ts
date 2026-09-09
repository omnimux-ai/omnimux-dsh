import { TableNode } from '../../components/table-node/TableNode';
import type { NodeDefinition } from '../registry';

export const tableNodeDefinition: NodeDefinition = {
  type: 'table',
  component: TableNode,
  ports: [
    // Output contract: can connect to any downstream material node for batch processing
    { side: 'out', acceptedTypes: ['text', 'image', 'video', 'audio'] },
  ],
  defaultData: () => ({
    label: '表格',
    title: '表格',
    materialType: 'table',
    tableId: '',
    tablePath: '',
    columnCount: 1,
    rowCount: 0,
    contentRev: 0,
    previewRows: [],
    status: 'empty',
  }),
  palette: {
    group: 'palette.group.data',
    label: '表格',
    icon: 'table',
  },
};
