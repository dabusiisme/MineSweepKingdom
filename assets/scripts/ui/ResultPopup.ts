/**
 * ResultPopup 结算弹窗
 * 1~3 星 + 战绩 + 再来一局
 */
import { _decorator, Component, Node, Label, Sprite, tween, Vec3, UIOpacity, Layers, UITransform, Color } from "cc";
import { TextureFactory } from "./TextureFactory";
const { ccclass, property } = _decorator;

@ccclass("ResultPopup")
export class ResultPopup extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Label) durationLabel: Label | null = null;
    @property(Label) difficultyLabel: Label | null = null;
    @property([Node]) starNodes: Node[] = [];
    @property(Node) retryBtn: Node | null = null;
    @property(Node) homeBtn: Node | null = null;
    public onRetry?: () => void;
    public onHome?: () => void;

    onLoad() {
        this._fixLayer();
        this._fixSizes();
        // 千万不要在这里写 this.node.active = false！
        // 场景里这个节点初始就是不激活的，onLoad 会被推迟到第一次 show()
        // 里那句 active = true 的时候同步执行，等于刚显示就立刻又被关掉。
        // 初始隐藏由 BattleScene 在开局时调用 hide() 负责。
    }

    private _fixLayer(): void {
        const UI_2D = Layers.Enum.UI_2D;
        this.node.walk(n => { n.layer = UI_2D; });
    }

    /** 修正被 TRIMMED 压成 4x4 的按钮和星星尺寸 */
    private _fixSizes(): void {
        // 面板换成圆角 + 投影的立体底板
        const panel = this.node.getChildByName("PanelBG");
        if (panel) {
            const ptf = panel.getComponent(UITransform);
            const pw = ptf?.width ?? 600, ph = ptf?.height ?? 400;
            if (ptf) ptf.setContentSize(pw, ph);
            const ps = panel.getComponent(Sprite);
            if (ps) {
                ps.sizeMode = Sprite.SizeMode.CUSTOM;
                const sf = TextureFactory.panel(pw, ph);
                if (sf) {
                    ps.spriteFrame = sf;
                    ps.color = new Color(255, 255, 255, 255);
                } else {
                    ps.color = new Color(250, 247, 238, 255);
                }
            }
        }

        const STAR = 72;
        for (const star of this.starNodes) {
            if (!star) continue;
            const tf = star.getComponent(UITransform);
            if (tf) tf.setContentSize(STAR, STAR);
            const sprite = star.getComponent(Sprite);
            if (sprite) {
                sprite.sizeMode = Sprite.SizeMode.CUSTOM;
                const sf = TextureFactory.icon("star", STAR);
                if (sf) {
                    sprite.spriteFrame = sf;
                    sprite.color = new Color(255, 255, 255, 255);
                } else {
                    sprite.color = new Color(255, 206, 92, 255);
                }
            }
        }
        this._styleButton(this.retryBtn, 120, 56, -110);
        this._styleButton(this.homeBtn, 120, 56, 110);

        const styleTitle = (label: Label | null, size: number, y: number) => {
            if (!label) return;
            label.fontSize = size;
            label.lineHeight = size + 8;
            label.color = new Color(58, 58, 74, 255);
            label.node.setPosition(0, y, 0);
        };
        styleTitle(this.titleLabel, 40, 130);
        styleTitle(this.durationLabel, 30, 60);
        styleTitle(this.difficultyLabel, 26, 10);

        // 星星排成一行
        const n = this.starNodes.length;
        this.starNodes.forEach((star, i) => {
            if (star) star.setPosition((i - (n - 1) / 2) * 88, -60, 0);
        });
    }

    private _styleButton(btn: Node | null, w: number, h: number, x: number): void {
        if (!btn) return;
        btn.setPosition(x, -140, 0);
        const tf = btn.getComponent(UITransform);
        if (tf) tf.setContentSize(w, h);
        const sprite = btn.getComponent(Sprite);
        if (sprite) {
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            const sf = TextureFactory.button(w, h, "primary");
            if (sf) {
                sprite.spriteFrame = sf;
                sprite.color = new Color(255, 255, 255, 255);
            } else {
                sprite.color = new Color(196, 224, 240, 255);
            }
        }
        const label = btn.getComponentInChildren(Label);
        if (label) {
            label.fontSize = 26;
            label.lineHeight = 30;
            label.color = new Color(58, 58, 74, 255);
            label.node.setPosition(0, 0, 0);
        }
    }

    public show(win: boolean, duration: number, difficulty: string, flagsUsed: number): void {
        this.node.active = true;
        this._fixLayer();
        this._fixSizes();
        if (this.titleLabel) this.titleLabel.string = win ? "🎉 通关啦~" : "💥 差一点哦~";
        if (this.durationLabel) this.durationLabel.string = "⏱️ " + this._formatTime(duration);
        if (this.difficultyLabel) this.difficultyLabel.string = "难度：" + difficulty + "  🚩 旗帜：" + flagsUsed;
        const stars = win ? this._calculateStars(duration, difficulty) : 0;
        this._showStars(stars);
        this._playShowAnimation();
    }

    private _calculateStars(duration: number, _difficulty: string): number {
        if (duration < 60) return 3;
        if (duration < 180) return 2;
        return 1;
    }

    private _showStars(count: number): void {
        this.starNodes.forEach((node, i) => {
            const sprite = node.getComponent(Sprite);
            if (i < count) {
                node.active = true;
                node.scale = new Vec3(0, 0, 1);
                if (sprite) sprite.color = new Color(255, 255, 255, 255);
                this.scheduleOnce(() => {
                    tween(node).to(0.3, { scale: new Vec3(1.2, 1.2, 1) }, { easing: "backOut" }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
                }, 0.3 * i + 0.5);
            } else {
                // 失败时全部隐藏；部分达成时剩下的灰着显示
                node.active = count > 0;
                node.scale = new Vec3(1, 1, 1);
                if (sprite) sprite.color = new Color(206, 213, 224, 255);
            }
        });
    }

    private _playShowAnimation(): void {
        const opacity = this.node.getComponent(UIOpacity);
        if (opacity) { opacity.opacity = 0; tween(opacity).to(0.3, { opacity: 255 }).start(); }
        this.node.scale = new Vec3(0.8, 0.8, 1);
        tween(this.node).to(0.3, { scale: new Vec3(1, 1, 1) }, { easing: "backOut" }).start();
    }

    private _formatTime(seconds: number): string {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    onRetryClicked() { this.onRetry?.(); this.hide(); }
    onHomeClicked() { this.onHome?.(); this.hide(); }
    public hide(): void { this.node.active = false; }
}
