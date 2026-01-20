import { assign, createActor, setup } from "xstate";
import { Settings, speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure";
import { DMContext, DMEvents } from "./types";

const inspector = createBrowserInspector();

const azureCredentials = {
  endpoint: "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const azureLanguageCredentials = {
  endpoint: "https://asr-tts-saya.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2024-11-15-preview",
  key: NLU_KEY,
  projectName: "appointment",
  deploymentName: "appointment",
};

const settings: Settings = {
  azureCredentials,
  azureLanguageCredentials,
  azureRegion: "northeurope",
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

function getPersonName(nluResult: any): string | null {
  const entities =
    nluResult?.entities ?? [];

  const personEntity = entities.find(
    (e: any) => e.category === "person_name"
  );

  return personEntity?.text ?? null;
}

function getEntityText(nluResult: any, category: string): string | null {
  const entities = nluResult?.entities ?? [];
  const found = entities.find((e: any) => e.category === category);
  return found?.text ?? null;
}

/*interface GrammarEntry {
}*/

const dmMachine = setup({
  types: {
    context: {} as DMContext,
    events: {} as DMEvents,
  },
  actions: {
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
          value: {nlu:true},
      }),
  },
}).createMachine({
  context: ({ spawn }) => ({
    spstRef: spawn(speechstate, { input: settings }),
    lastResult: null,
      day: null,
      time: null,
      personName: null,
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
            target: "IntentRouter",
            guard: ({ context }) => !!context.lastResult,
          },
          { target: ".NoInput" },
        ],
      },
      states: {
        Prompt: {
          entry: { type: "spst.speak", params: { utterance: `Hello, How can I help you?` } },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        NoInput: {
          entry: {
            type: "spst.speak",
            params: { utterance: `I can't hear you!` },
          },
          on: { SPEAK_COMPLETE: "Ask" },
        },
        Ask: {
          entry: { type: "spst.listen" },
          on: {
            RECOGNISED: {
              actions: assign(({ event }) => {
                  console.log("NLU VALUE:", event.nluValue);
                return { lastResult: event.nluValue };
              }),
            },
            ASR_NOINPUT: {
              actions: assign({ lastResult: null }),
            },
          },
        },
      },
    },
    IntentRouter: {
        always:[
            {
                guard: ({context}) =>
                    context.lastResult?.topIntent === "who_is",
                target: "WhoIsFlow",
            },
            {
                guard: ({context})=>
                    context.lastResult?.topIntent === "create_meeting",
                target: "MeetingFlow",
            },
            {target: "Fallback"},
        ]
    },
      Fallback: {
        entry: {
            type: "spst.speak",
            params : {
                utterance: "Sorry, I didn't understand that.",
            },
        },
          on: {
            SPEAK_COMPLETE: "Greeting",
          },
      },
      WhoIsFlow: {
        initial: "CheckEntity",
          states: {
              CheckEntity: {
                  always: [
                      {
                          guard: (args) => !!args.context.personName,
                          target: "ProvideInfo",
                      },
                      {
                          target: "AskWho",
                      }
                  ]

              },
              AskWho: {
                  entry: {
                      type: "spst.speak",
                      params: {
                          utterance: "Who would you like to know about?",
                      },
                  },
                  on: {
                      SPEAK_COMPLETE: "Listen",
                  },
              },
              Listen: {
                  entry: ({context}) =>
                      context.spstRef.send({
                          type: "LISTEN",
                          value: {nlu: true},
                      }),
                  on: {
                      RECOGNISED: {
                          actions: assign(({event}) => ({
                              lastResult: event.nluValue,
                              personName: getPersonName(event.nluValue),
                          })),
                      },
                      LISTEN_COMPLETE:{
                          target: "CheckEntity",
                      },
                      ASR_NOINPUT: {
                          target: "AskWho",
                      },
                  },
              },
              ProvideInfo: {
                  entry: {
                      type: "spst.speak",
                      params: ({context}) => ({
                          utterance: `${context.personName} is a well-known person`,
                      }),
                  },
                  on: {
                      SPEAK_COMPLETE: "#DM.Done",
                  },
              },
          },
      },
    MeetingFlow: {
        initial: "CheckDay",
        states: {
            CheckDay : {
                always: [
                    {
                        guard: (args) =>
                            !!getEntityText(args.context.lastResult, "day"),
                        target: "CheckTime",
                    },
                    { target: "AskDay" },
                ],
            },
            AskDay : {
                entry: {
                    type: "spst.speak",
                    params: {utterance: "What day is the meeting?"},
                },
                on : {SPEAK_COMPLETE: "ListenDay"},
            },
            ListenDay : {
                entry: ({ context }) =>
                context.spstRef.send({
                    type: "LISTEN",
                    value: { nlu: true },
                }),
                on: {
                    RECOGNISED: {
                        actions: assign(({event}) => {
                            const day = getEntityText(event.nluValue, "day");
                            return {
                                lastResult: event.nluValue,
                                day: day ?? null,
                            };
                        }),
                    },
                    LISTEN_COMPLETE: {
                        target: "CheckDay",
                    },
                    ASR_NOINPUT: {
                        target: "AskDay",
                    },
                },
            },

            CheckTime : {
                always: [
                    {
                        guard: (args) =>
                            !!getEntityText(args.context.lastResult, "time"),
                        target: "Confirm",
                    },
                    { target: "AskTimePrompt" },
                ],
            },
            AskTimePrompt: {
                entry: {
                    type: "spst.speak",
                    params:{
                        utterance: "What time should the meeting start?",
                    },
                },
                on: { SPEAK_COMPLETE: "ListenTime" },
            },
            ListenTime : {
                entry: ({context}) =>
                context.spstRef.send({
                    type: "LISTEN",
                    value: { nlu: true},
                }),
                on: {
                    RECOGNISED: {
                        actions: assign(({event})=> {
                            const time = getEntityText(event.nluValue, "time");
                            return {
                                lastResult: event.nluValue,
                                time: time ?? null,
                            };
                        }),
                    },
                    LISTEN_COMPLETE: {
                        target: "CheckTime",
                    },
                    ASR_NOINPUT: {
                        target: "AskTimePrompt",
                    },
                },
            },

            Confirm: {
                entry: {
                    type: "spst.speak",
                    params: ({context}) => ({
                        utterance: `Your meeting is scheduled on ${context.day} at ${context.time}.`,
                    }),
                },
                on: {
                    SPEAK_COMPLETE: "#DM.Done",
                },
            },
        },
    },
    Done: {
      on: {
        CLICK: "Greeting",
      },
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
