/**
 * Frame timing.
 *
 * Two properties matter. Delta is reported in seconds so that velocities are
 * px/second and stay constant across refresh rates, and it is clamped so that a
 * tab restored after ten minutes does not teleport the whole field.
 */
export class Clock {
  /** Seconds elapsed since start, excluding paused time. */
  elapsed = 0;
  /** Seconds since the previous frame, clamped to `maxDt`. */
  dt = 0;
  /** Frames ticked since start. */
  frame = 0;

  private last = 0;
  private started = false;

  constructor(private readonly maxDt = 0.05) {}

  tick(nowMs: number): void {
    if (!this.started) {
      this.started = true;
      this.last = nowMs;
      this.dt = 0;
      return;
    }

    let dt = (nowMs - this.last) / 1000;
    this.last = nowMs;

    if (!(dt > 0)) dt = 0;
    else if (dt > this.maxDt) dt = this.maxDt;

    this.dt = dt;
    this.elapsed += dt;
    this.frame++;
  }

  /**
   * Discard the accumulated gap without advancing time. Called on resume so the
   * first frame back does not carry the whole pause as a delta.
   */
  resync(): void {
    this.started = false;
    this.dt = 0;
  }
}
