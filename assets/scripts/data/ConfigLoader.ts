/**
 * ConfigLoader 难度配置加载器
 * v0.2 4 档难度（与需求文档 2.1 对齐）
 *
 * 棋盘一律做成"竖着的"（行数 > 列数），因为游戏是竖屏的：
 * 屏幕可用的高度大约是宽度的 1.6 倍，方形或横着的棋盘会白白浪费下半屏。
 * 雷的密度沿用了经典扫雷的比例（简单 12.5% / 中等 15.8% / 困难 20.6% / 地狱 22.2%）。
 */
import { DifficultyConfig } from './types';

export const DIFFICULTY_CONFIGS: Record<string, DifficultyConfig> = {
    easy: {
        id: 'easy',
        name: '简单',
        rows: 12,
        cols: 8,
        mineCount: 12,
        difficulty: 1.0,
        starSec: 60,
    },
    medium: {
        id: 'medium',
        name: '中等',
        rows: 20,
        cols: 12,
        mineCount: 38,
        difficulty: 1.6,
        starSec: 150,
    },
    hard: {
        id: 'hard',
        name: '困难',
        rows: 24,
        cols: 16,
        mineCount: 79,
        difficulty: 2.4,
        starSec: 300,
    },
    hell: {
        id: 'hell',
        name: '地狱',
        rows: 32,
        cols: 20,
        mineCount: 142,
        difficulty: 3.5,
        starSec: 600,
    },
};

export const COLOR_PALETTE = {
    mint:     '#B8E6D2',
    sakura:   '#FFD6E0',
    cream:    '#FFF1B6',
    sky:      '#C7E2F4',
    lavender: '#E0D4F7',
    matcha:   '#D4E8C2',
    text:     '#3A3A4A',
    subtext:  '#8A8A99',
} as const;

/** 数字颜色（与经典扫雷一致 + 治愈微调） */
export const NUMBER_COLORS: Record<number, string> = {
    1: '#5B8DEF',   // 蓝
    2: '#5BBA6F',   // 绿
    3: '#E96B6B',   // 红
    4: '#9B6BE9',   // 紫
    5: '#E9A66B',   // 橙
    6: '#6BC4C4',   // 青
    7: '#8B6B4A',   // 棕
    8: '#8A8A99',   // 灰
};
