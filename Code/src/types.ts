import { Hypothesis, SpeechStateExternalEvent } from "speechstate";
import { AnyActorRef } from "xstate";

/*export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  lastResultInterpretation: string | null
}*/

export interface DMContext {
  spstRef: AnyActorRef;
  lastResult: Hypothesis[] | null;
  playerPos: {
    x: number;
    y: number;
  };
  speech: string | null;
  moveDirection?: string | null;
  showMaze? : boolean | null;
  confirm? : boolean | null;
  inDarkZone: boolean;
  awaitingWhereAmI: boolean;
  promptIndex:number;
}

export type DMEvents = SpeechStateExternalEvent | { type: "CLICK" };
