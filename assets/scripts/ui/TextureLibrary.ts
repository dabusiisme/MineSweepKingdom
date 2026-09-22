/**
 * TextureLibrary 贴图库
 * 素材是预先生成好的 PNG，放在 assets/resources/ 下，这里只负责加载、缓存和上屏。
 * 加载不到时返回 false，调用方回退到纯色，保证缺资源也能玩。
 */
import { Color, Sprite, SpriteFrame, UITransform, Node, isValid } from "cc";
import { loadRes } from "../core/AssetLoader";

/** 复用一个白色常量；每次 new Color 会在 updateAllCells 里产生几百次分配 */
const WHITE = new Color(255, 255, 255, 255);

/** 素材名 → resources 下的路径 */
const SOURCES: Record<string, string> = {
    cell_raised:     "textures/cell_raised/spriteFrame",
    cell_sunken:     "textures/cell_sunken/spriteFrame",
    icon_flag:       "textures/icon_flag/spriteFrame",
    icon_mine:       "textures/icon_mine/spriteFrame",
    icon_star:       "textures/icon_star/spriteFrame",
    bar:             "textures/bar/spriteFrame",
    panel:           "textures/panel/spriteFrame",
    button_neutral:  "textures/button_neutral/spriteFrame",
    button_primary:  "textures/button_primary/spriteFrame",
    button_disabled: "textures/button_disabled/spriteFrame",
    background:      "textures/background/spriteFrame",
    white:           "placeholders/white/spriteFrame",
};

/** 需要九宫格拉伸的素材，值是四边保留的像素数 */
const SLICED: Record<string, number> = {
    cell_raised: 8,
    cell_sunken: 8,
    bar: 20,
    // 结算面板固定按 600x400 用，九宫格不影响它；难度选择面板要拉高，必须切开
    panel: 40,
    button_neutral: 22,
    button_primary: 22,
    button_disabled: 22,
};

export class TextureLibrary {
    private static _frames: Record<string, SpriteFrame> = {};
    private static _loaded: boolean = false;
    private static _loading: Promise<void> | null = null;

    /**
     * 加载全部贴图。
     * 两点性能要求：
     *  1. 只真正加载一次（带缓存守卫）。之前没有守卫，每进一次场景就重新走 12 次 resources.load。
     *  2. 并行加载。之前是 for + await 串行，12 个资源要等 12 轮回调，
     *     按每轮一帧算就是 200ms 起步，全都堆在"进入战斗页之后、棋盘出现之前"。
     */
    public static load(): Promise<void> {
        if (this._loaded) return Promise.resolve();
        if (this._loading) return this._loading;

        this._loading = (async () => {
            const names = Object.keys(SOURCES);
            const results = await Promise.all(
                names.map((name) => loadRes<SpriteFrame>(SOURCES[name], SpriteFrame))
            );

            const missing: string[] = [];
            names.forEach((name, i) => {
                const sf = results[i];
                if (!sf) { missing.push(name); return; }
                // 九宫格拉伸的素材不能进动态图集，否则边缘会被采样到隔壁图块
                sf.packable = false;
                const inset = SLICED[name];
                if (inset) {
                    sf.insetLeft = inset;
                    sf.insetRight = inset;
                    sf.insetTop = inset;
                    sf.insetBottom = inset;
                }
                this._frames[name] = sf;
            });

            if (missing.length) {
                console.warn("[TextureLibrary] 以下贴图没加载到，将回退纯色：" + missing.join(", "));
            }
            this._loaded = true;
        })();
        return this._loading;
    }

    public static get(name: string): SpriteFrame | null {
        return this._frames[name] ?? null;
    }

    /** 反查这个 SpriteFrame 是哪张贴图 */
    public static nameOf(frame: SpriteFrame | null): string | null {
        if (!frame) return null;
        for (const key of Object.keys(this._frames)) {
            if (this._frames[key] === frame) return key;
        }
        // 万一是不同 bundle 加载出来的另一个实例，退化成比对 uuid
        const uuid = (frame as any).uuid;
        if (uuid) {
            for (const key of Object.keys(this._frames)) {
                if ((this._frames[key] as any).uuid === uuid) return key;
            }
        }
        return null;
    }

    /**
     * 按 Sprite **当前已有的**贴图重新贴一遍：补上九宫格 insets 和正确的 type，颜色保留。
     *
     * 为什么需要这个：在编辑器里直接给 Sprite 赋 spriteFrame 时，type 默认是 SIMPLE。
     * 按钮图只有 64×64，被拉到 540 宽就是一片糊；底板图 600×400 拉到 620×900 圆角也会变形。
     * 凡是没有走 apply() 的 Sprite，都得再过一道这个。
     */
    public static reskin(sprite: Sprite | null, w?: number, h?: number): boolean {
        if (!sprite) return false;
        const name = this.nameOf(sprite.spriteFrame);
        if (!name) return false;
        const keep = sprite.color.clone();
        const ok = this.apply(sprite, name, w, h);
        if (ok) sprite.color = keep;
        return ok;
    }

    /** 把一棵子树里所有 Sprite 都 restkin 一遍 */
    public static reskinTree(root: Node | null): void {
        if (!root || !isValid(root)) return;
        root.walk((n) => {
            const sprite = n.getComponent(Sprite);
            if (!sprite || !sprite.spriteFrame) return;
            const tf = n.getComponent(UITransform);
            this.reskin(sprite, tf?.width, tf?.height);
        });
    }

    /**
     * 把素材贴到 Sprite 上，成功返回 true。
     * 顺序很重要：先设 sizeMode，再赋 spriteFrame，最后写尺寸，
     * 否则 TRIMMED 模式会按源图尺寸把节点缩小。
     */
    public static apply(sprite: Sprite | null, name: string, w?: number, h?: number): boolean {
        if (!sprite) return false;
        const sf = this.get(name);
        if (!sf) return false;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = SLICED[name] ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sprite.spriteFrame = sf;
        sprite.color = WHITE;
        if (w !== undefined && h !== undefined) {
            const tf = sprite.getComponent(UITransform);
            if (tf) tf.setContentSize(w, h);
        }
        return true;
    }
}
