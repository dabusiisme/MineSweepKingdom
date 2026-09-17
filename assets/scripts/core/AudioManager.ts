/**
 * AudioManager 音效管理
 * 音频文件放在 assets/resources/audio/ 下（预先生成好的 wav），这里负责加载和播放。
 * 加载不到或没有 AudioSource 时静默跳过，不影响游戏逻辑。
 */
import { AudioClip, AudioSource } from "cc";
import { loadRes } from "./AssetLoader";

export type SoundName =
    | "reveal" | "flag" | "unflag" | "chord"
    | "win" | "explosion" | "click";

const SOUNDS: SoundName[] = ["reveal", "flag", "unflag", "chord", "win", "explosion", "click"];
const MUTE_KEY = "msk_muted";

export class AudioManager {
    private static _clips: Partial<Record<SoundName, AudioClip>> = {};
    private static _source: AudioSource | null = null;
    private static _muted: boolean = false;

    /** 由场景把 AudioSource 交进来（挂在 BattleRoot 上，随场景存活） */
    public static init(source: AudioSource): void {
        this._source = source;
        try {
            this._muted = localStorage.getItem(MUTE_KEY) === "1";
        } catch {
            this._muted = false;
        }
    }

    public static async load(): Promise<void> {
        const missing: string[] = [];
        for (const name of SOUNDS) {
            const clip = await loadRes<AudioClip>(`audio/${name}`, AudioClip);
            if (clip) this._clips[name] = clip;
            else missing.push(name);
        }
        if (missing.length) {
            console.warn("[AudioManager] 以下音效没加载到：" + missing.join(", "));
        }
    }

    public static get muted(): boolean { return this._muted; }

    public static setMuted(muted: boolean): void {
        this._muted = muted;
        try {
            localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
        } catch {
            /* 隐私模式下写不了，忽略 */
        }
    }

    public static play(name: SoundName, volume: number = 1): void {
        if (this._muted) return;
        const source = this._source;
        const clip = this._clips[name];
        if (!source || !clip) return;
        source.playOneShot(clip, volume);
    }
}
