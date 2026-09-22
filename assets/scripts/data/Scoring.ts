/**
 * 星级规则（M2 定稿的方案 A：只按时间分三档）
 *   通关            → 1 星
 *   用时 ≤ 基准×1.5  → 2 星
 *   用时 ≤ 基准      → 3 星
 * 基准时间按难度配在 ConfigLoader 的 starSec 上。
 */
import { DifficultyConfig } from "./types";

export function starsFor(difficulty: DifficultyConfig | null, durationSec: number): number {
    if (!difficulty) return 1;
    if (durationSec <= difficulty.starSec) return 3;
    if (durationSec <= difficulty.starSec * 1.5) return 2;
    return 1;
}

/** 1~3 星的文字表示，例如 ★★☆ */
export function starText(stars: number): string {
    const n = Math.max(0, Math.min(3, Math.round(stars)));
    return "★".repeat(n) + "☆".repeat(3 - n);
}
