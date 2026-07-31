/**
 * NoteManager at its public boundary: a map click in (via the fake Cesium input handler)
 * produces a note request, and submitting it renders an entity and emits plain data.
 *
 * Two contracts here are the ones that were actually broken on device, so they are the ones
 * worth holding: the note must render as a ground-anchored emblem rather than a floating
 * label, and it must survive a save/load round-trip so a shared TripLink shows it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteManager, { type SerializableNote } from './NoteManager';
import { installFakeCesium, waitFor, type FakeCesiumWorld } from './testing/fakeCesium';

vi.mock('cesium', async () => (await import('./testing/fakeCesium')).fakeCesium);

const SPOT = { lng: 168.7, lat: -45.1 };
const NOTE = { title: 'Car park', content: 'Aiming to leave around 8am', type: 'info' as const };

describe('NoteManager', () => {
  let world: FakeCesiumWorld;
  let added: SerializableNote[];
  let manager: NoteManager;
  let submit: ((data: typeof NOTE) => unknown) | null;

  beforeEach(async () => {
    world = installFakeCesium();
    added = [];
    submit = null;
    manager = new NoteManager(
      world.viewer,
      (note) => added.push(note),
      (_position, onSubmit) => {
        submit = onSubmit;
      },
    );
    await waitFor(() => world.hasAction('LEFT_CLICK'));
    manager.setMode(true);
  });

  afterEach(() => {
    manager.destroy();
    world.uninstall();
    // Unconditional: a spy on the shared noteGraphics module namespace outlives a failed
    // assertion otherwise, and silently changes what every later test sees.
    vi.restoreAllMocks();
  });

  /** The most recently added entity. Not `.at(-1)` — the project's lib target predates it. */
  const lastEntity = () => {
    const all = world.entities();
    return all[all.length - 1];
  };

  const placeNote = (note = NOTE) => {
    world.clickAt(SPOT.lng, SPOT.lat);
    expect(submit).toBeTypeOf('function');
    return submit!(note);
  };

  it('emits plain serialisable data, never live Cesium objects', () => {
    // A MapNote carries entity and Cartesian references. Putting one into React form state
    // puts an unserialisable value on the path to the persisted TripLink.
    placeNote();

    expect(added).toHaveLength(1);
    expect(added[0].title).toBe('Car park');
    expect(added[0].lat).toBeCloseTo(SPOT.lat, 6);
    expect(added[0].lng).toBeCloseTo(SPOT.lng, 6);
    expect(() => JSON.stringify(added[0])).not.toThrow();
  });

  it('renders the note as a ground-clamped emblem, not a floating label', async () => {
    // The old rendering used a label with a fixed 60px offset and no height reference, which
    // drifted against the map while zooming. The pin is clamped and bottom-anchored instead.
    // There is no canvas under node, so stand one in — this asserts what NoteManager does
    // with an emblem, which is the part that belongs to NoteManager.
    const graphics = await import('./noteGraphics');
    vi.spyOn(graphics, 'noteEmblem').mockReturnValue({} as unknown as HTMLCanvasElement);

    placeNote();

    const entity = lastEntity();
    expect(entity.billboard).toBeTruthy();
    expect(entity.billboard.heightReference).toBe('CLAMP_TO_GROUND');
    expect(entity.billboard.verticalOrigin).toBe('BOTTOM');
    expect(entity.label).toBeUndefined();
  });

  it('stays visible as a point when no emblem can be painted', () => {
    // Outside a DOM (and if a canvas context is ever refused) the note must still appear.
    // An entity with no graphics at all would vanish from the map silently.
    placeNote();

    const entity = lastEntity();
    expect(entity.point).toBeTruthy();
    expect(entity.point.heightReference).toBe('CLAMP_TO_GROUND');
  });

  it('puts the title on the entity name and the body in the description', () => {
    // Cesium renders `name` as the info-box header — this is what someone opening a shared
    // TripLink taps to read.
    placeNote();

    const entity = lastEntity();
    expect(entity.name).toBe('Car park');
    expect(entity.description).toContain('Aiming to leave around 8am');
  });

  it('round-trips through save and load', () => {
    // Reuses this manager rather than constructing a second one: each manager registers its
    // own LEFT_CLICK action on the shared fake world, so a second one steals the clicks and
    // makes neighbouring tests fail depending on timing.
    placeNote();
    const saved = manager.getSerializableNotes();

    manager.clearAll();
    expect(manager.getSerializableNotes()).toHaveLength(0);

    manager.loadNotes(saved);
    expect(manager.getSerializableNotes()).toEqual(saved);
  });

  it('loading replaces the notes on the map rather than stacking duplicates', () => {
    // The map can re-render; loading the same TripLink twice must not double every pin.
    placeNote();
    const saved = manager.getSerializableNotes();

    manager.loadNotes(saved);
    manager.loadNotes(saved);

    expect(manager.getSerializableNotes()).toHaveLength(1);
  });

  it('ignores clicks when note mode is off', () => {
    manager.setMode(false);
    world.clickAt(SPOT.lng, SPOT.lat);

    expect(submit).toBeNull();
  });
});
