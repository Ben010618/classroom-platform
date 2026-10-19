// First-come, first-served hand-raise queue. Hubs presence only has a `hand_raised` flag with no
// timestamp, so we stamp the time ourselves when we first see a hand go up. Pure function, unit-tested.

/**
 * @param {Array<{id:string,name:string,since:number}>} queue  previous queue (oldest first)
 * @param {Array<{id:string,name:string,handRaised:boolean}>} people  current people
 * @param {number} now  timestamp (ms)
 * @returns {Array<{id:string,name:string,since:number}>} new queue, oldest first
 */
export function updateHandQueue(queue, people, now) {
  const raised = new Map(people.filter(p => p.handRaised).map(p => [p.id, p]));
  const next = [];
  for (const entry of queue) {
    const person = raised.get(entry.id);
    if (person) {
      next.push({ ...entry, name: person.name });
      raised.delete(entry.id);
    }
  }
  // Hands raised since the last update: same timestamp, ordered by name so it's deterministic.
  const fresh = [...raised.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const p of fresh) next.push({ id: p.id, name: p.name, since: now });
  return next;
}

/** Converts Hubs presence state into the `people` shape above (latest meta wins). */
export function peopleFromPresence(presenceState) {
  return Object.entries(presenceState || {}).map(([id, { metas }]) => {
    const meta = metas[metas.length - 1] || {};
    return { id, name: (meta.profile && meta.profile.displayName) || "?", handRaised: !!meta.hand_raised };
  });
}
