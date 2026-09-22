/**
 * HelpPanel 玩法说明弹层
 * 做成预制体，主页和战斗页共用同一份内容，避免两处维护。
 * 文案写在本文件的 HELP_ROWS 里，改文案不用碰预制体。
 */
import { _decorator, Component, Label } from "cc";
import { AudioManager } from "../core/AudioManager";
import { Storage } from "../core/Storage";
import { TextureLibrary } from "./TextureLibrary";
import { fitPanelWidth } from "./UiLayout";

const { ccclass } = _decorator;

const HELP_ROWS: Array<{ title: string; desc: string }> = [
    { title: "👆 轻点格子", desc: "翻开它。格子上的数字表示周围 8 格里有几颗雷。" },
    { title: "🚩 长按 0.3 秒", desc: "插旗 / 取消插旗，标记你判断是雷的位置。" },
    { title: "✌️ 双击已翻开的数字", desc: "周围旗数正好等于数字时，一键展开剩下所有格子。" },
    { title: "💣 踩到雷", desc: "本局立即结束。把所有安全格都翻开就算通关。" },
    { title: "⭐ 星级", desc: "通关越快星级越高，最多 3 星。中途暂停不计时。" },
];

@ccclass("HelpPanel")
export class HelpPanel extends Component {
    /**
     * 首次引导存档。
     * 存的是**版本号**而不是 "1"：文案改了就把 VERSION 加一，老玩家会重新看一次。
     * 这也顺带解决了"上一版面板是坏的、虽然弹过但玩家什么都没看到"的情况。
     */
    private static readonly DONE_KEY = "msk_tutorial_done";
    private static readonly VERSION = "2";

    public static get tutorialDone(): boolean {
        return Storage.getString(HelpPanel.DONE_KEY, "") === HelpPanel.VERSION;
    }

    public static markTutorialDone(): void {
        Storage.setString(HelpPanel.DONE_KEY, HelpPanel.VERSION);
    }

    private _filled: boolean = false;

    // 注意：不要在这里写 this.node.active = false。
    // 预制体根节点本身就设成不激活，onLoad 会被推迟到第一次 show() 才执行，
    // 那时再把自己关掉就会出现"点了没反应"。初始隐藏交给预制体的 _active = false。

    public show(): void {
        this._fill();
        // 预制体里的 Sprite 是直接赋的 spriteFrame，type 默认 SIMPLE，补一道九宫格
        TextureLibrary.reskinTree(this.node);
        // 面板宽度收进可见区域（刘海机型可见宽只有 ~615，620 会溢出）
        fitPanelWidth(this.node);
        this.node.active = true;
    }

    public hide(): void { this.node.active = false; }

    onCloseClicked(): void {
        AudioManager.play("click");
        // 玩家真的点了「知道了」才算看过。
        // 不在 show() 里标记，是因为那样面板哪怕没渲染出来也会被记成"已读过"。
        HelpPanel.markTutorialDone();
        this.hide();
    }

    /** 按行号填文案；查找从面板自己出发，不依赖调用方是谁 */
    private _fill(): void {
        if (this._filled) return;
        HELP_ROWS.forEach((row, i) => {
            const rowNode = this.node.getChildByName(`Row${i + 1}`);
            if (!rowNode) {
                console.warn(`[HelpPanel] 预制体里缺少 Row${i + 1} 节点`);
                return;
            }
            const title = rowNode.getChildByName("Title")?.getComponent(Label);
            if (title) title.string = row.title;
            const desc = rowNode.getChildByName("Desc")?.getComponent(Label);
            if (desc) desc.string = row.desc;
        });
        this._filled = true;
    }
}
