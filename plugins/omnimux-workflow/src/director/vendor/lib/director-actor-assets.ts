import type { DirectorActorPresetId, DirectorHumanoidBone, DirectorQuat } from "../../scene-types";
import { Quaternion } from 'three';

export function resolveDirectorActorBoneDeltas(reference: string | undefined, deltas: Partial<Record<DirectorHumanoidBone, DirectorQuat>>): Partial<Record<DirectorHumanoidBone, DirectorQuat>> {
    if (!directorBuiltInActorKind(reference) || !deltas.leftUpperArm) return deltas;
    return { ...deltas, leftUpperArm: new Quaternion(...deltas.leftUpperArm).invert().toArray() as DirectorQuat };
}

export const DIRECTOR_QUATERNIUS_MALE_URL = "director/models/quaternius-standard-male.glb";
export const DIRECTOR_QUATERNIUS_FEMALE_URL = "director/models/quaternius-standard-female.glb";

export function directorBuiltInActorKind(reference?: string): 'male' | 'female' | null {
    if (reference === DIRECTOR_QUATERNIUS_MALE_URL || reference === '/omnimux-workflow/director-assets/quaternius-standard-male.glb') return 'male';
    if (reference === DIRECTOR_QUATERNIUS_FEMALE_URL || reference === '/omnimux-workflow/director-assets/quaternius-standard-female.glb') return 'female';
    return null;
}

/** Resolve both new presets and URL-less older actors to the bundled rigged bases. */
export function resolveDirectorBuiltInActorUrl(preset?: DirectorActorPresetId): string | null {
    if (preset === "standard_female") return DIRECTOR_QUATERNIUS_FEMALE_URL;
    if (preset === "geometric") return null;
    return DIRECTOR_QUATERNIUS_MALE_URL;
}
