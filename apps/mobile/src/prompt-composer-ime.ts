/**
 * Enter confirms an IME candidate (pinyin, kana, hangul) before it can send.
 * A plain Enter outside composition still sends.
 */
export const IME_ENTER_GRACE_MS = 50;

export type ImeKeyEvent = {
  keyCode?: number;
  isComposing?: boolean;
};

export type ImeCompositionState = {
  /** True between compositionstart and compositionend. */
  composing: boolean;
  /** Timestamp of the last compositionend. 0 when none has happened. */
  compositionEndedAt: number;
};

/**
 * Chrome on Windows/Linux can emit a second Enter with isComposing already
 * false, in the same moment compositionend runs. That key still belongs to
 * the input method. A later Enter, after the grace window, sends as usual.
 */
export function enterConfirmsIme(
  event: ImeKeyEvent,
  state: ImeCompositionState,
  now: number,
): boolean {
  if (event.isComposing || event.keyCode === 229 || state.composing) return true;
  return state.compositionEndedAt > 0 && now - state.compositionEndedAt < IME_ENTER_GRACE_MS;
}
