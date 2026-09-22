/**
 * Storage 跨平台存档
 *
 * 统一走 sys.localStorage，不要直接用 window.localStorage。
 * 原因：小游戏平台上可能没有 window.localStorage，Cocos 探测失败后会把
 * sys.localStorage 换成一堆「只发警告的空实现」——直接写全局 localStorage
 * 会静默失效（不会崩，但战绩、设置、引导标记全都存不下来）。
 *
 * 这里所有读写都吞异常：存档出问题最多是丢数据，不能让主页面崩掉。
 */
import { sys } from "cc";

export class Storage {
    public static getString(key: string, fallback: string = ""): string {
        try {
            const v = sys.localStorage.getItem(key);
            return (v === null || v === undefined) ? fallback : v;
        } catch (e) {
            console.warn(`[Storage] 读取失败：${key}`, e);
            return fallback;
        }
    }

    public static setString(key: string, value: string): void {
        try {
            sys.localStorage.setItem(key, value);
        } catch (e) {
            console.warn(`[Storage] 写入失败：${key}`, e);
        }
    }

    /** 读 JSON；解析失败或结构不对时返回 fallback，不抛错 */
    public static getJSON<T>(key: string, fallback: T): T {
        const raw = this.getString(key, "");
        if (!raw) return fallback;
        try {
            const v = JSON.parse(raw);
            return (v === null || v === undefined) ? fallback : v as T;
        } catch (e) {
            console.warn(`[Storage] 存档损坏，按空处理：${key}`, e);
            return fallback;
        }
    }

    public static setJSON(key: string, value: unknown): void {
        try {
            this.setString(key, JSON.stringify(value));
        } catch (e) {
            console.warn(`[Storage] 序列化失败：${key}`, e);
        }
    }

    public static getBool(key: string): boolean {
        return this.getString(key, "0") === "1";
    }

    public static setBool(key: string, value: boolean): void {
        this.setString(key, value ? "1" : "0");
    }

    public static remove(key: string): void {
        try {
            sys.localStorage.removeItem(key);
        } catch (e) {
            console.warn(`[Storage] 删除失败：${key}`, e);
        }
    }

    /** 按前缀批量删除，用于「清空数据」 */
    public static clearByPrefix(prefix: string): number {
        let removed = 0;
        try {
            const keys: string[] = [];
            const total = sys.localStorage.length;
            for (let i = 0; i < total; i++) {
                const k = sys.localStorage.key(i);
                if (k && k.indexOf(prefix) === 0) keys.push(k);
            }
            for (const k of keys) {
                sys.localStorage.removeItem(k);
                removed++;
            }
        } catch (e) {
            console.warn(`[Storage] 批量删除失败：${prefix}*`, e);
        }
        return removed;
    }
}
