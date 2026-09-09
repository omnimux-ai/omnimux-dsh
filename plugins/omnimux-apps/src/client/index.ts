/**
 * plugins/omnimux-apps/src/client/index.ts
 *
 * Client entry point for OmniMux AI Applications.
 * Exports form engine, stage workspace, and stage claiming utilities.
 */

export { AppFormPanel, type AppFormPanelProps } from './AppFormPanel.tsx';
export { AppWorkspaceView, type AppWorkspaceViewProps } from './AppWorkspaceView.tsx';
export {
  claimProductStage,
  releaseProductStage,
  PRODUCT_STAGE_ID,
  APP_OPEN_EVENT,
  TABS_CHANGED_EVENT,
} from './stage.ts';
