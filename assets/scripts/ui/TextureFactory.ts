/**
 * TextureFactory 运行时贴图工厂
 * 用 Canvas 现画圆角 + 高光 + 阴影，做出 3D 浮雕质感，不需要额外美术资源。
 * 生成失败（例如原生平台没有 document）时统一返回 null，调用方回退到纯色。
 */
import { ImageAsset, SpriteFrame, Texture2D, Rect, Size } from "cc";

export type CellSkin = "raised" | "sunken";
export type ButtonTone = "neutral" | "primary" | "disabled";

export class TextureFactory {
    private static _cache: Record<string, SpriteFrame | null> = {};

    // ---------- 基础设施 ----------

    private static _canvas(w: number, h: number) {
        if (typeof document === "undefined") return null;
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        const g = c.getContext("2d");
        if (!g) return null;
        return { c, g };
    }

    private static _finish(key: string, c: HTMLCanvasElement, w: number, h: number): SpriteFrame | null {
        try {
            const imageAsset = new ImageAsset(c);
            const texture = new Texture2D();
            texture.image = imageAsset;
            texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR);
            const sf = new SpriteFrame();
            sf.texture = texture;
            sf.rect = new Rect(0, 0, Math.round(w), Math.round(h));
            sf.originalSize = new Size(Math.round(w), Math.round(h));
            sf.packable = false;
            this._cache[key] = sf;
            return sf;
        } catch (e) {
            console.warn("[TextureFactory] 生成贴图失败，回退纯色:", e);
            this._cache[key] = null;
            return null;
        }
    }

    private static _cached(key: string): SpriteFrame | null | undefined {
        return Object.prototype.hasOwnProperty.call(this._cache, key) ? this._cache[key] : undefined;
    }

    private static _roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
        const rad = Math.max(0, Math.min(r, w / 2, h / 2));
        g.beginPath();
        g.moveTo(x + rad, y);
        g.lineTo(x + w - rad, y);
        g.arcTo(x + w, y, x + w, y + rad, rad);
        g.lineTo(x + w, y + h - rad);
        g.arcTo(x + w, y + h, x + w - rad, y + h, rad);
        g.lineTo(x + rad, y + h);
        g.arcTo(x, y + h, x, y + h - rad, rad);
        g.lineTo(x, y + rad);
        g.arcTo(x, y, x + rad, y, rad);
        g.closePath();
    }

    /** 画一圈斜角：topLeft 描左上两条边，bottomRight 描右下两条边 */
    private static _bevel(
        g: CanvasRenderingContext2D, w: number, h: number, r: number,
        topLeft: string, bottomRight: string, inset: number
    ): void {
        const i = inset;
        const rad = Math.max(1, r - i);
        // 斜角粗细按短边算并封顶，否则大面板上会画出一条巨粗的边
        g.lineWidth = Math.max(1.5, Math.min(Math.min(w, h) * 0.06, 6));
        g.lineJoin = "round";

        // 左上
        g.beginPath();
        g.moveTo(w - rad - i, i);
        g.lineTo(i + rad, i);
        g.arcTo(i, i, i, i + rad, rad);
        g.lineTo(i, h - rad - i);
        g.strokeStyle = topLeft;
        g.stroke();

        // 右下
        g.beginPath();
        g.moveTo(i, h - rad - i);
        g.arcTo(i, h - i, i + rad, h - i, rad);
        g.lineTo(w - rad - i, h - i);
        g.arcTo(w - i, h - i, w - i, h - rad - i, rad);
        g.lineTo(w - i, i + rad);
        g.strokeStyle = bottomRight;
        g.stroke();
    }

    // ---------- 格子 ----------

    /** 未翻开=凸起，已翻开=凹陷 */
    public static cell(size: number, skin: CellSkin): SpriteFrame | null {
        const s = Math.max(8, Math.round(size));
        const key = `cell_${s}_${skin}`;
        const hit = this._cached(key);
        if (hit !== undefined) return hit;

        const made = this._canvas(s, s);
        if (!made) { this._cache[key] = null; return null; }
        const { c, g } = made;
        // 先铺满整块画布：格子贴在一起时，任何透明边都会露出底色变成细线
        const grd = g.createLinearGradient(0, 0, 0, s);
        if (skin === "raised") {
            grd.addColorStop(0, "#ffffff");
            grd.addColorStop(0.5, "#eef3fa");
            grd.addColorStop(1, "#c9d5e4");
        } else {
            grd.addColorStop(0, "#bcc7d6");
            grd.addColorStop(0.6, "#c8d3e1");
            grd.addColorStop(1, "#d6dfea");
        }
        g.fillStyle = grd;
        g.fillRect(0, 0, s, s);

        const r = Math.max(2, Math.min(s * 0.09, 6));
        const b = Math.max(1, s * 0.03);

        if (skin === "raised") {
            // 凸起：左上受光、右下落影
            this._bevel(g, s, s, r, "rgba(255,255,255,0.98)", "rgba(108,124,150,0.55)", b);
        } else {
            // 凹陷：斜角方向翻转（左上落影、右下受光），再叠一层顶部内阴影
            this._bevel(g, s, s, r, "rgba(96,112,138,0.55)", "rgba(255,255,255,0.95)", b);
            g.save();
            g.beginPath();
            g.rect(0, 0, s, s);
            g.clip();
            const sh = g.createLinearGradient(0, 0, 0, s * 0.55);
            sh.addColorStop(0, "rgba(66,80,104,0.42)");
            sh.addColorStop(1, "rgba(84,99,124,0)");
            g.fillStyle = sh;
            g.fillRect(0, 0, s, s * 0.55);
            g.restore();
        }
        return this._finish(key, c, s, s);
    }

    // ---------- 图标 ----------

    public static icon(kind: "flag" | "mine" | "star", size: number): SpriteFrame | null {
        const s = Math.max(8, Math.round(size));
        const key = `icon_${kind}_${s}`;
        const hit = this._cached(key);
        if (hit !== undefined) return hit;

        const made = this._canvas(s, s);
        if (!made) { this._cache[key] = null; return null; }
        const { c, g } = made;
        g.lineCap = "round";

        if (kind === "star") {
            const cx = s / 2, cy = s * 0.52;
            const outer = s * 0.46, inner = outer * 0.44;
            g.save();
            g.shadowColor = "rgba(206,148,18,0.55)";
            g.shadowBlur = s * 0.12;
            g.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + (Math.PI / 5) * i;
                const rr = i % 2 === 0 ? outer : inner;
                const x = cx + Math.cos(a) * rr;
                const y = cy + Math.sin(a) * rr;
                if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.closePath();
            const sg = g.createLinearGradient(0, cy - outer, 0, cy + outer);
            sg.addColorStop(0, "#ffe89a");
            sg.addColorStop(0.5, "#ffc93c");
            sg.addColorStop(1, "#e39b16");
            g.fillStyle = sg;
            g.fill();
            g.restore();
            g.lineWidth = Math.max(1, s * 0.035);
            g.strokeStyle = "rgba(176,118,10,0.75)";
            g.stroke();
        } else if (kind === "flag") {
            const x = s * 0.3;
            g.strokeStyle = "#6b7280";
            g.lineWidth = Math.max(1.5, s * 0.075);
            g.beginPath();
            g.moveTo(x, s * 0.12);
            g.lineTo(x, s * 0.82);
            g.stroke();
            g.beginPath();
            g.moveTo(x - s * 0.2, s * 0.84);
            g.lineTo(x + s * 0.22, s * 0.84);
            g.stroke();
            const fg = g.createLinearGradient(x, s * 0.12, s * 0.9, s * 0.42);
            fg.addColorStop(0, "#ff8a8a");
            fg.addColorStop(1, "#e33b3b");
            g.beginPath();
            g.moveTo(x + s * 0.03, s * 0.14);
            g.lineTo(s * 0.9, s * 0.3);
            g.lineTo(x + s * 0.03, s * 0.47);
            g.closePath();
            g.fillStyle = fg;
            g.fill();
        } else {
            const cx = s / 2, cy = s / 2, rad = s * 0.28;
            g.strokeStyle = "#4a5262";
            g.lineWidth = Math.max(1.5, s * 0.08);
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI / 4) * i;
                g.beginPath();
                g.moveTo(cx + Math.cos(a) * rad * 0.85, cy + Math.sin(a) * rad * 0.85);
                g.lineTo(cx + Math.cos(a) * rad * 1.55, cy + Math.sin(a) * rad * 1.55);
                g.stroke();
            }
            const mg = g.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.1, cx, cy, rad * 1.15);
            mg.addColorStop(0, "#8892a6");
            mg.addColorStop(0.45, "#4d5666");
            mg.addColorStop(1, "#232a36");
            g.beginPath();
            g.arc(cx, cy, rad, 0, Math.PI * 2);
            g.fillStyle = mg;
            g.fill();
            g.beginPath();
            g.arc(cx - rad * 0.32, cy - rad * 0.34, rad * 0.24, 0, Math.PI * 2);
            g.fillStyle = "rgba(255,255,255,0.75)";
            g.fill();
        }
        return this._finish(key, c, s, s);
    }

    // ---------- 大面积面板 ----------

    public static background(w: number, h: number): SpriteFrame | null {
        const W = Math.max(15, Math.round(w)), H = Math.max(15, Math.round(h));
        const key = `bg_${W}_${H}`;
        const hit = this._cached(key);
        if (hit !== undefined) return hit;

        const made = this._canvas(W, H);
        if (!made) { this._cache[key] = null; return null; }
        const { c, g } = made;

        const grd = g.createLinearGradient(0, 0, 0, H);
        grd.addColorStop(0, "#eef5fd");
        grd.addColorStop(0.45, "#e2edfa");
        grd.addColorStop(1, "#d3e2f4");
        g.fillStyle = grd;
        g.fillRect(0, 0, W, H);

        const glow = g.createRadialGradient(W * 0.5, -H * 0.12, 10, W * 0.5, -H * 0.12, H * 0.72);
        glow.addColorStop(0, "rgba(255,255,255,0.85)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = glow;
        g.fillRect(0, 0, W, H);

        return this._finish(key, c, W, H);
    }

    public static bar(w: number, h: number): SpriteFrame | null {
        const W = Math.max(15, Math.round(w)), H = Math.max(15, Math.round(h));
        const key = `bar_${W}_${H}`;
        const hit = this._cached(key);
        if (hit !== undefined) return hit;

        const made = this._canvas(W, H);
        if (!made) { this._cache[key] = null; return null; }
        const { c, g } = made;
        // 简洁扁平：纯色底 + 一条细描边，不做渐变和投影
        const r = 14;
        this._roundRect(g, 1, 1, W - 2, H - 2, r);
        g.fillStyle = "#f7fafd";
        g.fill();
        g.lineWidth = 1.5;
        g.strokeStyle = "rgba(186,202,220,0.95)";
        g.stroke();
        return this._finish(key, c, W, H);
    }

    public static panel(w: number, h: number): SpriteFrame | null {
        const W = Math.max(15, Math.round(w)), H = Math.max(15, Math.round(h));
        const key = `panel_${W}_${H}`;
        const hit = this._cached(key);
        if (hit !== undefined) return hit;

        const made = this._canvas(W, H);
        if (!made) { this._cache[key] = null; return null; }
        const { c, g } = made;
        const r = 26;
        const b = 2;

        g.save();
        g.shadowColor = "rgba(58,72,98,0.4)";
        g.shadowBlur = 18;
        g.shadowOffsetY = 8;
        const grd = g.createLinearGradient(0, b, 0, H - b);
        grd.addColorStop(0, "#fffdf9");
        grd.addColorStop(0.6, "#fdf8ef");
        grd.addColorStop(1, "#f0e9dc");
        this._roundRect(g, b, b, W - b * 2, H - b * 2, r);
        g.fillStyle = grd;
        g.fill();
        g.restore();

        this._bevel(g, W, H, r, "rgba(255,255,255,1)", "rgba(150,136,110,0.45)", b + 1);
        return this._finish(key, c, W, H);
    }

    public static button(w: number, h: number, tone: ButtonTone): SpriteFrame | null {
        const W = Math.max(10, Math.round(w)), H = Math.max(10, Math.round(h));
        const key = `btn_${W}_${H}_${tone}`;
        const hit = this._cached(key);
        if (hit !== undefined) return hit;

        const made = this._canvas(W, H);
        if (!made) { this._cache[key] = null; return null; }
        const { c, g } = made;
        const r = Math.min(H / 2, 16);
        const b = 1.5;

        const palettes: Record<ButtonTone, string[]> = {
            neutral: ["#ffffff", "#eaf1fa", "#c6d4e6"],
            primary: ["#c3ebd7", "#93dab9", "#62bd93"],
            disabled: ["#e9edf3", "#e2e7ee", "#d3d9e2"],
        };
        const pal = palettes[tone];

        g.save();
        g.shadowColor = "rgba(72,92,124,0.3)";
        g.shadowBlur = 8;
        g.shadowOffsetY = 3;
        const grd = g.createLinearGradient(0, b, 0, H - b);
        grd.addColorStop(0, pal[0]);
        grd.addColorStop(0.55, pal[1]);
        grd.addColorStop(1, pal[2]);
        this._roundRect(g, b, b, W - b * 2, H - b * 2, r);
        g.fillStyle = grd;
        g.fill();
        g.restore();

        if (tone !== "disabled") {
            this._bevel(g, W, H, r, "rgba(255,255,255,0.95)", "rgba(95,115,145,0.42)", b + 1);
        }
        return this._finish(key, c, W, H);
    }
}
