import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: any | null;
  /*lastResultInterpretation?: string | null;*/
    day: string | null;
    time: string | null;
    personName: string | null;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" };
