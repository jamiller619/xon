import { afterEach, describe, expect, it } from 'vitest';
import { type XonEvent, emitEvent, eventBus } from './events.js';

describe('eventBus', () => {
  afterEach(() => {
    eventBus.removeAllListeners('event');
  });

  it('broadcasts scan:progress event to listeners', () => {
    let received: XonEvent | undefined;
    eventBus.on('event', (e: XonEvent) => {
      received = e;
    });

    emitEvent({
      type: 'scan:progress',
      payload: {
        libraryId: 'lib-1',
        fileCount: 10,
        currentFile: 'test.mp4',
        percentComplete: 50,
      },
    });

    expect(received).toEqual({
      type: 'scan:progress',
      payload: {
        libraryId: 'lib-1',
        fileCount: 10,
        currentFile: 'test.mp4',
        percentComplete: 50,
      },
    });
  });

  it('broadcasts scan:complete event to listeners', () => {
    let received: XonEvent | undefined;
    eventBus.on('event', (e: XonEvent) => {
      received = e;
    });

    emitEvent({
      type: 'scan:complete',
      payload: {
        libraryId: 'lib-1',
        newItems: 5,
        updatedItems: 2,
        removedItems: 1,
        totalDiscovered: 8,
      },
    });

    expect(received).toEqual({
      type: 'scan:complete',
      payload: {
        libraryId: 'lib-1',
        newItems: 5,
        updatedItems: 2,
        removedItems: 1,
        totalDiscovered: 8,
      },
    });
  });

  it('broadcasts scan:error event to listeners', () => {
    let received: XonEvent | undefined;
    eventBus.on('event', (e: XonEvent) => {
      received = e;
    });

    emitEvent({
      type: 'scan:error',
      payload: { libraryId: 'lib-1', error: 'Library not found' },
    });

    expect(received).toEqual({
      type: 'scan:error',
      payload: { libraryId: 'lib-1', error: 'Library not found' },
    });
  });

  it('broadcasts media:added event to listeners', () => {
    let received: XonEvent | undefined;
    eventBus.on('event', (e: XonEvent) => {
      received = e;
    });

    emitEvent({
      type: 'media:added',
      payload: { libraryId: 'lib-1', mediaItemId: 'item-1' },
    });

    expect(received).toEqual({
      type: 'media:added',
      payload: { libraryId: 'lib-1', mediaItemId: 'item-1' },
    });
  });

  it('broadcasts media:removed event to listeners', () => {
    let received: XonEvent | undefined;
    eventBus.on('event', (e: XonEvent) => {
      received = e;
    });

    emitEvent({
      type: 'media:removed',
      payload: { libraryId: 'lib-1', mediaItemId: 'item-1' },
    });

    expect(received).toEqual({
      type: 'media:removed',
      payload: { libraryId: 'lib-1', mediaItemId: 'item-1' },
    });
  });

  it('delivers events to multiple listeners', () => {
    const received: XonEvent[] = [];
    eventBus.on('event', (e: XonEvent) => received.push(e));
    eventBus.on('event', (e: XonEvent) => received.push(e));

    emitEvent({
      type: 'scan:error',
      payload: { libraryId: 'lib-1', error: 'oops' },
    });

    expect(received).toHaveLength(2);
  });

  it('does not deliver events after listener is removed', () => {
    let count = 0;
    const listener = () => {
      count++;
    };
    eventBus.on('event', listener);
    emitEvent({
      type: 'scan:error',
      payload: { libraryId: 'lib-1', error: 'oops' },
    });
    eventBus.off('event', listener);
    emitEvent({
      type: 'scan:error',
      payload: { libraryId: 'lib-1', error: 'oops' },
    });

    expect(count).toBe(1);
  });
});
