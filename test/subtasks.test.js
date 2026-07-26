import subtasks from '../src/lib/subtasks.js';

const { isValidSubtasks } = subtasks;
const s = (over = {}) => ({ id: 'x', title: 't', done: false, ...over });

describe('isValidSubtasks', () => {
  it('accepts an empty array', () => {
    expect(isValidSubtasks([])).toBe(true);
  });

  it('accepts a well-formed list (extra fields allowed)', () => {
    expect(isValidSubtasks([s(), s({ done: true }), s({ note: 'ignored' })])).toBe(true);
  });

  it('rejects non-array inputs', () => {
    for (const bad of [null, undefined, {}, 'x', 42, true]) {
      expect(isValidSubtasks(bad)).toBe(false);
    }
  });

  it('rejects a null or non-object element', () => {
    expect(isValidSubtasks([null])).toBe(false);
    expect(isValidSubtasks(['str'])).toBe(false);
  });

  it('rejects a wrong-typed id', () => {
    expect(isValidSubtasks([s({ id: 1 })])).toBe(false);
    expect(isValidSubtasks([{ title: 't', done: false }])).toBe(false); // missing id
  });

  it('rejects a wrong-typed title', () => {
    expect(isValidSubtasks([s({ title: 5 })])).toBe(false);
    expect(isValidSubtasks([{ id: 'x', done: false }])).toBe(false); // missing title
  });

  it('rejects a non-boolean done', () => {
    expect(isValidSubtasks([s({ done: 'yes' })])).toBe(false);
    expect(isValidSubtasks([s({ done: 1 })])).toBe(false);
    expect(isValidSubtasks([{ id: 'x', title: 't' }])).toBe(false); // missing done
  });

  it('rejects when any element is invalid among valid ones', () => {
    expect(isValidSubtasks([s(), s({ done: 'no' }), s()])).toBe(false);
  });
});