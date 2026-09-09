import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Box, Button, ChakraProvider, Flex, Heading, Text } from '@chakra-ui/react'
import deconstruct from '../../../../packages/form-contract/templates/video-deconstruct/definition.json'
import replication from '../../../../packages/form-contract/templates/structure-replication/definition.json'
import replacement from '../../../../packages/form-contract/templates/element-replacement/definition.json'
import { validateDefinition } from '@omnimux/form-contract'
import { createEditor } from './model.js'
import { FormField } from './Fields.jsx'
import { formSystem, primary, secondary } from './theme.js'

export const templates = [deconstruct, replication, replacement]
export function checkedTemplates(raw = templates) {
  const results = raw.map(validateDefinition)
  return results.some(result => !result.ok) ? null : results.map(result => result.value)
}
function Example({ example }) {
  return <Box as="figure" margin="0"><Box aspectRatio="16/9" width="100%" overflow="hidden" borderRadius="10px" bg="var(--dsw-alias-bg-layer-2)">{example.kind === 'video' ? <Box as="video" src={example.ref} controls preload="metadata" aria-label={example.title} width="100%" height="100%" objectFit="contain" /> : <Box as="img" src={example.ref} alt={example.title} width="100%" height="100%" objectFit="contain" />}</Box><Text as="figcaption" marginTop="10px" fontSize="13px" color="var(--dsw-alias-label-secondary)">{example.title}</Text></Box>
}
export function Editor(props) {
  const checked = useMemo(() => validateDefinition(props.definition), [props.definition])
  return checked.ok ? <ValidEditor {...props} definition={checked.value} /> : <Box className="omnimux-forms-error" padding="24px" role="alert">模板配置不可用，无法生成草稿。</Box>
}
function ValidEditor({ definition, workspace, hub, onBack }) {
  const editor = useMemo(() => createEditor({ definition, workspaceId: workspace.id, hub }), [definition, workspace.id, hub])
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot)
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => { void editor.load(); return () => editor.dispose() }, [editor])
  useEffect(() => {
    if (!state.focusRevision || !state.errors.length) return
    const field = state.errors.find(e => e.path[0] === 'values')?.path[1]
    const root = document.querySelector(`[data-form-field="${field}"]`)
    root?.querySelector('input:not([type="file"]):not([type="hidden"]):not([hidden]),textarea,button,[tabindex="0"]')?.focus()
  }, [state.focusRevision])
  return <Flex direction="column" height="100%" minHeight="0">
    <Flex align="center" justify="space-between" gap="12px" padding="20px 24px" borderBottom="1px solid var(--dsw-alias-border-l1)"><Button {...secondary} disabled={state.busy} onClick={onBack}>全部模板</Button><Text fontSize="13px" color="var(--dsw-alias-label-secondary)">{workspace.title || '当前工作区'}</Text></Flex>
    <Box overflowY="auto" flex="1" minHeight="0" padding={{ base: '20px 16px', md: '28px' }}>
      <Box maxWidth="1120px" marginInline="auto"><Heading fontFamily="inherit" fontSize="20px" fontWeight="600" margin="0 0 8px">{definition.title}</Heading><Text fontSize="14px" color="var(--dsw-alias-label-secondary)" margin="0 0 28px">{definition.description}</Text>
        <Box display="grid" gridTemplateColumns={{ base: 'minmax(0,1fr)', lg: 'minmax(280px, 0.85fr) minmax(0,1fr)' }} gap={{ base: '24px', lg: '40px' }}>
          <Box><Box position={{ base: 'static', lg: 'sticky' }} top="0"><Text fontSize="13px" fontWeight="500" marginBottom="12px">案例参考</Text><Flex direction="column" gap="20px">{definition.examples.map(example => <Example key={example.ref} example={example} />)}</Flex><Text fontSize="12px" color="var(--dsw-alias-label-secondary)" marginTop="12px">案例仅供参考。请在右侧选择自己的素材。</Text></Box></Box>
          <Flex direction="column" gap="24px" minWidth="0">{state.loading ? <Text className="omnimux-forms-loading" role="status">正在恢复填写内容…</Text> : state.invalid || state.restoreInvalid ? <Text className="omnimux-forms-error" role="alert">{state.notice}</Text> : definition.fields.map(field => <FormField key={field.id} field={field} value={state.values[field.id]} errors={state.errors.filter(e => e.path[1] === field.id)} disabled={state.busy} editor={editor} state={state} hub={hub} workspaceId={workspace.id} />)}</Flex>
        </Box>
      </Box>
    </Box>
    <Box flexShrink="0" borderTop="1px solid var(--dsw-alias-border-l2)" bg="var(--dsw-alias-bg-base)" padding="12px 24px">
      {state.notice && <Text role={state.success ? 'status' : 'alert'} fontSize="13px" marginBottom="8px">{state.notice}</Text>}
      <Flex align="center" justify="space-between" gap="12px" wrap="wrap"><Flex align="center" gap="8px"><Button {...secondary} disabled={state.loading || state.busy || state.invalid} onClick={() => setConfirmReset(true)}>重置表单</Button><Text role="status" fontSize="12px" color="var(--dsw-alias-label-secondary)">{state.saveStatus}</Text></Flex><Button {...primary} disabled={state.loading || state.busy || state.invalid || state.restoreInvalid} onClick={() => editor.submit()}>{state.busy ? '正在生成草稿…' : '生成会话草稿'}</Button></Flex>
      {confirmReset && <Flex role="alertdialog" aria-label="重置表单" align="center" gap="12px" paddingTop="12px" wrap="wrap"><Text fontSize="13px">重置此模板的填写内容？已导入的源文件不会删除。</Text><Button {...secondary} onClick={() => setConfirmReset(false)}>取消</Button><Button {...secondary} onClick={() => { setConfirmReset(false); void editor.reset() }}>确认重置</Button></Flex>}
    </Box>
  </Flex>
}
export function FormsPage({ definitions = templates } = {}) {
  const available = useMemo(() => checkedTemplates(definitions), [definitions])
  const [hub, setHub] = useState(() => window.__omnimuxForms)
  useEffect(() => { const ready = () => setHub(window.__omnimuxForms); window.addEventListener('omnimux-forms-ready', ready); return () => window.removeEventListener('omnimux-forms-ready', ready) }, [])
  const [workspace, setWorkspace] = useState(() => hub?.getWorkspace?.() ?? null)
  const [selected, setSelected] = useState(null)
  useEffect(() => { setWorkspace(hub?.getWorkspace?.() ?? null); return hub?.subscribeWorkspace?.(() => setWorkspace(hub.getWorkspace())) }, [hub])
  return <ChakraProvider value={formSystem}><Box className="omnimux-forms-body" height="100%" minHeight="0" width="100%" color="var(--dsw-alias-label-primary)" bg="var(--dsw-alias-bg-base)" fontFamily="inherit" fontSize="14px">
    {!available ? <Box className="omnimux-forms-error" padding="24px" role="alert">模板配置不可用，无法打开任务表单。</Box> : !hub ? <Box padding="24px" role="alert">会话服务尚未就绪，请重新打开任务表单。</Box> : !workspace ? <Box padding="24px" role="status">请先打开目标工作区中的会话，再进入任务表单。</Box> : selected ? <Editor key={`${workspace.id}:${selected.id}`} definition={selected} workspace={workspace} hub={hub} onBack={() => setSelected(null)} /> : <Box overflowY="auto" height="100%" padding={{ base: '24px 16px', md: '32px' }}><Box maxWidth="1080px" marginInline="auto"><Heading fontFamily="inherit" fontSize="20px" fontWeight="600" margin="0 0 8px">任务表单</Heading><Text color="var(--dsw-alias-label-secondary)" margin="0 0 28px">从参考视频出发，整理拆解与复刻要求。</Text><Flex direction="column" gap="24px">{available.map((template, index) => <Box key={template.id} display="grid" gridTemplateColumns={{ base: 'minmax(0,1fr)', md: '240px minmax(0,1fr)' }} gap="24px" paddingBottom="24px" borderBottom="1px solid var(--dsw-alias-border-l2)"><Example example={template.examples[0]} /><Flex direction="column" align="start" justify="center" gap="12px"><Text fontSize="12px" color="var(--dsw-alias-label-secondary)">{String(index + 1).padStart(2, '0')}</Text><Heading fontFamily="inherit" fontSize="16px" fontWeight="600" margin="0">{template.title}</Heading><Text fontSize="14px" color="var(--dsw-alias-label-secondary)" margin="0">{template.description}</Text><Button {...secondary} onClick={() => setSelected(template)}>填写表单</Button></Flex></Box>)}</Flex></Box></Box>}
  </Box></ChakraProvider>
}
