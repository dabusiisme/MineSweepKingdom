/**
 * AudioManager 音效管理
 * 音频文件放在 assets/resources/audio/ 下，这里负责加载和播放。
 *
 * 音频节点由 AudioManager 自己创建并设为**常驻节点**，不交给各个场景管。
 * 原因：之前每个场景各自持有 AudioSource 再交给 AudioManager，切场景后旧场景的
 * 组件已销毁、静态引用却还指着它，新场景一调用就写到了已销毁的组件上（会报 null 错）。
 * 常驻节点同时也让 BGM 在切场景时不会中断。
 */
import { AudioClip, AudioSource, Node, director, isValid } from "cc";
import { loadRes } from "./AssetLoader";
import { Storage } from "./Storage";

export type SoundName =
    | "reveal" | "flag" | "unflag" | "chord"
    | "win" | "explosion" | "click";

const SOUNDS: SoundName[] = ["reveal", "flag", "unflag", "chord", "win", "explosion", "click"];
const MUTE_KEY = "msk_muted";
const BGM_MUTE_KEY = "msk_bgm_muted";
const BGM_CLIP = "bgm_home";
/** BGM 音量压低，别盖过翻格/触雷的反馈音 */
const BGM_VOLUME = 0.5;

export class AudioManager {
    private static _clips: Partial<Record<SoundName, AudioClip>> = {};
    private static _bgmClip: AudioClip | null = null;

    private static _root: Node | null = null;
    private static _sfxSource: AudioSource | null = null;
    private static _bgmSource: AudioSource | null = null;

    private static _muted: boolean = false;
    private static _bgmMuted: boolean = false;
    private static _loaded: boolean = false;
    private static _loading: Promise<void> | null = null;

    /**
     * 建好音频节点并设成常驻。
     * 没父节点的节点交给 addPersistRootNode，引擎会自动把它挂到当前场景并跨场景保留。
     */
    private static _ensureNode(): void {
        if (this._root && isValid(this._root)) return;

        const root = new Node("AudioManager");
        this._sfxSource = root.addComponent(AudioSource);

        // BGM 单独一个子节点：它走 loop 播放，和 playOneShot 的音效互不打断
        const bgmNode = new Node("Bgm");
        bgmNode.parent = root;
        this._bgmSource = bgmNode.addComponent(AudioSource);

        director.addPersistRootNode(root);
        this._root = root;

        this._muted = Storage.getBool(MUTE_KEY);
        this._bgmMuted = Storage.getBool(BGM_MUTE_KEY);
    }

    public static load(): Promise<void> {
        if (this._loaded) return Promise.resolve();
        if (this._loading) return this._loading;

        this._ensureNode();
        this._loading = (async () => {
            // 并行加载：串行的话 8 个音频要等 8 轮回调
            const jobs: Array<[string, Promise<AudioClip | null>]> = SOUNDS.map(
                (name) => [name as string, loadRes<AudioClip>(`audio/${name}`, AudioClip)]
            );
            jobs.push([BGM_CLIP, loadRes<AudioClip>(`audio/${BGM_CLIP}`, AudioClip)]);

            const results = await Promise.all(jobs.map(([, p]) => p));
            const missing: string[] = [];
            jobs.forEach(([name], i) => {
                const clip = results[i];
                if (!clip) { missing.push(name); return; }
                if (name === BGM_CLIP) this._bgmClip = clip;
                else this._clips[name as SoundName] = clip;
            });
            if (missing.length) {
                console.warn("[AudioManager] 以下音频没加载到：" + missing.join(", "));
            }
            this._loaded = true;
        })();
        return this._loading;
    }

    // ---------- BGM ----------

    /** 循环播放 BGM；重复调用不会叠加，切场景时也不会重头播 */
    public static playBGM(): void {
        this._ensureNode();
        const src = this._bgmSource;
        if (!src || !isValid(src) || !this._bgmClip) return;
        if (src.playing) return;

        src.stop();
        src.clip = this._bgmClip;
        src.loop = true;
        src.volume = this._bgmMuted ? 0 : BGM_VOLUME;
        src.play();
    }

    public static stopBGM(): void {
        const src = this._bgmSource;
        if (src && isValid(src)) src.stop();
    }

    public static get bgmMuted(): boolean { return this._bgmMuted; }

    public static setBgmMuted(muted: boolean): void {
        this._bgmMuted = muted;
        const src = this._bgmSource;
        if (src && isValid(src)) src.volume = muted ? 0 : BGM_VOLUME;
        Storage.setBool(BGM_MUTE_KEY, muted);
    }

    /** 切后台时静音，回前台恢复 */
    public static setBgmSuspended(suspended: boolean): void {
        this._ensureNode();
        const src = this._bgmSource;
        if (!src || !isValid(src)) return;
        src.volume = (suspended || this._bgmMuted) ? 0 : BGM_VOLUME;
        if (suspended) src.pause();
        else if (!src.playing) src.play();
    }

    // ---------- 音效 ----------

    public static get muted(): boolean { return this._muted; }

    public static setMuted(muted: boolean): void {
        this._muted = muted;
        Storage.setBool(MUTE_KEY, muted);
    }

    public static play(name: SoundName, volume: number = 1): void {
        if (this._muted) return;
        this._ensureNode();
        const src = this._sfxSource;
        const clip = this._clips[name];
        if (!src || !isValid(src) || !clip) return;
        src.playOneShot(clip, volume);
    }
}
