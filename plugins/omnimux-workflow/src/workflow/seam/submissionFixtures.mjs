// Offline contracts for boundary captures; not product model support declarations.
export function slot(type, role = 'reference', min = 0, max = 4, name = `reference_${type}s`) {
  return { slot: name, type, role, min, max, source: 'upstream_edge' };
}
export function operation(id, type, inputs = [], promptRequired = true) {
  return { id, listed: true, output: { type }, inputs: [
    { slot: 'prompt', role: 'prompt', type: 'text', source: 'node_field', min: promptRequired ? 1 : 0, max: 1 }, ...inputs,
  ] };
}
export function catalogFor(type = 'text', id = 'test-model', operations = [operation('generate', type)]) {
  return { source: 'static-stub', schemaVersion: '1.1', defaults: { [type]: id },
    text: [], image: [], video: [], audio: [], [type]: [{ id, label: id }],
    models: [{ id, label: id, listed: true, operations }] };
}
