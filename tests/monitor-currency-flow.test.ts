import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { lastValueFrom, toArray } from "rxjs";
import { createApp } from "../apps/server/src/app.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { reminderList } from "../apps/server/src/engine/reminder-list.ts";
import type { AgentNotification, Monitor, MonitorCurrency } from "../packages/domain/src/agent.ts";
import { browserFixture } from "./helpers/browser.ts";
import { modelFixture } from "./helpers/model.ts";

test("all supported currencies persist, check the target currency and notify only on threshold crossings", async (t) => {
  let text = "";
  const url = "https://example.com/quote";
  const fixture = await browserFixture(t, (path, body) => ({
    data: path.endsWith("/read")
      ? { url, title: "Quote", text, truncated: false }
      : { id: body.id, title: "Quote", url, status: "active", updatedAt: new Date().toISOString() },
  }));
  const server = await createApp(fixture.db, fixture.config);
  t.after(() => server.agent.stop());
  for (const currency of ["CNY", "HKD", "USD"] as const) {
    const owner = `currency-${currency}`;
    const monitor = await server.agent.createMonitor(owner, {
      title: `${currency} watch`,
      url,
      condition: "price_below",
      currency,
      value: "15",
    });
    assert.equal(
      (await fixture.db.get<Monitor>(owner, "monitors", monitor.id))?.currency,
      currency,
    );
    const notifications = async () =>
      (await fixture.db.list<AgentNotification>(owner, "notifications")).filter(
        (item) => item.taskId === monitor.taskId,
      );
    const tick = async (page: string) => {
      text = page;
      await server.agent.controlMonitor(owner, monitor.id, "check");
      await server.agent.worker.tick();
      return server.agent.getTask(owner, monitor.taskId);
    };
    let task = await tick(`${currency} 15.00`);
    assert.equal(task.status, "scheduled");
    assert.equal(task.state.matched, false, "equal to the threshold is not strictly below it");
    assert.equal((await notifications()).length, 0);
    const other: MonitorCurrency = currency === "USD" ? "CNY" : "USD";
    task = await tick(`最新价 ${currency} 16.00\n${other} 1.00\n最低 ${currency} 2.00`);
    assert.equal(task.error, null);
    assert.equal(
      task.state.matched,
      false,
      "neither another currency nor an earlier low can trigger",
    );
    task = await tick(`${currency} 14.99`);
    assert.equal(task.state.matched, true);
    assert.equal((await notifications()).length, 1);
    await tick(`${currency} 14.99`);
    assert.equal((await notifications()).length, 1, "unchanged matched prices stay quiet");
    await tick(`${currency} 16.00`);
    await tick(`${currency} 14.99`);
    assert.equal((await notifications()).length, 2, "another threshold crossing notifies again");
    task = await tick(`${other} 1.00`);
    assert.equal(task.status, "scheduled");
    assert.match(task.error ?? "", /No readable/);
    assert.equal(
      task.state.failures,
      1,
      "missing target-currency prices retry instead of pretending the check succeeded",
    );
    assert.equal(reminderList([monitor], []).reminders[0].currency, currency);
    await server.agent.controlMonitor(owner, monitor.id, "stop");
  }
});

test("legacy CNY/HKD rules read their market currency and edited currencies re-evaluate the condition", async (t) => {
  let text = "";
  const fixture = await browserFixture(t, (path, body) => ({
    data: path.endsWith("/read")
      ? { url: "https://quote.eastmoney.com/sh600570.html", title: "Quote", text, truncated: false }
      : {
          id: body.id,
          title: "Quote",
          url: body.url,
          status: "active",
          updatedAt: new Date().toISOString(),
        },
  }));
  const server = await createApp(fixture.db, fixture.config);
  t.after(() => server.agent.stop());
  const owner = "legacy-currency";
  for (const [title, currency] of [
    ["恒生电子600570 跌破15元", "CNY"],
    ["灵宝黄金3330.HK 跌破15元", "HKD"],
  ] as const) {
    const monitor = await server.agent.createMonitor(owner, {
      title,
      url: "https://example.com/quote",
      condition: "price_below",
      value: "15",
      currency,
    });
    const { currency: _oldCurrency, ...legacy } = monitor;
    await fixture.db.put(owner, "monitors", legacy);
    text = `${currency} 14.99`;
    await server.agent.worker.tick();
    assert.equal((await server.agent.getTask(owner, monitor.taskId)).state.matched, true);
    await server.agent.controlMonitor(owner, monitor.id, "pause");
    const updated = await server.agent.updateMonitor(owner, monitor.id, {
      title,
      url: monitor.url,
      condition: "price_below",
      currency: "USD",
      value: "20",
    });
    assert.equal(updated.currency, "USD");
    assert.equal((await server.agent.getTask(owner, monitor.taskId)).state.matched, false);
    text = "USD 19.99";
    await server.agent.controlMonitor(owner, monitor.id, "resume");
    await server.agent.worker.tick();
    assert.equal((await server.agent.getTask(owner, monitor.taskId)).state.matched, true);
    await server.agent.controlMonitor(owner, monitor.id, "stop");
  }
});

test("the conversation's watch_page tool advertises and persists all three currencies", async (t) => {
  const { requests } = await modelFixture(t, (index) =>
    index === 0
      ? {
          name: "watch_page",
          arguments: {
            title: "恒生电子600570 跌破15元",
            url: "https://quote.eastmoney.com/sh600570.html",
            condition: "price_below",
            currency: "CNY",
            value: "15",
          },
        }
      : undefined,
  );
  const fixture = await browserFixture(t, () => {
    throw new Error("Saving a rule must not check its page yet");
  });
  const config = { ...fixture.config, agentBackend: "model" as const, model: "openai/fixture" };
  const server = await createApp(fixture.db, config);
  t.after(() => server.agent.stop());
  const input: RunAgentInput = {
    threadId: "currency-chat",
    runId: randomUUID(),
    messages: [
      {
        id: randomUUID(),
        role: "user",
        content: "恒生电子股价低于人民币15元时提醒我，每15分钟检查",
      },
    ],
    state: {},
    context: [],
    tools: [],
  };
  const events = await lastValueFrom(
    new ConversationAgent(config, server.agent, "local-user").run(input).pipe(toArray()),
  );
  const receipt = events.find((event) => event.type === EventType.TOOL_CALL_RESULT);
  assert.ok(receipt && receipt.type === EventType.TOOL_CALL_RESULT);
  assert.ok(typeof receipt.content === "string");
  const saved = JSON.parse(receipt.content) as Monitor;
  assert.equal(saved.currency, "CNY");
  assert.equal(saved.condition, "price_below");
  assert.equal(
    (await fixture.db.get<Monitor>("local-user", "monitors", saved.id))?.currency,
    "CNY",
  );
  for (const currency of ["CNY", "HKD", "USD"])
    assert.match(requests[0]?.body ?? "", new RegExp(currency));
});
