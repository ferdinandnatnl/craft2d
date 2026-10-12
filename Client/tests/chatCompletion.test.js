import test from "node:test";
import assert from "node:assert/strict";

const interval = globalThis.setInterval;
globalThis.setInterval = () => 0;
globalThis.window = {
    location: { href: "http://localhost/game.html" },
    indexedDB: { open: () => ({}) },
    AudioContext: class {},
    addEventListener: () => {},
};
globalThis.Audio = class { load() {} };
globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ getContext: () => ({}) }),
    querySelector: () => null,
    addEventListener: () => {},
    body: { classList: { toggle: () => {} } },
};
globalThis.localStorage = { getItem: () => null };

const { Chat } = await import("../Assets/game/chat.js");
globalThis.setInterval = interval;

function chatWithInput(message, cursorPosition = message.length) {
    const chat = new Chat();
    chat.inChat = true;
    chat.currentMessage = message;
    chat.cursorPosition = cursorPosition;
    return chat;
}

test("Tab completes a command and cycles matching names", () => {
    const chat = chatWithInput("/cl");
    chat.autocomplete();
    assert.equal(chat.currentMessage, "/clear");
    chat.autocomplete();
    assert.equal(chat.currentMessage, "/clearlog");
});

test("Tab completes arguments after a space and filters by prefix", () => {
    const chat = chatWithInput("/time set ");
    chat.autocomplete();
    assert.equal(chat.currentMessage, "/time set day");

    const dimension = chatWithInput("/dim en");
    dimension.autocomplete();
    assert.equal(dimension.currentMessage, "/dim end");
});

test("completion preserves the text after the cursor", () => {
    const chat = chatWithInput("/time se day", 8);
    chat.autocomplete();
    assert.equal(chat.currentMessage, "/time set day");
    assert.equal(chat.cursorPosition, 9);
});

test("completion ignores regular chat and respects the message limit", () => {
    const plain = chatWithInput("hello");
    plain.autocomplete();
    assert.equal(plain.currentMessage, "hello");

    const long = chatWithInput(`/cl ${"x".repeat(46)}`, 3);
    long.autocomplete();
    assert.equal(long.currentMessage, `/cl ${"x".repeat(46)}`);
});

test("editing after completion starts a new suggestion cycle", () => {
    const chat = chatWithInput("/cl");
    chat.autocomplete();
    chat._handleChatKeyDown({ key: "Backspace", preventDefault() {} });
    chat.autocomplete();
    assert.equal(chat.currentMessage, "/clear");
});
