/**
 * ClassicMode 经典扫雷模式
 * M1 第一个交付的玩法
 *
 * 使用方式：
 *   const mode = new ClassicMode();
 *   mode.start('medium');
 *   // 监听 mode.board.eventTarget 即可
 */
import { Board } from '../core/Board';
import { GameManager } from '../core/GameManager';
import { DifficultyConfig } from '../data/types';
import { DIFFICULTY_CONFIGS } from '../data/ConfigLoader';

export enum ClassicPhase {
    IDLE = 'idle',
    PLAYING = 'playing',
    WIN = 'win',
    LOSE = 'lose',
}

export class ClassicMode {
    public board: Board | null = null;
    public phase: ClassicPhase = ClassicPhase.IDLE;
    public difficulty: DifficultyConfig | null = null;

    public onPhaseChange?: (phase: ClassicPhase) => void;

    public start(difficultyId: string): Board {
        this.difficulty = { /* 引用自 ConfigLoader */
            ...this._getDifficulty(difficultyId),
        };
        const gm = GameManager.instance;
        this.board = gm.startGame(difficultyId);

        this._setPhase(ClassicPhase.PLAYING);

        this.board.eventTarget.on('game.over', (data: any) => {
            this._setPhase(data.win ? ClassicPhase.WIN : ClassicPhase.LOSE);
        });
        this.board.eventTarget.on('game.win', () => {
            this._setPhase(ClassicPhase.WIN);
        });

        return this.board;
    }

    public restart(): Board {
        if (!this.difficulty) throw new Error('No game to restart');
        return this.start(this.difficulty.id);
    }

    public reveal(row: number, col: number): boolean {
        if (!this.board) return false;
        return this.board.reveal({ row, col });
    }

    public toggleFlag(row: number, col: number): boolean {
        if (!this.board) return false;
        return this.board.toggleFlag({ row, col });
    }

    public chord(row: number, col: number): boolean {
        if (!this.board) return false;
        return this.board.chord({ row, col });
    }

    public undo(): boolean {
        if (!this.board) return false;
        return this.board.undo();
    }

    private _setPhase(p: ClassicPhase): void {
        this.phase = p;
        this.onPhaseChange?.(p);
    }

    private _getDifficulty(id: string): DifficultyConfig {
        return DIFFICULTY_CONFIGS[id];
    }
}
