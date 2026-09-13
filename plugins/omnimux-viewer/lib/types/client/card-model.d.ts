/**
 * Pure derivation of a card's state from one tool block.
 *
 * Everything here runs during replay of a session logged by an older build, so
 * every read is defensive and every failure mode is a narrower card rather than
 * a throw: a crashing entry is removed from its slot for the rest of the
 * session, which would take the whole conversation's viewer cards down with it.
 *
 * Content blocks are narrowed structurally instead of through the Host's
 * `ContentBlock` union. The union is merge-extensible, so a build that knows
 * fewer arms than the log contains must still find the image arm it does know.
 * @module omnimux-viewer/client/card-model
 */
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client';
import { type DisplayValue } from '../contract.ts';
/** What the card renders right now. */
export type CardState = 
/** The call is dispatched and no result has landed. */
{
    phase: 'running';
    path: string | undefined;
}
/** The call failed; `message` is the tool's own text. */
 | {
    phase: 'failed';
    path: string | undefined;
    message: string;
}
/** A displayable file, with everything the viewer needs. */
 | {
    phase: 'ready';
    value: DisplayValue;
}
/**
 * The call settled, but this build could not recover a viewer payload from
 * it — an older log, a truncated window, a shape a newer build wrote. The row
 * still renders; it just has nothing to play.
 */
 | {
    phase: 'bare';
    path: string | undefined;
    message: string;
};
/**
 * Recover the `file_path` argument from either arm of the block.
 *
 * The raw arguments are whatever the model emitted, so a parse failure is an
 * ordinary outcome — a card with no path in its header, not an error.
 * @param block - the running or settled call.
 * @returns the requested path, or `undefined` when it cannot be read.
 */
export declare function argumentPathOf(block: ToolCallBlock): string | undefined;
/**
 * Find the first durable image carried by a settled result's content.
 *
 * This is what lets the plugin render the SHIPPED `read_image` tool, which
 * writes no presentation metadata at all: its image rides the model-facing
 * content blocks, and those are persisted with the result.
 * @param content - the settled result's content blocks.
 * @returns the validated image facts, or `undefined` when there is no image.
 */
export declare function contentImageOf(content: readonly unknown[]): DisplayValue['image'] | undefined;
/**
 * Rebuild a viewer payload from this plugin's own result envelope.
 *
 * The recovery path for a NESTED dispatch: the registry projects
 * `presentationMeta` only for top-level calls, so a `display_file` invoked from
 * inside `run_code` persists content blocks and nothing else. The envelope is
 * this plugin's own structured output, and the result is validated through the
 * same narrowing every replayed payload goes through — including the guard that
 * refuses an asset URL which is not this plugin's route.
 * @param content - the settled result's content blocks.
 * @param inContext - whether the result also carried a durable image block.
 * @returns the validated payload, or `undefined` when the envelope is not ours.
 */
export declare function envelopeValueOf(content: readonly unknown[], inContext: boolean): DisplayValue | undefined;
/**
 * Derive the card state for one call.
 * @param block - the running or settled call.
 * @param toolName - the wire tool name this entry was dispatched for; it selects
 *   which recovery path applies, since only `display_file` writes metadata.
 * @returns the state to render.
 */
export declare function cardModel(block: ToolCallBlock, toolName: string): CardState;
