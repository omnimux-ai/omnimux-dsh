/**
 * Which tool keys this plugin renders, and at which slot rank.
 *
 * `tool.call.toolview` is a keyed slot: a second entry for the same key at the
 * same rank throws, and the throw takes the whole client half down with it (the
 * `display_file` card disappears too). The shipped harness renders `read_image`
 * itself from 0.1.5-rc.2 on, so this plugin registers that key at a HIGHER rank
 * and yields: the slot renders the lowest rank, the shipped row wins, and this
 * plugin still supplies a card on harnesses that ship none.
 *
 * @module omnimux-viewer/toolview-registration
 */
/** The shipped row occupies rank 0, so a yielding row must rank above it. */
export declare const READ_IMAGE_FALLBACK_PRIORITY = 1;
export interface ToolviewRegistration {
    /** Tool wire name the card renders. */
    readonly key: string;
    /** Slot rank; omitted means 0, i.e. this plugin owns the key. */
    readonly priority?: number;
}
/** One entry per rendered key. `read_image` is a fallback, not an owner. */
export declare const TOOLVIEW_REGISTRATIONS: readonly ToolviewRegistration[];
