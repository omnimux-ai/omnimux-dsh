import { z } from 'zod';

const finite = z.number().finite();
const id = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const name = z.string().max(240);
const vector = z.tuple([finite, finite, finite]);
const quaternion = z.tuple([finite, finite, finite, finite]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const transform = z.object({ position: vector, rotation: vector, scale: vector });
const easing = z.enum(['step', 'linear', 'smooth']).optional();
const resource = z.string().max(1024).refine(value => {
  if (value.includes('\\') || value.includes('\0') || value.split('/').includes('..') || value.includes('?') || value.includes('#')) return false;
  return /^(assets\/imported\/|artifacts\/)[A-Za-z0-9_./ -]+$/.test(value)
    || /^\/omnimux-workflow\/director-assets\/[A-Za-z0-9_.-]+$/.test(value);
}, 'resource must be a managed relative path');
const keyframe = z.object({
  id, time: finite.min(0).max(120), transform, easing,
  positionKeyed: z.boolean().optional(), rotationKeyed: z.boolean().optional(), scaleKeyed: z.boolean().optional(),
  target: vector.optional(), fov: finite.min(1).max(179).optional(),
});
const frames = z.array(keyframe).max(10000);
const bones = ['root', 'hips', 'spine', 'chest', 'neck', 'head', 'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
  ...['left', 'right'].flatMap(side => ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'].flatMap(finger => [1, 2, 3].map(joint => `${side}${finger}${joint}`)))];
const bone = z.string().refine(value => bones.includes(value), 'unknown bone');
const object = z.object({
  id, groupId: id.optional(), name, kind: z.enum(['primitive', 'model', 'actor', 'billboard']),
  primitive: z.enum(['box', 'sphere', 'cylinder', 'torus', 'cone', 'pyramid', 'empty', 'plane', 'character']).optional(),
  transform, color, uniformScale: finite.min(0.001).max(1000).optional(), locked: z.boolean().optional(),
  visible: z.boolean(), castShadow: z.boolean(), receiveShadow: z.boolean(),
  pose: z.enum(['neutral', 'stand', 't_pose', 'walk', 'run', 'sit', 'squat', 'kneel_single', 'kneel_double', 'hands_hips', 'lean', 'bow', 'think', 'fight', 'kick', 'throw', 'push', 'wave', 'reach', 'arms_crossed', 'phone']).optional(),
  actorPreset: z.enum(['standard_male', 'standard_female', 'athletic', 'slim', 'teen', 'child', 'broad', 'chibi', 'geometric']).optional(),
  rig: z.object({ status: z.enum(['unmapped', 'ready']), boneMap: z.record(bone, z.string().max(240)), animationNames: z.array(name).max(200) }).optional(),
  motionClips: z.array(z.object({ id, name, sourceAnimation: name, start: finite.min(0), duration: finite.min(0).max(120), playbackRate: finite.min(0.01).max(100), loop: z.boolean() })).max(200).optional(),
  activeMotionClipId: id.optional(), animationTrackEnabled: z.boolean().optional(),
  motionPath: z.object({ kind: z.enum(['line', 'ring', 'rectangle', 'pencil', 'pen']), duration: finite.min(0.5).max(120), facePath: z.boolean(), transform, originalKeyframes: frames, controlKeyframeIds: z.array(id).max(10000).optional() }).optional(),
  boneOverrides: z.record(bone, quaternion).optional(),
  boneTracks: z.array(z.object({ bone, keyframes: z.array(z.object({ id, time: finite.min(0).max(120), rotation: quaternion, easing })).max(10000) })).max(64).optional(),
  sourceNodeId: id.optional(), assetId: id.optional(), storageKey: resource.optional(), url: resource.optional(), mimeType: z.string().max(100).optional(), keyframes: frames,
});
const camera = z.object({
  id, name, visible: z.boolean().optional(), locked: z.boolean().optional(), transform, target: vector,
  followObjectId: id.optional(), followAnchor: vector.optional(), lookAtMode: z.enum(['coordinates', 'rotation', 'object']).optional(), lookAtObjectId: id.optional(),
  focalLength: finite.min(0.1).max(2000), fov: finite.min(1).max(179), aperture: finite.min(0.1).max(100),
  focusDistance: finite.min(0).max(100000), near: finite.positive(), far: finite.positive(), keyframes: frames,
  drawnPath: z.object({ kind: z.enum(['pencil', 'pen', 'line', 'ring', 'rectangle']), sampleKeyframeIds: z.array(id).max(10000), originalKeyframes: frames.optional() }).optional(),
}).refine(value => value.far > value.near, 'far must exceed near');
const screenshot = z.object({ id, name, storageKey: resource, url: resource, width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192), createdAt: z.string().max(40), sourceRevision: z.number().int().positive().optional(), sourceShotId: id.optional() });

/** Host boundary for persistent director data; renderer objects and external URLs are never accepted. */
export const directorSceneSchema = z.object({
  id, version: z.literal(1), title: name, background: color, environmentIntensity: finite.min(0).max(100),
  gridVisible: z.boolean(), gridSnap: z.boolean().optional(),
  ground: z.object({ visible: z.boolean(), opacity: finite.min(0).max(1), height: finite.min(-1000).max(1000) }).optional(),
  stageTransform: z.object({ scale: finite.min(0.001).max(1000), position: vector, rotation: vector }).optional(),
  labelsVisible: z.boolean().optional(), aspectRatio: z.enum(['adaptive', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16']).optional(),
  panorama: z.object({ url: resource, storageKey: resource.optional(), name: name.optional(), rotation: finite }).optional(),
  panoramaRotation: finite.optional(), panoramaRadius: finite.min(1).max(10000).optional(),
  objects: z.array(object).max(1000), groups: z.array(z.object({ id, name, collapsed: z.boolean().optional() })).max(200).optional(),
  cameras: z.array(camera).min(1).max(100),
  lights: z.array(z.object({ id, name, type: z.enum(['directional', 'point', 'spot', 'ambient']), transform, color, intensity: finite.min(0).max(1000), angle: finite.optional(), penumbra: finite.min(0).max(1).optional(), castShadow: z.boolean() })).max(100),
  shots: z.array(z.object({ id, name, cameraId: id, duration: finite.min(0.5).max(120), fps: z.union([z.literal(24), z.literal(25), z.literal(30)]), shotSize: z.enum(['extreme_wide', 'wide', 'full', 'medium', 'close_up', 'extreme_close_up']), cameraMove: z.enum(['static', 'push_in', 'pull_out', 'pan_left', 'pan_right', 'tilt_up', 'tilt_down', 'orbit_left', 'orbit_right', 'handheld']), prompt: z.string().max(20000), previewNodeId: id.optional(), depthNodeId: id.optional(), normalNodeId: id.optional(), screenshots: z.array(screenshot).max(200).optional() })).min(1).max(100),
  activeShotId: id, createdAt: z.string().max(40), updatedAt: z.string().max(40),
}).superRefine((scene, context) => {
  const allIds = [...scene.objects, ...scene.cameras, ...scene.lights, ...scene.shots, ...(scene.groups ?? [])].map(item => item.id);
  const fail = (message: string) => context.addIssue({ code: 'custom', message });
  if (new Set(allIds).size !== allIds.length) fail('duplicate scene id');
  if (!scene.shots.some(shot => shot.id === scene.activeShotId)) fail('active shot missing');
  const cameraIds = new Set(scene.cameras.map(item => item.id));
  const objectIds = new Set(scene.objects.map(item => item.id));
  const groupIds = new Set((scene.groups ?? []).map(item => item.id));
  for (const shot of scene.shots) if (!cameraIds.has(shot.cameraId)) fail('shot camera missing');
  for (const item of scene.objects) if (item.groupId && !groupIds.has(item.groupId)) fail('group missing');
  for (const item of scene.cameras) {
    if (item.followObjectId && !objectIds.has(item.followObjectId)) fail('follow object missing');
    if (item.lookAtObjectId && !objectIds.has(item.lookAtObjectId)) fail('look-at object missing');
  }
});
export type StoredDirectorScene = z.infer<typeof directorSceneSchema>;
export const DIRECTOR_DOCUMENT_LIMIT = 4 * 1024 * 1024;
export const directorDocumentSchema = z.object({ schemaVersion: z.literal(1), workspaceId: id, nodeId: id, revision: z.number().int().positive(), scene: directorSceneSchema });
export type DirectorDocument = z.infer<typeof directorDocumentSchema>;
