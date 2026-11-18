/**
 * Orders optimistic favorite saves per hotel. Fast double clicks send overlapping requests;
 * only the latest one may roll back, and it restores the value from before *that* click.
 */
export function createRequestTracker() {
  const latest = new Map<string, number>();
  const before = new Map<number, boolean>();
  let seq = 0;

  return {
    begin(hotelId: string, previous: boolean): number {
      const token = ++seq;
      latest.set(hotelId, token);
      before.set(token, previous);
      return token;
    },
    /** Value to restore on failure, or undefined when a newer request superseded this one. */
    rollbackValue(hotelId: string, token: number): boolean | undefined {
      const value = before.get(token);
      before.delete(token);
      return latest.get(hotelId) === token ? value : undefined;
    },
    done(token: number): void {
      before.delete(token);
    },
  };
}
