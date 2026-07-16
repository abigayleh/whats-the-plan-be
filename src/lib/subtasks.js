// Shared subtasks validation for Task and Event, both of which store
// subtasks as a Json column: [{ id, title, done }] — edited as a whole.
const isValidSubtasks = (value) => Array.isArray(value) && value.every((s) => (
  s && typeof s.id === 'string' && typeof s.title === 'string' && typeof s.done === 'boolean'
));

module.exports = { isValidSubtasks };
