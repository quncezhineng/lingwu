import assert from "node:assert/strict";
import test from "node:test";
import { enterConfirmsIme, IME_ENTER_GRACE_MS } from "../src/prompt-composer-ime.ts";

const idle = { composing: false, compositionEndedAt: 0 };

test("普通回车不是输入法确认，可以发送", () => {
  assert.equal(enterConfirmsIme({ keyCode: 13, isComposing: false }, idle, 1_000), false);
});

test("输入法组合中的回车不发送", () => {
  assert.equal(enterConfirmsIme({ keyCode: 229, isComposing: true }, idle, 1_000), true);
  assert.equal(enterConfirmsIme({ keyCode: 13, isComposing: true }, idle, 1_000), true);
  assert.equal(
    enterConfirmsIme(
      { keyCode: 13, isComposing: false },
      { composing: true, compositionEndedAt: 0 },
      1_000,
    ),
    true,
  );
});

test("组合刚结束时紧跟的回车仍留给输入法", () => {
  const ended = { composing: false, compositionEndedAt: 1_000 };
  assert.equal(
    enterConfirmsIme({ keyCode: 13, isComposing: false }, ended, 1_000 + IME_ENTER_GRACE_MS - 1),
    true,
  );
  assert.equal(
    enterConfirmsIme({ keyCode: 13, isComposing: false }, ended, 1_000 + IME_ENTER_GRACE_MS),
    false,
  );
});
