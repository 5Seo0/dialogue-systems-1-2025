import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY } from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings: Settings = {
  azureCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

interface GrammarEntry {
  move?: string;
  ask?: string;
  confirm?: boolean;
}

const grammar: Record<string, GrammarEntry> = {
  "go up": { move: "up" },
  "go down": { move: "down" },
  "go left": { move: "left" },
  "go right": { move: "right" },
    "up": { move: "up" },
    "down": { move: "down" },
    "left": { move: "left" },
    "right": { move: "right" },
  "where am i": { ask: "position" },
  yes: { confirm: true },
  no: { confirm: false },
};

function normalize(str: string) {
  return str.toLowerCase().trim().replace(/[.?!]/g, "");
}

function getMoveDirection(utterance: string): string | null {
  return grammar[normalize(utterance)]?.move || null;
}

function isAskPosition(utterance: string): boolean {
  return grammar[normalize(utterance)]?.ask === "position";
}

function getConfirmation(utterance: string): boolean | null {
  const val = grammar[normalize(utterance)]?.confirm;
  return val !== undefined ? val : null;
}

const maze = [
  ["#", "#", "#", "#", "#"],
  ["Q", "S", " ", " ", "#"],
  [" ", "#", "Q", " ", "Q"],
  [" ", " ", "#", "E", "#"],
  ["#", "Q", " ", "?", "#"],
];

const startPos = { x: 1, y: 1 };

function getNextPos(pos: { x: number; y: number }, dir: string) {
  const delta: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  return { x: pos.x + delta[dir].x, y: pos.y + delta[dir].y };
}

const promptMessages = [
  "Where do you want to go?",
  "Which way next?",
  "What's your move next?",
  "Pick a direction.",
  "Where should I head?",
];

function renderMaze(container: HTMLElement, pos: { x: number; y: number }) {
  const html = maze
    .map((row, y) =>
      row
        .map((cell, x) => {
          const isPlayer = pos.x === x && pos.y === y;
          const display = isPlayer ? "🧍" : cell === "#" ? "⬛" : cell === "E" ? "🏁" : cell === "Q" ? "❓" : "⬜";
          return `<span style="display:inline-block;width:50px;height:50px;font-size:32px;text-align:center">${display}</span>`;
        })
        .join("")
    )
    .join("<br>");
  container.innerHTML = html;
}

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({ type: "SPEAK", value: { utterance: params.utterance } }),
    "spst.listen": ({ context }) => context.spstRef.send({ type: "LISTEN" }),
  },
}).createMachine({
  id: "DM",
  initial: "Prepare",
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    playerPos: startPos,
    moveDirection: null,
    speech: null,
    showMaze: true,
    inDarkZone: false,
    awaitingWhereAmI: false,
    promptIndex:0,
  }),
  on: {
    LISTEN_COMPLETE: [
      {
        target: ".CheckGrammar",
        guard: ({ context }) => !!context.lastResult,
      },
      {
        target: ".NoInput",
        actions: assign({ lastResult: () => null }),
      },
    ],
  },
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Welcome" },
    },
    Welcome: {
      entry: { type: "spst.speak", params: { utterance: "Welcome to the maze game. Where do you want to go?" } },
      on: { SPEAK_COMPLETE: "GetCommand" },
    },
    NoInput: {
      entry: { type: "spst.speak", params: { utterance: "I can't hear you. Try again." } },
      on: { SPEAK_COMPLETE: "GetCommand" },
    },
    InvalidInput: {
      entry: { type: "spst.speak", params: { utterance: "I didn't understand. Try again." } },
      on: { SPEAK_COMPLETE: "GetCommand" },
    },
    GetCommand: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: {
          actions: assign(({ event }) => ({ lastResult: event.value })),
        },
        ASR_NOINPUT: {
          actions: assign({ lastResult: () => null }),
        },
      },
    },
    CheckGrammar: {
      entry: assign(({ context }) => {
        const utterance = context.lastResult?.[0]?.utterance || "";

        let updates: Partial<DMContext> = {
          moveDirection: null,
          speech: null,
        };

                if (context.awaitingWhereAmI && isAskPosition(utterance)) {
          return {
            ...updates,
            speech: `You are at row ${context.playerPos.y+1}, column ${context.playerPos.x+1}. Let's move to a brighter spot.`,
            awaitingWhereAmI: false,
            moveDirection: null,
          };
        }

        const confirm = getConfirmation(utterance);

        if (confirm === true) {
          return {
            ...updates,
            speech: "Ask me where you are.",
            awaitingWhereAmI: true,
            inDarkZone: false,
          };
        }
        if (confirm === false) {
          return {
            ...updates,
            speech: "Okay. Then",
            inDarkZone: false,
          };
        }


        const direction = getMoveDirection(utterance);
        if (direction) {
          return {
            ...updates,
            moveDirection: direction,
            speech: `You just said: '${utterance}'. Moving ${direction}.`,
          };
        }

        if (isAskPosition(utterance)) {
          return {
            ...updates,
            speech: `You are at position X: ${context.playerPos.x}, Y: ${context.playerPos.y}`,
          };
        }

        return {
          ...updates,
          speech: `You just said: '${utterance}', but it's not in my commands.`,
        };
      }),
      always: [
        {
          guard: ({ context }) => !!context.moveDirection,
          target: "MovePlayer",
        },
        {
          guard: ({ context }) => context.speech !== null,
          target: "SpeakFeedback",
        },
        { target: "InvalidInput" },
      ],
    },
    MovePlayer: {
      entry: assign(({ context }) => {
        const dir = context.moveDirection;
        const next = dir ? getNextPos(context.playerPos, dir) : context.playerPos;
        const cell = maze[next.y]?.[next.x];

        if (!cell || cell === "#") {
          return { speech: "There's a wall. Try a different direction." };
        }

        if (cell === "E") {
          return {
            playerPos: next,
            speech: "Congratulations! You've reached the goal!",
            showMaze: true,
            inDarkZone: false,
          };
        }

        if (cell === "Q") {
          return {
            playerPos: next,
            speech: "Hmm... it's dark here. Do you need help?",
            showMaze: false,
            inDarkZone: true,
          };
        }

        return {
          playerPos: next,
          speech: `You moved ${dir}.`,
          showMaze: true,
          inDarkZone: false,
        };
      }),
      always: [
        {
          guard: ({ context }) => maze[context.playerPos.y][context.playerPos.x] === "E",
          target: "Final",
        },
        {
          guard: ({ context }) => context.inDarkZone,
          target: "AskHelpResponse",
        },
        { target: "SpeakFeedback" },
      ],
    },
    AskHelpResponse: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({
          utterance: context.speech ?? "Do you need help?",
        }),
      },
      on: { SPEAK_COMPLETE: "WaitForHelpResponse" },
    },
 WaitForHelpResponse: {
      entry: { type: "spst.listen" },
      on: {
        RECOGNISED: [
          {
            guard: ({ event }) => {
              const utterance = event.value?.[0]?.utterance || "";
              const confirm = getConfirmation(utterance);
              return confirm === true || confirm === false;
            },
            actions: assign(({ event }) => ({ lastResult: event.value })),
            target: "CheckGrammar",
          },
          {
            target: "InvalidInput",
          },
        ],
        ASR_NOINPUT: {
          actions: assign({ lastResult: () => null }),
          target: "NoInput",
        },
      },
    },
    SpeakFeedback: {
      entry: {
        type: "spst.speak",
        params: ({ context }) => ({ utterance: context.speech ?? "" }),
      },
      on: {
        SPEAK_COMPLETE: [
          {
            guard: ({ context }) => context.awaitingWhereAmI === true,
            target: "GetCommand",
          },
          {
            target: "PromptNext",
            actions: assign({ moveDirection: () => null, speech: () => null }),
          },
        ],
      },
    },
    PromptNext: {
  entry: {
    type: "spst.speak",
    params: ({ context }) => ({
      utterance: promptMessages[context.promptIndex % promptMessages.length],
    }),
  },
  on: {
    SPEAK_COMPLETE: {
      target: "GetCommand",
      actions: assign(({ context }) => ({
        promptIndex: context.promptIndex + 1,
      })),
    },
  },
},
    Final: {
      entry: {
        type: "spst.speak",
        params: { utterance: "Congratulations! You've reached the goal!" },
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: { type: "final" },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

export function setupButton(element: HTMLButtonElement) {
  const mazeContainer = document.createElement("div");
  mazeContainer.style.marginTop = "16px";
  element.parentElement?.appendChild(mazeContainer);

  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });

  dmActor.subscribe((snapshot) => {
    const { playerPos, showMaze, lastResult } = snapshot.context;

    if (showMaze) renderMaze(mazeContainer, playerPos);
    else mazeContainer.innerHTML = "";

    const utterance = lastResult?.[0]?.utterance;

    if (snapshot.matches("Final")) {
      element.innerText = "🎉 Game Over! You escaped!";
    } else if (snapshot.matches("WaitToStart")) {
      element.innerText = "▶️ Click to Start";
    } else if (snapshot.matches("GetCommand")||
      snapshot.matches("WaitForHelpResponse")) {
      element.innerText = "🎧 Listening...";
    } else if (
      snapshot.matches("NoInput")) {
        element.innerText = "❓ Try again";
    } else if (utterance) {
      element.innerText = `You said: ${utterance}`;
    } else {
      element.innerText = "Start Listening";
    }

    console.group("[Maze Game State Update]");
    console.log("State:", snapshot.value);
    console.log("Context:", snapshot.context);
    console.groupEnd();
  });
}
