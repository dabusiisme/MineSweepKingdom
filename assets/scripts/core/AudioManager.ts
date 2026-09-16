/**
 * AudioManager 音效管理器
 * 使用 Web Audio API 生成简单音效，无需音频文件
 */
import { _decorator, Component, director, Node } from 'cc';

const { ccclass } = _decorator;

type SoundType = 'reveal' | 'flag' | 'unflag' | 'explosion' | 'win' | 'chord' | 'click';

@ccclass('AudioManager')
export class AudioManager extends Component {
    private static _instance: AudioManager | null = null;
    private _ctx: AudioContext | null = null;
    private _muted: boolean = false;

    public static get instance(): AudioManager {
        if (!this._instance) {
            const node = new Node('AudioManager');
            this._instance = node.addComponent(AudioManager);
            director.addPersistRootNode(node);
        }
        return this._instance;
    }

    onLoad() {
        this._muted = (typeof localStorage !== 'undefined' && localStorage.getItem('msk_muted') === '1');
    }

    private _ensureCtx(): AudioContext | null {
        if (typeof window === 'undefined') return null;
        if (!this._ctx) {
            const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AC) return null;
            this._ctx = new AC();
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume();
        }
        return this._ctx;
    }

    public setMuted(muted: boolean): void {
        this._muted = muted;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('msk_muted', muted ? '1' : '0');
        }
    }

    public get muted(): boolean { return this._muted; }

    public play(sound: SoundType): void {
        if (this._muted) return;
        const ctx = this._ensureCtx();
        if (!ctx) return;
        switch (sound) {
            case 'reveal': this._playTone(ctx, 600, 0.08, 'sine', 0.15); break;
            case 'flag': this._playTone(ctx, 880, 0.06, 'square', 0.1); break;
            case 'unflag': this._playTone(ctx, 440, 0.06, 'square', 0.1); break;
            case 'explosion':
                this._playNoise(ctx, 0.4, 0.3);
                this._playTone(ctx, 80, 0.5, 'sawtooth', 0.25);
                break;
            case 'win':
                this._playSequence(ctx, [523, 659, 784, 1047], 0.12, 'sine', 0.2);
                break;
            case 'chord':
                this._playTone(ctx, 700, 0.1, 'triangle', 0.12);
                this._playTone(ctx, 900, 0.1, 'triangle', 0.1);
                break;
            case 'click': this._playTone(ctx, 1000, 0.03, 'sine', 0.08); break;
        }
    }

    private _playTone(ctx: AudioContext, freq: number, duration: number, type: OscillatorType, volume: number): void {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    private _playSequence(ctx: AudioContext, freqs: number[], noteDuration: number, type: OscillatorType, volume: number): void {
        for (let i = 0; i < freqs.length; i++) {
            const startTime = ctx.currentTime + i * noteDuration;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freqs[i], startTime);
            gain.gain.setValueAtTime(0, startTime);
            gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + noteDuration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + noteDuration);
        }
    }

    private _playNoise(ctx: AudioContext, duration: number, volume: number): void {
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start(ctx.currentTime);
        noise.stop(ctx.currentTime + duration);
    }
}
