/** Serialized browser-operation DTO. No Host, filesystem, React or renderer dependency. */
interface DirectorOperationIdentity {
  schemaVersion: 1; operationId: string; workspaceId: string; nodeId: string; sceneId: string;
  projectKey: string; sourceRevision: number; workspaceVersion: number;
}
export type DirectorOperationRequestDto = DirectorOperationIdentity & (
  | { action: 'open' }
  | { action: 'export'; kind: 'image' | 'video'; shot: { id: string; cameraId: string; duration: number; fps: 24 | 25 | 30 } }
);
