/**
 * ResultPopup 结算弹窗
 * 1~3 星 + 战绩 + 再来一局
 */
import { _decorator, Component, Node, Label, Sprite, tween, Vec3, UIOpacity, Layers, UITransform, Color, view } from "cc";
import { TextureLibrary } from "./TextureLibrary";
import { AudioManager } from "../core/AudioManager";
import { fitPanelWidth } from "./UiLayout";
const { ccclass, property } = _decorator;

/**
 * 结算面板底板的不透明度。
 * 留一点点透，能隐约看到后面已经翻开的棋盘（尤其是踩雷那局摊开的雷），
 * 但不能太低——字和按钮要压得住背景。
 */
const PANEL_ALPHA = 200;

/** 弹窗后面那层遮罩的颜色和浓度，和其他几个弹层保持一致 */
const MASK_COLOR = new Color(30, 34, 44, 190);

@ccclass("ResultPopup")
export class ResultPopup extends Component {
    @property(Label) titleLabel: Label | null = null;
    @property(Label) durationLabel: Label | null = null;
    @property(Label) difficultyLabel: Label | null = null;
    @property([Node]) starNodes: Node[] = [];
    @property(Node) retryBtn: Node | null = null;
    @property(Node) homeBtn: Node | null = null;
    @property(Node) statsBtn: Node | null = null;
    /**
     * 注意：这里绑定的是**节点**不是 Label 组件。
     * 编辑器里绑属性时用的是 propertyType="node"（传的也是节点 uuid），
     * 如果类型写成 Label，拿到的其实是 Node，再取 `.node` 就是 undefined。
     */
    @property(Node) newRecordLabel: Node | null = null;
    public onRetry?: () => void;
    public onHome?: () => void;
    public onStats?: () => void;

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
        // 遮罩铺满可见区域（不同机型能见宽度不一样，不能写死 750）
        const mask = this.node.getChildByName("Mask");
        if (mask) {
            const ms = mask.getComponent(Sprite);
            if (ms) {
                const visible = view.getVisibleSize();
                if (TextureLibrary.apply(ms, "white", visible.width, visible.height)) {
                    ms.color = MASK_COLOR.clone();
                }
            }
        }

        // 面板换成圆角 + 投影的立体底板
        const panel = this.node.getChildByName("PanelBG");
        if (panel) {
            // 先按可见宽度收一遍，再按最终尺寸贴图（否则窄屏上会左右溢出）
            fitPanelWidth(this.node, 600);
            const ptf = panel.getComponent(UITransform);
            const pw = ptf?.width ?? 600, ph = ptf?.height ?? 400;
            if (ptf) ptf.setContentSize(pw, ph);
            const ps = panel.getComponent(Sprite);
            if (ps) {
                if (!TextureLibrary.apply(ps, "panel", pw, ph)) {
                    ps.color = new Color(250, 247, 238, PANEL_ALPHA);
                } else {
                    // apply 里会把颜色重置成不透明白色，这里再压上透明度
                    ps.color = new Color(255, 255, 255, PANEL_ALPHA);
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
                if (!TextureLibrary.apply(sprite, "icon_star", STAR, STAR)) {
                    sprite.color = new Color(255, 206, 92, 255);
                }
            }
        }
        // 三个按钮并排：再来一局 / 查看战绩 / 返回主页
        this._styleButton(this.retryBtn, 160, 56, -175, true);
        this._styleButton(this.statsBtn, 160, 56, 0, false);
        this._styleButton(this.homeBtn, 160, 56, 175, false);

        if (this.newRecordLabel) {
            this.newRecordLabel.setPosition(0, 100, 0);
            const rec = this.newRecordLabel.getComponent(Label);
            if (rec) {
                rec.fontSize = 26;
                rec.lineHeight = 32;
                rec.color = new Color(232, 150, 40, 255);
            }
        }

        const styleTitle = (label: Label | null, size: number, y: number) => {
            if (!label) return;
            label.fontSize = size;
            label.lineHeight = size + 8;
            label.color = new Color(58, 58, 74, 255);
            label.node.setPosition(0, y, 0);
        };
        styleTitle(this.titleLabel, 40, 150);
        styleTitle(this.durationLabel, 30, 45);
        styleTitle(this.difficultyLabel, 26, 0);

        // 星星排成一行
        const n = this.starNodes.length;
        this.starNodes.forEach((star, i) => {
            if (star) star.setPosition((i - (n - 1) / 2) * 88, -60, 0);
        });
    }

    private _styleButton(btn: Node | null, w: number, h: number, x: number, primary: boolean): void {
        if (!btn) return;
        btn.setPosition(x, -140, 0);
        const tf = btn.getComponent(UITransform);
        if (tf) tf.setContentSize(w, h);
        const sprite = btn.getComponent(Sprite);
        if (sprite) {
            // 主操作（再来一局）用高亮色，另外两个用普通色
            const tex = primary ? "button_primary" : "button_neutral";
            if (!TextureLibrary.apply(sprite, tex, w, h)) {
                sprite.color = new Color(196, 224, 240, 255);
            }
        }
        const label = btn.getComponentInChildren(Label);
        if (label) {
            label.fontSize = 24;
            label.lineHeight = 28;
            label.color = new Color(58, 58, 74, 255);
            label.node.setPosition(0, 0, 0);
        }
    }

    public show(win: boolean, duration: number, difficulty: string, flagsUsed: number,
                stars: number = 0, isNewRecord: boolean = false): void {
        this.node.active = true;
        this._fixLayer();
        this._fixSizes();
        if (this.titleLabel) this.titleLabel.string = win ? "🎉 通关啦~" : "💥 差一点哦~";
        if (this.durationLabel) this.durationLabel.string = "⏱️ " + this._formatTime(duration);
        if (this.difficultyLabel) this.difficultyLabel.string = "难度：" + difficulty + "  🚩 旗帜：" + flagsUsed;
        // 新纪录角标：只有真的破了自己的最好成绩才显示
        if (this.newRecordLabel) this.newRecordLabel.active = isNewRecord;
        // 星级由 BattleScene 用 data/Scoring 统一算好后传进来，这里只负责显示
        this._showStars(win ? stars : 0);
        this._playShowAnimation();
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

    onRetryClicked() { AudioManager.play("click"); this.onRetry?.(); this.hide(); }
    onHomeClicked() { AudioManager.play("click"); this.onHome?.(); this.hide(); }
    onStatsClicked() { AudioManager.play("click"); this.onStats?.(); this.hide(); }
    public hide(): void { this.node.active = false; }
}
