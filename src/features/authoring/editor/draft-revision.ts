export function mergeDraftRevision(currentRevision: number, nextRevision: number): number {
  return Math.max(currentRevision, nextRevision);
}
