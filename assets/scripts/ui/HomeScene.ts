/**
 * HomeScene 主页面
 * 结构在编辑器里搭好，这里只负责：素材上屏、按安全区排版、刷新战绩摘要、按钮响应。
 * 节点一律按名字查找（不用 @property 绑定），避免预制体/场景引用丢失后整页失灵。
 */
import {
    _decorator, Component, Node, Label, Sprite, view, sys, Layers, director,
    UITransform, Color, tween, Vec3, game, Game, isValid,
} from "cc";
import { TextureLibrary } from "./TextureLibrary";
import { AudioManager } from "../core/AudioManager";
import { GameManager } from "../core/GameManager";
import { DIFFICULTY_CONFIGS } from "../data/ConfigLoader";
import { starsFor, starText } from "../data/Scoring";
import { HelpPanel } from "./HelpPanel";
import { Storage } from "../core/Storage";
import { fitPanelWidth } from "./UiLayout";

const { ccclass } = _decorator;

/** 难度卡片节点 → 难度 id */
const CARD_NODES: Array<[string, string]> = [
    ["CardEasy", "easy"],
    ["CardMedium", "medium"],
    ["CardHard", "hard"],
    ["CardHell", "hell"],
];

/** 战绩面板里四档对应的节点 */
const STAT_BLOCKS: Array<[string, string]> = [
    ["Block1", "easy"],
    ["Block2", "medium"],
    ["Block3", "hard"],
    ["Block4", "hell"],
];

/**
 * 后续玩法入口。M3 做完哪个，把对应的 ready 改成 true 就会自动点亮：
 * 换成可点的按钮样式、提示文案从「敬请期待」变成「开始玩耍」。
 */
const COMING_SOON: Array<{ node: string; title: string; ready: boolean }> = [
    { node: "Card3D",   title: "3D 扫雷",   ready: false },
    { node: "CardItem", title: "道具扫雷", ready: false },
];

@ccclass("HomeScene")
export class HomeScene extends Component {
    /** 设计稿按 750x1334 摆位，这里按可见区和安全区重新落位 */
    private _nodes: Record<string, Node> = {};
    /** 「清空数据」的二次确认状态 */
    private _clearArmed: boolean = false;
    private _clearTimer: number | null = null;

    onEnable() {
        game.on(Game.EVENT_HIDE, this._onAppHide, this);
        game.on(Game.EVENT_SHOW, this._onAppShow, this);
    }

    onDisable() {
        game.off(Game.EVENT_HIDE, this._onAppHide, this);
        game.off(Game.EVENT_SHOW, this._onAppShow, this);
    }

    private _onAppHide(): void { AudioManager.setBgmSuspended(true); }
    private _onAppShow(): void { AudioManager.setBgmSuspended(false); }

    async start() {
        // 同样只等贴图；音频后台加载
        await TextureLibrary.load();
        if (!this._alive()) return;
        this._applyTextures();
        this._applyComingSoon();
        // 三个弹层是用 MCP 直接赋的 spriteFrame，type 还是 SIMPLE，
        // 不过这一道的话按钮和底板会被拉糊（64×64 的按钮图拉到 540 宽）
        for (const name of ["DifficultyPanel", "StatsPanel", "SettingsPanel"]) {
            const panel = this._node(name);
            TextureLibrary.reskinTree(panel);
            fitPanelWidth(panel);
        }
        this._layout();
        this._refreshStats();
        this._playIntro();

        // 从战斗页的「查看战绩」过来时，自动把战绩面板打开
        if (GameManager.pendingOpenPanel === "stats") {
            GameManager.pendingOpenPanel = "";
            this._openStatsPanel();
        }

        AudioManager.load()
            .then(() => {
                if (!this._alive()) return;
                AudioManager.playBGM();
            })
            .catch((e) => console.warn("[HomeScene] 音频加载失败，本次静音:", e));
    }

    /**
     * 组件是否还活着。
     * start() 里有 await，玩家可能在资源加载完之前就点了难度卡片触发切场景；
     * 等 await 醒过来时节点已经销毁，引擎的 _destruct() 会把对象类型的字段全部置成 null
     * （包括 _nodes），后面任何一次 this._node(...) 都会炸。所以每次 await 之后都要重新确认。
     */
    private _alive(): boolean {
        // 用严格模式：连"已排队等待销毁"也算不存活，避免在切换过程中继续跑
        return isValid(this, true) && !!this.node;
    }

    // ---------- 素材 ----------

    private _applyTextures(): void {
        const put = (name: string, tex: string, w: number, h: number) => {
            const n = this._node(name);
            if (n) TextureLibrary.apply(n.getComponent(Sprite), tex, w, h);
        };
        put("Backdrop", "background", view.getVisibleSize().width, view.getVisibleSize().height);
        put("Mascot", "icon_mine", 170, 170);
        put("ClassicCard", "button_primary", 580, 160);
        put("Card3D", "button_disabled", 270, 150);
        put("CardItem", "button_disabled", 270, 150);
        put("BtnRecords", "button_neutral", 190, 96);
        put("BtnSettings", "button_neutral", 190, 96);
        put("BtnHelp", "button_neutral", 190, 96);
    }

    // ---------- 排版 ----------

    private _applyComingSoon(): void {
        for (const item of COMING_SOON) {
            const card = this._node(item.node);
            if (!card) continue;

            const name = card.getChildByName("Label")?.getComponent(Label);
            if (name) name.string = item.title;

            const hint = card.getChildByName("Hint")?.getComponent(Label);
            if (hint) hint.string = item.ready ? "开始玩耍" : "敬请期待";

            const tf = card.getComponent(UITransform);
            TextureLibrary.apply(
                card.getComponent(Sprite),
                item.ready ? "button_neutral" : "button_disabled",
                tf?.width ?? 270, tf?.height ?? 150
            );
        }
    }

    private _layout(): void {
        const visible = view.getVisibleSize();
        let topInset = 0, bottomInset = 0;
        try {
            const r = sys.getSafeAreaRect();
            topInset = Math.max(0, visible.height - (r.y + r.height));
            bottomInset = Math.max(0, r.y);
        } catch {
            /* 平台不支持就按整屏 */
        }
        const top = visible.height / 2 - topInset;      // 安全区上边缘
        const bottom = -visible.height / 2 + bottomInset;

        const place = (name: string, y: number) => {
            const n = this._node(name);
            if (n) n.setPosition(n.position.x, y, 0);
        };

        // 从上往下：标题 → 吉祥物 → 战绩摘要 → 经典模式大卡 → 后续玩法 → 副入口 → 版本号
        place("TitleLabel", top - 100);
        place("Mascot", top - 250);
        place("StatLabel", top - 375);
        place("ClassicCard", top - 560);
        place("Card3D", top - 760);
        place("CardItem", top - 760);
        place("BtnRecords", bottom + 260);
        place("BtnSettings", bottom + 260);
        place("BtnHelp", bottom + 260);
        place("VersionLabel", bottom + 90);

        // ---- 横向按屏宽收放，避免窄屏（刘海机可见宽只有 ~615）挤在一起 ----
        const cx = visible.width;

        // 底部三个按钮：先算宽度再定间距，保证左右各留 ~5% 边距
        const btnGap = 24;
        const btnW = Math.min(190, Math.max(120, (cx * 0.9 - btnGap * 2) / 3));
        const btnStep = btnW + btnGap;
        this._resize("BtnRecords", btnW, 96);
        this._resize("BtnSettings", btnW, 96);
        this._resize("BtnHelp", btnW, 96);
        this._placeX("BtnRecords", -btnStep);
        this._placeX("BtnSettings", 0);
        this._placeX("BtnHelp", btnStep);

        // 经典模式大卡
        this._resize("ClassicCard", Math.min(580, cx * 0.88), 160);

        // 后续玩法两张卡并排
        const cardW = Math.min(270, (cx * 0.86 - 26) / 2);
        const cardStep = cardW / 2 + 13;
        this._resize("Card3D", cardW, 150);
        this._resize("CardItem", cardW, 150);
        this._placeX("Card3D", -cardStep);
        this._placeX("CardItem", cardStep);

        // 标题字号跟着屏宽缩
        const title = this._node("TitleLabel")?.getComponent(Label);
        if (title) title.fontSize = Math.round(Math.min(78, cx * 0.104));

        // 背景铺满，超出安全区也没关系
        const bg = this._node("Backdrop");
        if (bg) {
            const tf = bg.getComponent(UITransform);
            if (tf) tf.setContentSize(visible.width, visible.height);
        }
    }

    private _placeX(name: string, x: number): void {
        const n = this._node(name);
        if (n) n.setPosition(x, n.position.y, 0);
    }

    private _resize(name: string, w: number, h: number): void {
        const tf = this._node(name)?.getComponent(UITransform);
        if (tf) tf.setContentSize(Math.round(w), Math.round(h));
    }

    // ---------- 战绩摘要 ----------

    private _refreshStats(): void {
        const label = this._node("StatLabel")?.getComponent(Label);
        if (!label) return;

        let wins = 0;
        let best = "";              // 找用时最短的一档做展示
        let bestSec = Number.POSITIVE_INFINITY;
        try {
            for (const id of Object.keys(DIFFICULTY_CONFIGS)) {
                const history = GameManager.instance.getHistory(id) as any[];
                for (const h of history) {
                    if (!h?.win) continue;
                    wins++;
                    if (h.duration < bestSec) {
                        bestSec = h.duration;
                        const cfg = DIFFICULTY_CONFIGS[id];
                        best = `${cfg.name} ${this._mmss(h.duration)}`;
                    }
                }
            }
        } catch (e) {
            console.warn("[HomeScene] 读战绩失败，按空数据处理:", e);
        }

        label.string = wins > 0 ? `已通关 ${wins} 局 · 最快 ${best}` : "还没有战绩，先来一局吧~";
    }

    private _mmss(sec: number): string {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return m + ":" + (s < 10 ? "0" : "") + s;
    }

    // ---------- 入场动效 ----------

    private _playIntro(): void {
        const mascot = this._node("Mascot");
        if (!mascot) return;
        mascot.setScale(new Vec3(0.86, 0.86, 1));
        tween(mascot)
            .to(0.45, { scale: new Vec3(1.04, 1.04, 1) }, { easing: "backOut" })
            .to(0.15, { scale: new Vec3(1, 1, 1) })
            .start();
    }

    // ---------- 按钮 ----------

    onClassicClicked(): void {
        AudioManager.play("click");
        this._refreshPanel();
        const panel = this._node("DifficultyPanel");
        if (panel) panel.active = true;
    }

    onClosePanelClicked(): void {
        AudioManager.play("click");
        const panel = this._node("DifficultyPanel");
        if (panel) panel.active = false;
    }

    /** 四张难度卡片共用这一个回调，具体难度走 customEventData */
    onDifficultyClicked(_event: any, data: string): void {
        AudioManager.play("click");
        const id = data && DIFFICULTY_CONFIGS[data] ? data : "medium";
        GameManager.pendingDifficultyId = id;
        director.loadScene("BattleScene");
    }

    // ---------- 难度弹层 ----------

    private _refreshPanel(): void {
        // 四张卡片挂在 DifficultyPanel 下面，不是 HomeRoot 的直接子节点，
        // 所以必须从 DifficultyPanel 往下找（用 _node() 找会一直报"找不到节点"）。
        const panel = this._node("DifficultyPanel");
        if (!panel) return;

        for (const [nodeName, id] of CARD_NODES) {
            const cfg = DIFFICULTY_CONFIGS[id];
            const card = panel.getChildByName(nodeName);
            if (!cfg || !card) continue;

            const spec = card.getChildByName("Spec")?.getComponent(Label);
            if (spec) spec.string = `${cfg.rows} 行 × ${cfg.cols} 列 · ${cfg.mineCount} 雷`;

            const best = card.getChildByName("Best")?.getComponent(Label);
            if (best) best.string = this._bestText(id);
        }
    }

    /** 该难度下最好的一局：先比星级，同星级比用时 */
    private _bestText(difficultyId: string): string {
        let bestStars = 0;
        let bestSec = Number.POSITIVE_INFINITY;
        try {
            for (const h of GameManager.instance.getHistory(difficultyId) as any[]) {
                if (!h?.win) continue;
                const st = starsFor(DIFFICULTY_CONFIGS[difficultyId], h.duration);
                if (st > bestStars || (st === bestStars && h.duration < bestSec)) {
                    bestStars = st;
                    bestSec = h.duration;
                }
            }
        } catch (e) {
            console.warn("[HomeScene] 读最佳成绩失败:", e);
        }
        if (bestStars === 0) return "未通关";
        return `最佳 ${this._mmss(bestSec)} ${starText(bestStars)}`;
    }

    onRecordsClicked(): void {
        AudioManager.play("click");
        this._openStatsPanel();
    }

    private _openStatsPanel(): void {
        this._refreshStatsPanel();
        const panel = this._node("StatsPanel");
        if (panel) panel.active = true;
    }

    onCloseStatsClicked(): void {
        AudioManager.play("click");
        const panel = this._node("StatsPanel");
        if (panel) panel.active = false;
    }

    // ---------- 战绩面板 ----------

    private _refreshStatsPanel(): void {
        const panel = this._node("StatsPanel");
        if (!panel) return;

        let totalGames = 0;
        let totalWins = 0;

        for (const [blockName, id] of STAT_BLOCKS) {
            const cfg = DIFFICULTY_CONFIGS[id];
            if (!cfg) continue;

            let games = 0;
            let wins = 0;
            try {
                for (const h of GameManager.instance.getHistory(id) as any[]) {
                    games++;
                    if (h?.win) wins++;
                }
            } catch (e) {
                console.warn("[HomeScene] 读战绩失败，按空数据处理:", e);
            }
            totalGames += games;
            totalWins += wins;

            const block = panel.getChildByName(blockName);
            if (!block) continue;
            const name = block.getChildByName("Name")?.getComponent(Label);
            if (name) name.string = cfg.name;
            const best = block.getChildByName("Best")?.getComponent(Label);
            if (best) best.string = this._bestText(id);
            const stats = block.getChildByName("Stats")?.getComponent(Label);
            if (stats) {
                stats.string = games > 0
                    ? `${games} 局 · 通关 ${wins} · 胜率 ${Math.round(wins / games * 100)}%`
                    : "还没有记录";
            }
        }

        const summary = panel.getChildByName("SummaryLabel")?.getComponent(Label);
        if (summary) {
            summary.string = totalGames > 0
                ? `总计 ${totalGames} 局 · 通关 ${totalWins} · 胜率 ${Math.round(totalWins / totalGames * 100)}%`
                : "还没有战绩，先去玩一局吧~";
        }
    }

    onSettingsClicked(): void {
        AudioManager.play("click");
        this._resetClearButton();
        this._refreshSettingsPanel();
        const panel = this._node("SettingsPanel");
        if (panel) panel.active = true;
    }

    onCloseSettingsClicked(): void {
        AudioManager.play("click");
        this._resetClearButton();
        const panel = this._node("SettingsPanel");
        if (panel) panel.active = false;
    }

    onSettingsSoundClicked(): void {
        AudioManager.setMuted(!AudioManager.muted);
        AudioManager.play("click");
        this._refreshSettingsPanel();
    }

    onSettingsBgmClicked(): void {
        AudioManager.setBgmMuted(!AudioManager.bgmMuted);
        AudioManager.play("click");
        this._refreshSettingsPanel();
    }

    /** 设置里的「玩法说明」：关掉设置，打开说明 */
    onSettingsHelpClicked(): void {
        AudioManager.play("click");
        const panel = this._node("SettingsPanel");
        if (panel) panel.active = false;
        this._help()?.show();
    }

    // ---------- 设置面板 ----------

    /**
     * 清空数据要二次确认。
     * 不再套一层弹窗，改成"再点一次"：第一次点把按钮文字换成确认提示，3 秒内再点才真的清。
     */
    onSettingsClearClicked(): void {
        AudioManager.play("click");
        const label = this._clearLabel();

        if (!this._clearArmed) {
            this._clearArmed = true;
            if (label) label.string = "再点一次确认清空";
            if (this._clearTimer !== null) clearTimeout(this._clearTimer);
            this._clearTimer = setTimeout(() => this._resetClearButton(), 3000) as unknown as number;
            return;
        }

        this._resetClearButton();
        // 本项目所有存档都归在这两个前缀下
        Storage.clearByPrefix("battles.");
        Storage.clearByPrefix("msk_");
        // AudioManager 在内存里缓存了开关状态，清完存档要同步，否则界面和实际对不上
        AudioManager.setMuted(false);
        AudioManager.setBgmMuted(false);
        this._refreshSettingsPanel();
        this._refreshStats();
        if (label) label.string = "已清空";
        setTimeout(() => this._resetClearButton(), 1500);
    }

    private _clearLabel(): Label | null {
        return this._node("SettingsPanel")
            ?.getChildByName("BtnClear")?.getChildByName("Label")?.getComponent(Label) ?? null;
    }

    private _resetClearButton(): void {
        if (this._clearTimer !== null) { clearTimeout(this._clearTimer); this._clearTimer = null; }
        this._clearArmed = false;
        const label = this._clearLabel();
        if (label) label.string = "清空数据";
    }

    private _refreshSettingsPanel(): void {
        const panel = this._node("SettingsPanel");
        if (!panel) return;
        const set = (btn: string, text: string) => {
            const l = panel.getChildByName(btn)?.getChildByName("Label")?.getComponent(Label);
            if (l) l.string = text;
        };
        set("BtnSound", AudioManager.muted ? "音效：关" : "音效：开");
        set("BtnBgm", AudioManager.bgmMuted ? "背景音乐：关" : "背景音乐：开");
    }

    onHelpClicked(): void {
        AudioManager.play("click");
        // 玩法说明是预制体，内容由 HelpPanel 自己填
        this._help()?.show();
    }

    /** 玩法说明预制体上的组件 */
    private _help(): HelpPanel | null {
        // 按组件找而不是按名字找，改节点名也不会失效
        return this.node.getComponentInChildren(HelpPanel);
    }

    // ---------- 工具 ----------

    private _node(name: string): Node | null {
        if (!this._alive()) return null;
        if (!this._nodes) this._nodes = {};      // 被 _destruct 清过就重建
        if (!this._nodes[name]) {
            const n = this.node.getChildByName(name);
            if (!n) { console.warn(`[HomeScene] 找不到节点 ${name}`); return null; }
            this._nodes[name] = n;
        }
        return this._nodes[name];
    }
}
