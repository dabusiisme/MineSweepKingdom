/**
 * AssetLoader 资源加载小工具
 * 把 resources.load 的回调包成 Promise；加载失败返回 null 而不是抛错，
 * 调用方可以据此回退到纯色 / 静音。
 */
import { resources } from "cc";

export function loadRes<T>(path: string, type: any): Promise<T | null> {
    return new Promise((resolve) => {
        resources.load(path, type, (err: Error | null, asset: any) => {
            if (err || !asset) {
                console.warn(`[AssetLoader] 加载失败: ${path}`, err?.message ?? "");
                resolve(null);
                return;
            }
            resolve(asset as T);
        });
    });
}
