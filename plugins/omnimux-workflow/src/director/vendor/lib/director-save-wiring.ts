import type { DirectorScene } from "../../scene-types";
import type { DirectorAdapters, DirectorConflictRecoveryContext, DirectorConflictRecoveryReceipt } from "../../contract";
import type { DirectorCloseDecision, DirectorDraftEnvelope, DirectorSaveSnapshot, StorageLike } from "./director-save";

export function isDirectorSaveConflict(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "version_conflict";
}

/** The Host owns GET/CAS/readback; this boundary requires same-scope review and a draft-matched receipt. */
export async function recoverDirectorSaveConflict(input: {
    scene: DirectorScene;
    identity: DirectorConflictRecoveryContext["identity"];
    signal: AbortSignal;
    expectedRevision: number;
    recover: NonNullable<DirectorAdapters["recoverSaveConflict"]>;
    confirmReplacement: DirectorConflictRecoveryContext["confirmReplacement"];
    isCurrent(): boolean;
    fingerprint(scene: DirectorScene): string;
}): Promise<DirectorConflictRecoveryReceipt | null> {
    const scene = structuredClone(input.scene);
    const identity = { ...input.identity };
    const fingerprint = input.fingerprint(scene);
    let reviewedRevision: number | null = null;
    let reviewRequested = false;
    const assertCurrent = () => {
        if (input.signal.aborted || !input.isCurrent()) throw new DOMException("导演台所属场景已变化", "AbortError");
    };
    assertCurrent();
    if (scene.id !== identity.sceneId || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new Error("当前草稿或保存版本无效");
    const receipt = await input.recover(scene, {
        identity: { ...identity }, signal: input.signal, expectedRevision: input.expectedRevision,
        confirmReplacement: async latest => {
            assertCurrent();
            if (reviewRequested) throw new Error("请重新读取已保存版本再确认");
            reviewRequested = true;
            if (!latest || !latest.identity || !latest.scene || latest.scene.id !== scene.id || scene.id !== identity.sceneId
                || !Number.isSafeInteger(latest.revision) || latest.revision <= input.expectedRevision
                || !(["userId", "projectId", "nodeId", "sceneId", "epoch"] as const).every(field => latest.identity[field] === identity[field])) {
                throw new Error("已保存版本与当前项目、节点或场景不一致");
            }
            const revision = latest.revision;
            const accepted = await input.confirmReplacement(structuredClone(latest));
            assertCurrent();
            if (accepted !== true) return false;
            reviewedRevision = revision;
            return true;
        },
    });
    assertCurrent();
    if (receipt === null) return null;
    if (reviewedRevision === null || receipt.confirmed !== true || receipt.sceneId !== scene.id
        || !Number.isSafeInteger(receipt.revision) || receipt.revision <= reviewedRevision
        || receipt.sceneFingerprint !== fingerprint) throw new Error("草稿未收到已确认版本的主机写盘回执");
    return receipt;
}

/**
 * UI 只需要保存进度，不需要场景本体。
 * 去掉 scene 后 React state 不必再为「还没有 coordinator」编造一个假场景。
 */
export type DirectorSaveProgress = Omit<DirectorSaveSnapshot, "scene">;

export const idleDirectorSaveProgress: DirectorSaveProgress = {
    revision: 0,
    confirmedRevision: 0,
    status: "saved",
    draftStored: false,
};

/** 从完整快照投影出进度：订阅回调必须走它，避免只更新 status 而漏掉确认信息。 */
export function directorSaveProgress(snapshot: DirectorSaveSnapshot): DirectorSaveProgress {
    return {
        revision: snapshot.revision,
        confirmedRevision: snapshot.confirmedRevision,
        status: snapshot.status,
        draftStored: snapshot.draftStored,
    };
}

/** 头部状态展示：文案与语气必须由状态唯一决定，组件不得自己拼措辞。 */
export type DirectorSaveIndicator = {
    label: string;
    tone: "idle" | "pending" | "danger";
    /** 未确认或错误时提供重试；已保存态没有可重试的东西。 */
    retryable: boolean;
    busy: boolean;
};

export function describeDirectorSaveStatus(progress: DirectorSaveProgress): DirectorSaveIndicator {
    const unconfirmed = progress.confirmedRevision < progress.revision;

    if (progress.status === "error") {
        return {
            label: progress.draftStored ? "保存失败 · 本地草稿已保留" : "保存失败 · 本地草稿也未写入",
            tone: "danger",
            retryable: true,
            busy: false,
        };
    }
    if (progress.status === "saving") {
        return { label: "正在保存…", tone: "pending", retryable: false, busy: true };
    }
    if (progress.status === "dirty" || unconfirmed) {
        return { label: "有未保存修改", tone: "pending", retryable: true, busy: false };
    }
    return { label: "已保存", tone: "idle", retryable: false, busy: false };
}

/**
 * 是否提示恢复：候选必须比权威场景更新才值得打断用户。
 * scene.updatedAt 是 canonical 保存时间，candidate.baseUpdatedAt 是草稿写入时的基线；
 * 基线落后于权威说明远端已保存过更新的内容，这份草稿是陈旧残留。
 */
export function shouldOfferDirectorDraftRecovery(input: { candidate: DirectorDraftEnvelope | null; authoritativeScene: DirectorScene | null }): boolean {
    const { candidate, authoritativeScene } = input;
    if (!candidate || !authoritativeScene) return false;
    if (candidate.sceneId !== authoritativeScene.id) return false;
    if (candidate.baseUpdatedAt !== authoritativeScene.updatedAt) return false;
    return candidate.scene.updatedAt > authoritativeScene.updatedAt;
}

/** 关闭决策的用户可见后果，组件按此分支决定退出/二次确认/留下。 */
export type DirectorCloseOutcome = { kind: "close" } | { kind: "confirm-draft-exit"; message: string } | { kind: "blocked"; message: string };

export function resolveDirectorCloseOutcome(decision: DirectorCloseDecision): DirectorCloseOutcome {
    if (decision === "close") return { kind: "close" };
    if (decision === "offer-draft-exit") {
        return {
            kind: "confirm-draft-exit",
            message: "远端保存失败，但本地草稿已安全保存。下次打开这个镜头可以恢复，确认离开吗？",
        };
    }
    return { kind: "blocked", message: "保存失败且本地草稿未写入，已留在导演台，请重试保存。" };
}

/**
 * beforeunload 是否要触发浏览器保护：只有「改动未确认」或「错误态且没有安全草稿」才拦。
 * 注意这里只能同步表达意图，异步 flush 无法阻塞卸载。
 */
export function shouldBlockDirectorUnload(progress: DirectorSaveProgress): boolean {
    if (progress.confirmedRevision < progress.revision) return true;
    return progress.status === "error" && !progress.draftStored;
}

/**
 * localStorage 不可用（隐私模式、被禁用、SSR）时的显式实现：
 * 读返回 null，写和删都抛，让 coordinator 如实得到 draftStored=false。
 * 绝不能降级成进程内 Map —— 那会让弹窗谎称「下次可恢复」。
 */
export const unavailableDirectorDraftStorage: StorageLike = {
    getItem: () => null,
    setItem: () => {
        throw new Error("localStorage unavailable");
    },
    removeItem: () => {
        throw new Error("localStorage unavailable");
    },
};

/** 纯 factory：注入 getter 便于测试不可用分支，不引入额外依赖。 */
export function resolveDirectorDraftStorage(readStorage: () => Storage | null | undefined): StorageLike {
    let local: Storage | null | undefined;
    try {
        local = readStorage();
    } catch {
        return unavailableDirectorDraftStorage;
    }
    if (!local) return unavailableDirectorDraftStorage;

    return {
        getItem: (key) => local.getItem(key),
        setItem: (key, value) => local.setItem(key, value),
        removeItem: (key) => local.removeItem(key),
    };
}
