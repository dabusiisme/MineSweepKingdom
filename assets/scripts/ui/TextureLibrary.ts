/**
 * TextureLibrary 贴图库
 * 素材是预先生成好的 PNG，放在 assets/resources/ 下，这里只负责加载、缓存和上屏。
 * 加载不到时返回 false，调用方回退到纯色，保证缺资源也能玩。
 */
import { Color, Sprite, SpriteFrame, UITransform } from "cc";
import { loadRes } from "../core/AssetLoader";

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
    button_neutral: 22,
    button_primary: 22,
    button_disabled: 22,
};

export class TextureLibrary {
    private static _frames: Record<string, SpriteFrame> = {};

    public static async load(): Promise<void> {
        const missing: string[] = [];
        for (const name of Object.keys(SOURCES)) {
            const sf = await loadRes<SpriteFrame>(SOURCES[name], SpriteFrame);
            if (!sf) { missing.push(name); continue; }
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
        }
        if (missing.length) {
            console.warn("[TextureLibrary] 以下贴图没加载到，将回退纯色：" + missing.join(", "));
        }
    }

    public static get(name: string): SpriteFrame | null {
        return this._frames[name] ?? null;
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
        sprite.color = new Color(255, 255, 255, 255);
        if (w !== undefined && h !== undefined) {
            const tf = sprite.getComponent(UITransform);
            if (tf) tf.setContentSize(w, h);
        }
        return true;
    }
}
