import { forwardRef } from 'react'
import type { PageHeaderProps } from './PageHeader.tsx'
import { PageHeader } from './PageHeader.tsx'

export type StageHeaderProps = PageHeaderProps

/**
 * StageHeader forwards to PageHeader for backward compatibility.
 * Standard Layer 1 Header for OmniMux first-level product stages.
 * Typography single source of truth: 20px / 600 / 28px.
 */
export const StageHeader = forwardRef<HTMLElement, StageHeaderProps>(function StageHeader(
  props,
  ref,
) {
  return <PageHeader {...props} ref={ref} />
})
