import fs from 'node:fs';
import path from 'node:path';
import { loadAll } from '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/plugins/omnimux/src/catalog/contract/load.js';

const WT = '/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/omnimux-apps-preset-operation-issue-3206';
const PRESETS = path.join(WT, 'plugins/omnimux-apps/catalog/presets');
const cat = loadAll();
const m = cat.get('seedance-2-0');
if (!m) throw new Error('seedance-2-0 not found');
const listed = cat.listedOperationsFor ? cat.listedOperationsFor('seedance-2-0') : [];
console.log('seedance-2-0 listed operations:', (listed.map ? listed.map((o) => (typeof o === 'string' ? o : o.id)) : []).join(', '));
const byOp = new Map((m.operations || []).map((o) => [o.id, o]));

const files = fs.readdirSync(PRESETS).filter((f) => f.endsWith('.workflow.json')).sort();
const rows = [];
let bad = 0;
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(PRESETS, f), 'utf8'));
  for (const n of j.nodes.filter((n) => n.data?.materialType === 'video' && n.data?.model)) {
    const op = n.data.params?.operation;
    const mode = n.data.params?.mode;
    const decl = op ? byOp.get(op) : undefined;
    const slots = decl ? (decl.inputs || []).filter((i) => i.source === 'upstream_edge').map((i) => i.slot) : [];
    const edges = j.edges.filter((e) => e.target === n.id && e.data?.targetSlot);
    const ok = !!decl && !mode && edges.every((e) => slots.includes(e.data.targetSlot));
    if (!ok) bad++;
    rows.push({ 模板: f.replace('.workflow.json', ''), operation: op ?? '(缺失)', mode: mode ?? '-', 契约槽位: slots.join('|') || '-', 连线槽位: edges.map((e) => e.data.targetSlot).join('|') || '-', 判定: ok ? 'OK' : 'FAIL' });
  }
}
console.table(rows);
console.log(bad === 0 ? `✅ ${rows.length} 个视频节点全部与契约真源（video-models.yaml）一致` : `❌ ${bad} 个节点与契约不一致`);
process.exit(bad === 0 ? 0 : 1);
