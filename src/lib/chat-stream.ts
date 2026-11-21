import type { ChatStreamEvent } from "./chat-agent";

export interface StreamEventV2Metadata {
  protocolVersion: 2;
  requestId: string;
  sequence: number;
  timestamp: string;
  terminal: boolean;
}

export type StreamEventV2 = ChatStreamEvent & StreamEventV2Metadata;

export async function* sequenceChatEvents(
  source: AsyncIterable<ChatStreamEvent>,
  requestId: string,
  options: { now?: () => Date } = {},
): AsyncIterable<StreamEventV2> {
  const now = options.now ?? (() => new Date());
  let sequence = 0;
  let terminalEmitted = false;

  const addMetadata = (event: ChatStreamEvent): StreamEventV2 => ({
    ...event,
    protocolVersion: 2,
    requestId,
    sequence: ++sequence,
    timestamp: now().toISOString(),
    terminal: event.type === "done",
  });

  try {
    for await (const event of source) {
      if (terminalEmitted) continue;
      if (event.type === "done") terminalEmitted = true;
      yield addMetadata(event);
    }
  } catch {
    if (!terminalEmitted) {
      yield addMetadata({ type: "error", text: "Rassam could not complete this request. Please retry." });
    }
  }

  if (!terminalEmitted) {
    yield addMetadata({ type: "done" });
  }
}
