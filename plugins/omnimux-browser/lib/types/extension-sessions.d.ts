/**
 * Track session ids that the browser extension has driven through the bridge.
 * Desktop-native sessions must keep the host userQuestions waterfall so the
 * Desktop UI can render ask_user_question cards.
 * @module @yuxianglin/dsh-bridge-browser/src/extension-sessions
 */
/** Mutable registry of extension-owned session ids. */
export declare class ExtensionSessionRegistry {
    private readonly ids;
    /** Remember a session the extension successfully created or prompted. */
    note(sessionId: string | undefined): void;
    /** Whether the extension has touched this session over the bridge. */
    has(sessionId: string | undefined): boolean;
    /** Test helper: drop all tracked ids. */
    clear(): void;
}
/**
 * Decide whether the bridge should own ask_user_question for this request.
 * Desktop sessions must fall through to the native answerer waterfall.
 */
export declare function shouldBridgeOwnQuestion(input: {
    hasExtensionConnection: boolean;
    sessionId: string | undefined;
    extensionSessions: Pick<ExtensionSessionRegistry, 'has'>;
}): boolean;
//# sourceMappingURL=extension-sessions.d.ts.map