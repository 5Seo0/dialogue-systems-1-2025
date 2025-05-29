import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import {HARD_ASR_ENDPOINT, KEY, NLU_KEY} from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint:
    "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
    endpoint: "https://asr-tts-saya.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
    key: NLU_KEY,
    projectName: "lab4",
    deploymentName: "lab4-deploy"
};

const settings: Settings = {
  azureCredentials: azureCredentials,
  azureLanguageCredentials : azureLanguageCredentials,
  speechRecognitionEndpointId : HARD_ASR_ENDPOINT,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};


interface GrammarEntry {
  person?: string;
  plant?: string;
  location?: string;
  animal?: string;
}

const grammar: { [index: string]: GrammarEntry } = {
  vlad: { person: "Vladislav Maraev" },
  aya: { person: "Nayat Astaiza Soriano" },
  victoria: { person: "Victoria Daniilidou" }
};


function isInGrammar(utterance: string) {
  return utterance.toLowerCase() in grammar;
}

function getPerson(utterance: string) {
  return (grammar[utterance.toLowerCase()] || {}).person;
}

const dmMachine = setup({
  types: {
    /** you might need to extend these */
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
    /** define your actions here */
    "spst.speak": ({ context }, params: { utterance: string }) =>
      context.spstRef.send({
        type: "SPEAK",
        value: {
          utterance: params.utterance,
        },
      }),
    "spst.listen": ({ context }) =>
      context.spstRef.send({
        type: "LISTEN",
        value: {nlu: true}
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
    lastResultInterpretation : null,
    lastEntities: null,
  }),
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: ({ context }) => context.spstRef.send({ type: "PREPARE" }),
      on: { ASRTTS_READY: "WaitToStart" },
    },
    WaitToStart: {
      on: { CLICK: "Greeting" },
    },
    Greeting: {
      initial: "Prompt",
      on: {
        LISTEN_COMPLETE: [
          {
            target: "ProcessIntent",
            guard: ({ context }) => !!context.lastResultInterpretation,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Welcome to the library assistant! You can ask about library hours, book recommendations, authors, or availability.` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I didn't catch that. Please try again.` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                return {
                    lastResult: event.value,
                    lastResultInterpretation : event.nluValue.topIntent,
                    lastEntities: event.nluValue?.entities ?? null,
                };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null, lastResultInterpretation : null,lastEntities: null, }),
            },
          },
        },
      },
    },
    ProcessIntent: {
      entry: ({ context }) => {
        const intent = context.lastResultInterpretation;
        const entities = context.lastEntities || {};
        const utterance = context.lastResult?.[0]?.utterance || "";
        let response = "";

        switch (intent) {
          case "library_hours":
            response =
              "The library is open from 9 AM to 7 PM on weekdays, and 10 AM to 4 PM on Saturdays. We're closed on Sundays.";
            break;

          case "recommend_book": {
            const genre = entities["genre"]?.[0] || "fiction";
            response = `Sure! I recommend a ${genre} novel like 'The Midnight Library' or 'Dune'.`;
            break;
          }

          case "find_author": {
            const author = entities["author_name"]?.[0];
            response = author
              ? `Yes, we have books by ${author}. Would you like to know which ones are available?`
              : "Which author are you looking for?";
            break;
          }

          case "search_book": {
            const book = entities["book_title"]?.[0];
            const status = entities["availability_status"]?.[0];
            response = book
              ? status
                ? `"${book}" is currently marked as ${status}. Would you like to borrow it?`
                : `Yes, "${book}" is in our catalog. Want to check if it's available?`
              : "Which book are you looking for?";
            break;
          }

          default:
            response = `I'm not sure how to help with "${utterance}". Try asking about a book, author, or library hours.`;
        }

        context.spstRef.send({
          type: "SPEAK",
          value: { utterance: response },
        });
      },
      on: { SPEAK_COMPLETE: "Done" },
    },
    Done: {
      on: { CLICK: "Greeting" },
    },
  },
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect,
}).start();

dmActor.subscribe((state) => {
  console.group("State update");
  console.log("State value:", state.value);
  console.log("State context:", state.context);
  console.groupEnd();
});

export function setupButton(element: HTMLButtonElement) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.subscribe((snapshot) => {
    const meta: { view?: string } = Object.values(
      snapshot.context.spstRef.getSnapshot().getMeta(),
    )[0] || {
      view: undefined,
    };
    element.innerHTML = `${meta.view}`;
  });
}
