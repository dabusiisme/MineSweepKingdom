/**
 * ResultPopup 结算弹窗
 * 1~3 星 + 战绩 + 再来一局
 */
import { _decorator, Component, Node, Label, Sprite, tween, Vec3, UIOpacity, Layers, UITransform, Color } from "cc";
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
        this.node.active = false;
    }

    private _fixLayer(): void {
        const UI_2D = Layers.Enum.UI_2D;
        this.node.walk(n => { n.layer = UI_2D; });
    }

    public show(win: boolean, duration: number, difficulty: string, flagsUsed: number): void {
        this.node.active = true;
        this._fixLayer();
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
            node.active = true;
            node.scale = new Vec3(0, 0, 1);
            if (i < count) {
                this.scheduleOnce(() => {
                    tween(node).to(0.3, { scale: new Vec3(1.2, 1.2, 1) }, { easing: "backOut" }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
                }, 0.3 * i + 0.5);
            } else {
                const sprite = node.getComponent(Sprite);
                if (sprite) sprite.color = new Color(120, 120, 130, 120);
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
