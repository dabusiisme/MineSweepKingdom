/**
 * UiLayout 弹层排版小工具
 */
import { Node, UITransform, view } from "cc";

/** 弹层离屏幕左右各留的最小边距 */
const SCREEN_MARGIN = 12;

/**
 * 把弹层底板收进可见区域宽度内。
 *
 * 设计稿是按 750 宽摆的（面板 620），但刘海机型可见宽只有 ~615，
 * 直接按 620 摆会左右各溢出一点。这里取 min(设计宽, 可见宽 - 两边距)。
 *
 * 里面的内容（按钮 540 / 文案 520）在可见宽 577 时仍然放得下，所以不用跟着缩。
 */
export function fitPanelWidth(panelRoot: Node | null, designWidth: number = 620): void {
    if (!panelRoot) return;
    const bg = panelRoot.getChildByName("PanelBG");
    if (!bg) return;
    const tf = bg.getComponent(UITransform);
    if (!tf) return;
    const visible = view.getVisibleSize();
    tf.setContentSize(Math.min(designWidth, visible.width - SCREEN_MARGIN * 2), tf.height);
}
