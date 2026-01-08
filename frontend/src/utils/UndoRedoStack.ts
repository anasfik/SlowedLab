/**
 * Undo/Redo Stack Implementation
 * Manages state history for undo/redo operations
 */

export default class UndoRedoStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private present: T | null = null;
  private maxSize = 50; // Maximum undo steps

  push(state: T): void {
    this.past.push(this.present as T);
    this.present = state;
    this.future = []; // Clear redo history

    // Limit undo history size
    if (this.past.length > this.maxSize) {
      this.past.shift();
    }
  }

  undo(): T | null {
    if (this.past.length === 0) return null;

    const previous = this.past.pop()!;
    this.future.unshift(this.present!);
    this.present = previous;

    return this.present;
  }

  redo(): T | null {
    if (this.future.length === 0) return null;

    const next = this.future.shift()!;
    this.past.push(this.present!);
    this.present = next;

    return this.present;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.present = null;
  }

  getCurrent(): T | null {
    return this.present;
  }
}
