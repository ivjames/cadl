/**
 * Runs a single {@link LessonDef} over the driving-coach event stream — pure,
 * no Babylon/DOM. Tracks objective completion and latches a pass/fail outcome.
 */

import {
  DrivingCoach,
  type CoachEvent,
  type DrivingSample,
} from "./scoring";
import { ACHIEVEMENT_LABELS, type LessonDef } from "./lessons";

export type LessonStatus = "in-progress" | "passed" | "failed";

export interface ObjectiveView {
  label: string;
  done: boolean;
}

export class LessonRunner {
  private readonly coach = new DrivingCoach();
  private outcome: LessonStatus = "in-progress";
  private failReason: string | null = null;

  constructor(private readonly lesson: LessonDef) {}

  /** Advance one frame; returns the coach event this frame (for the HUD flash). */
  observe(sample: DrivingSample, dt: number): CoachEvent | null {
    const event = this.coach.observe(sample, dt);
    if (this.outcome === "in-progress") this.evaluate(event);
    return event;
  }

  private evaluate(event: CoachEvent | null): void {
    // A disqualifying violation fails the lesson (latched).
    if (event && event.type === "violation" && this.lesson.failOn.includes(event.kind)) {
      this.outcome = "failed";
      this.failReason = event.message;
      return;
    }
    // Open-ended lessons (Free Drive) never pass or fail — just a scorecard.
    if (this.lesson.require.length === 0 && this.lesson.failOn.length === 0) return;
    // Pass once every required objective is done and the score clears the bar.
    const allDone = this.lesson.require.every((kind) => this.coach.hasAchievement(kind));
    if (allDone && this.coach.score >= this.lesson.passScore) {
      this.outcome = "passed";
    }
  }

  get status(): LessonStatus {
    return this.outcome;
  }

  get score(): number {
    return this.coach.score;
  }

  get failReasonText(): string | null {
    return this.failReason;
  }

  get objectives(): ObjectiveView[] {
    return this.lesson.require.map((kind) => ({
      label: ACHIEVEMENT_LABELS[kind],
      done: this.coach.hasAchievement(kind),
    }));
  }

  reset(): void {
    this.coach.reset();
    this.outcome = "in-progress";
    this.failReason = null;
  }
}
