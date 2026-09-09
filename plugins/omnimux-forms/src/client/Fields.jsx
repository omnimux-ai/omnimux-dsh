import React from 'react'
import { Box, Button, Field, FileUpload, Flex, Input, NumberInput, RadioCard, Slider, Text, Textarea } from '@chakra-ui/react'
import { control, secondary } from './theme.js'

export function FormField({ field, value, errors, disabled, editor, state, hub, workspaceId }) {
  const id = `omnimux-form-${field.id}`, error = errors.map(e => e.message).join('；')
  const change = next => editor.set(field.id, next)
  let input
  if (field.type === 'text') input = <Input id={id} {...control} px="10px" value={value ?? ''} maxLength={field.maxLength} onChange={e => change(e.target.value)} />
  if (field.type === 'textarea') input = <Textarea id={id} {...control} height="auto" minHeight="104px" padding="10px" resize="vertical" value={value ?? ''} maxLength={field.maxLength} onChange={e => change(e.target.value)} />
  if (field.type === 'number') input = <NumberInput.Root id={id} value={value === undefined ? '' : String(value)} min={field.min} max={field.max} step={field.step} disabled={disabled} onValueChange={e => change(e.value === '' ? undefined : Number.isFinite(e.valueAsNumber) ? e.valueAsNumber : undefined)}>
    <NumberInput.Input {...control} px="10px" aria-label={field.label} />
    <NumberInput.Control><NumberInput.IncrementTrigger aria-label={`增加${field.label}`} /><NumberInput.DecrementTrigger aria-label={`减少${field.label}`} /></NumberInput.Control>
  </NumberInput.Root>
  if (field.type === 'slider') input = <Slider.Root id={id} min={field.min} max={field.max} step={field.step} value={[typeof value === 'number' ? value : field.min]} disabled={disabled} onValueChange={e => change(e.value[0])}>
    <Flex justify="space-between"><Slider.Label>{field.label}</Slider.Label><Slider.ValueText /></Flex>
    <Slider.Control paddingBlock="12px"><Slider.Track height="4px" bg="var(--dsw-alias-bg-layer-3)"><Slider.Range bg="var(--dsw-alias-label-primary)" /></Slider.Track><Slider.Thumb index={0} width="16px" height="16px" bg="var(--dsw-alias-label-primary)" borderColor="var(--dsw-alias-border-l3)"><Slider.HiddenInput aria-label={field.label} /></Slider.Thumb></Slider.Control>
  </Slider.Root>
  if (field.type === 'select' || field.type === 'aspect-ratio') input = <RadioCard.Root id={id} value={value ?? null} disabled={disabled} onValueChange={e => change(e.value ?? undefined)} aria-label={field.label}>
    <Flex gap="8px" wrap="wrap">{field.options.map(option => <RadioCard.Item key={option.value} value={option.value} cursor="pointer" border="1px solid var(--dsw-alias-border-l2)" borderRadius="8px" boxShadow="none" bg="var(--dsw-alias-bg-layer-1)" _checked={{ borderColor: 'var(--dsw-alias-label-primary)', bg: 'var(--dsw-alias-interactive-bg-active)' }} _focusWithin={{ outline: '2px solid var(--dsw-alias-brand-primary)', outlineOffset: '2px' }}>
      <RadioCard.ItemHiddenInput /><RadioCard.ItemControl minHeight="32px" padding="8px 12px" gap="8px">{field.type === 'aspect-ratio' && <Box aria-hidden="true" width="20px" height="20px" display="flex" alignItems="center" justifyContent="center"><Box border="1px solid currentColor" width="16px" maxHeight="20px" aspectRatio={option.value.replace(':', '/')} /></Box>}<RadioCard.ItemText fontSize="14px">{option.label}</RadioCard.ItemText></RadioCard.ItemControl>
    </RadioCard.Item>)}</Flex>
  </RadioCard.Root>
  if (field.type === 'file') input = <Box width="100%">
    <FileUpload.Root acceptedFiles={[]} maxFiles={field.maxFiles} maxFileSize={field.maxBytes} accept={field.accept} disabled={disabled} onFileAccept={e => editor.importFiles(field, e.files)} onFileReject={() => editor.rejectFiles()}>
      <FileUpload.HiddenInput id={id} aria-label={field.label} />
      <FileUpload.Dropzone padding="20px" minHeight="104px" border="1px dashed var(--dsw-alias-border-l3)" borderRadius="10px" bg="var(--dsw-alias-bg-layer-1)" _dragging={{ borderColor: 'var(--dsw-alias-brand-primary)' }}>
        <FileUpload.Trigger asChild><Button {...secondary}>选择文件</Button></FileUpload.Trigger>
        <Text fontSize="13px" color="var(--dsw-alias-label-secondary)">或拖放到这里，最多 {field.maxFiles} 个，每个不超过 {Math.round(field.maxBytes / 1024 / 1024)} MB</Text>
      </FileUpload.Dropzone>
    </FileUpload.Root>
    {(Array.isArray(value) ? value : []).map(item => <Flex key={item.ref} align="center" gap="10px" py="8px" borderBottom="1px solid var(--dsw-alias-border-l1)">
      {hub.getFileUrl && !state.staleRefs.includes(item.ref) && <Box flexShrink={0} width="64px" height="48px" overflow="hidden" borderRadius="8px">{item.mimeType.startsWith('image/') ? <img alt={item.name} src={hub.getFileUrl({ workspaceId, assetId: item.ref })} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : item.mimeType.startsWith('video/') ? <video aria-label={item.name} src={hub.getFileUrl({ workspaceId, assetId: item.ref })} controls preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : null}</Box>}
      <Box flex="1" minWidth="0"><Text fontSize="13px" overflowWrap="anywhere">{item.name}</Text><Text fontSize="12px" color={state.staleRefs.includes(item.ref) ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)'}>{state.staleRefs.includes(item.ref) ? '素材已失效，请重新选择' : `${(item.sizeBytes / 1024 / 1024).toFixed(1)} MB`}</Text></Box>
      <Button {...secondary} disabled={disabled} onClick={() => editor.removeAttachment(field.id, item.ref)} aria-label={`移除${item.name}`}>移除</Button>
    </Flex>)}
    {state.uploads.filter(u => u.fieldId === field.id).map(upload => <Flex key={upload.id} align="center" gap="8px" py="8px"><Box flex="1" minWidth="0"><Text fontSize="13px" overflowWrap="anywhere">{upload.file.name}</Text><Text role={upload.error ? 'alert' : 'status'} fontSize="12px">{upload.error || `导入中 ${Math.round(upload.progress * 100)}%`}</Text></Box>{upload.error && <Button {...secondary} onClick={() => editor.upload(upload)}>重试</Button>}<Button {...secondary} onClick={() => editor.removeUpload(upload.id)}>移除</Button></Flex>)}
  </Box>
  return <Field.Root id={`${id}-field`} invalid={Boolean(error)} required={field.required} disabled={disabled} gap="8px" data-form-field={field.id}>
    <Field.Label htmlFor={id} fontSize="14px" fontWeight="500">{field.label}<Field.RequiredIndicator /></Field.Label>
    {field.description && <Field.HelperText fontSize="13px" color="var(--dsw-alias-label-secondary)">{field.description}</Field.HelperText>}
    {input}<Field.ErrorText fontSize="13px" color="var(--dsw-alias-state-error-primary)">{error}</Field.ErrorText>
  </Field.Root>
}
