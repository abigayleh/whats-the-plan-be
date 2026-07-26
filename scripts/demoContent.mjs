// Demo content for the portfolio account. Pure data builders — no DB access.
// Dates are relative to "now" so the data stays current whenever the seed is re-run.

const NOW = new Date();

const startOfDay = (offset) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const at = (offset, hour, minute = 0) => {
  const d = startOfDay(offset);
  d.setHours(hour, minute, 0, 0);
  return d;
};

export const plus = (date, hours) => new Date(date.getTime() + hours * 3600 * 1000);

// Next occurrence of a weekday (0 = Sunday), always in the future.
export const nextWeekday = (weekday, hour, minute = 0) => {
  const d = new Date(NOW);
  d.setHours(hour, minute, 0, 0);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7 || 7));
  return d;
};

const weekly = (daysOfWeek) => ({ frequency: 'weekly', interval: 1, ...(daysOfWeek && { daysOfWeek }) });

const sub = (title, done = false) => ({ id: crypto.randomUUID(), title, done });

// --- TipTap document helpers ---
const text = (value) => [{ type: 'text', text: value }];
const p = (value) => ({ type: 'paragraph', ...(value && { content: text(value) }) });
const h = (level, value) => ({ type: 'heading', attrs: { level }, content: text(value) });
const bullets = (items) => ({
  type: 'bulletList',
  content: items.map((item) => ({ type: 'listItem', content: [p(item)] })),
});
const checks = (items) => ({
  type: 'taskList',
  content: items.map(([label, checked]) => ({
    type: 'taskItem',
    attrs: { checked },
    content: [p(label)],
  })),
});
const doc = (...content) => ({ type: 'doc', content });

// --- Demo members ---
// They exist so assignees, poll tallies and group rosters look real on camera.
export const DEMO_USERS = [
  { key: 'daniel', name: 'Daniel Hickey', email: 'demo+daniel@whatstheplan.demo' },
  { key: 'nora', name: 'Nora Hickey', email: 'demo+nora@whatstheplan.demo' },
  { key: 'maya', name: 'Maya Chen', email: 'demo+maya@whatstheplan.demo' },
  { key: 'jordan', name: 'Jordan Reyes', email: 'demo+jordan@whatstheplan.demo' },
];

export const MEMBERSHIPS = [
  { user: 'daniel', group: 'family', role: 'ADMIN', color: 'blue' },
  { user: 'nora', group: 'family', role: 'MEMBER', color: 'teal' },
  { user: 'nora', group: 'friends', role: 'MEMBER', color: 'primary' },
  { user: 'maya', group: 'friends', role: 'MEMBER', color: 'coral' },
  { user: 'jordan', group: 'friends', role: 'MEMBER', color: 'teal' },
];

// --- Calendar ---
export const events = ({ family, friends }) => [
  {
    title: 'Sunday dinner', group: family, colorLabel: 'coral',
    description: 'Rotating host — check the group chat for who is cooking.',
    startAt: nextWeekday(0, 17, 30), endAt: nextWeekday(0, 19, 30), recurrenceRule: weekly([0]),
  },
  {
    title: "Nora's birthday", group: family, colorLabel: 'amber',
    startAt: at(18, 18), endAt: at(18, 22), recurrenceRule: { frequency: 'yearly', interval: 1 },
    subtasks: [sub('Order the cake'), sub('Book the table', true)],
  },
  { title: 'Car service — Honda', group: family, startAt: at(5, 8), endAt: at(5, 9, 30) },
  { title: 'Family photos at the park', group: family, colorLabel: 'teal', startAt: at(33, 11), endAt: at(33, 12, 30) },
  { title: 'Dentist — Abigayle', group: family, startAt: at(-4, 14), endAt: at(-4, 15) },

  {
    title: 'Trivia night', group: friends, colorLabel: 'amber',
    description: 'The Wheatsheaf, same table as always.',
    startAt: nextWeekday(3, 19), endAt: nextWeekday(3, 21, 30),
    recurrenceRule: { frequency: 'weekly', interval: 2, daysOfWeek: [3] },
  },
  {
    title: "Maya's housewarming", group: friends, colorLabel: 'coral',
    startAt: at(9, 19), endAt: at(9, 23),
    subtasks: [sub('Bring wine'), sub('Pick up a card'), sub('Split a cab with Jordan')],
  },
  { title: 'Beach day at Woodbine', group: friends, colorLabel: 'blue', startAt: at(16, 11), endAt: at(16, 17) },
  { title: 'Arkells @ Budweiser Stage', group: friends, colorLabel: 'primary', startAt: at(26, 19, 30), endAt: at(26, 23) },
  { title: 'Brunch with Jordan', group: friends, startAt: at(-2, 11), endAt: at(-2, 13) },

  {
    title: 'Gym — strength', group: null, colorLabel: 'blue',
    startAt: nextWeekday(1, 7), endAt: nextWeekday(1, 8), recurrenceRule: weekly([1, 3, 5]),
  },
  { title: 'Physio', group: null, startAt: at(7, 16), endAt: at(7, 17) },
  { title: 'Flight to Halifax', group: null, colorLabel: 'teal', startAt: at(48, 6, 30), endAt: at(48, 9, 15) },
  {
    title: 'Book club', group: null, colorLabel: 'amber',
    startAt: at(12, 20), endAt: at(12, 21, 30), recurrenceRule: { frequency: 'monthly', interval: 1 },
  },
];

// --- Lists & to-dos ---
// `assign` is a DEMO_USERS key, 'me' for the account owner, or omitted for unassigned.
export const lists = ({ family, friends }) => [
  {
    name: 'Groceries', group: family, icon: 'groceries', color: 'teal',
    tasks: [
      { title: 'Milk & eggs', status: 'DONE' },
      { title: 'Coffee beans — the dark roast', assign: 'daniel' },
      { title: 'Chicken thighs', dueDate: at(1, 18) },
      { title: 'Pasta + jar of sauce' },
      { title: 'Dog food', assign: 'nora', dueDate: at(-1, 18) },
      { title: 'Dish soap', status: 'DONE' },
      { title: "Birthday cake for Nora", assign: 'me', dueDate: at(17, 12) },
    ],
  },
  {
    name: 'House Chores', group: family, icon: 'home', color: 'coral',
    tasks: [
      { title: 'Take out the recycling', assign: 'daniel', dueDate: nextWeekday(2, 8), recurrenceRule: weekly([2]) },
      {
        title: 'Clean out the garage', status: 'IN_PROGRESS', assign: 'me', dueDate: at(6, 17),
        description: 'Goal is to fit both cars in before winter.',
        subtasks: [sub('Sort the tool wall', true), sub('Donate old bikes', true), sub('Shelving for bins'), sub('Sweep + hose down')],
      },
      { title: 'Fix the leaky bathroom tap', assign: 'daniel', dueDate: at(-3, 12) },
      { title: 'Deep clean the fridge', assign: 'nora', dueDate: at(11, 10) },
      { title: 'Change the furnace filter', status: 'DONE' },
      { title: 'Mow the lawn', assign: 'nora', dueDate: at(0, 16) },
    ],
  },
  {
    name: 'Weekend Plans', group: friends, icon: 'celebration', color: 'amber',
    tasks: [
      { title: 'Book the escape room', assign: 'maya', dueDate: at(4, 12) },
      { title: 'Find a patio for Friday', status: 'IN_PROGRESS', assign: 'jordan' },
      { title: 'Split the concert tickets', assign: 'me', dueDate: at(20, 20) },
      { title: 'Pick a movie for Sunday', status: 'DONE' },
      { title: 'Reserve the karaoke room', assign: 'maya', dueDate: at(-2, 19) },
    ],
  },
  {
    name: 'My to dos', group: null, existing: true, isDefault: true,
    tasks: [
      {
        title: 'Renew passport', dueDate: at(40, 12),
        subtasks: [sub('Photos taken', true), sub('Guarantor signature'), sub('Mail the application')],
      },
      { title: 'Call the bank about the fee', dueDate: at(-5, 10) },
      { title: 'Submit expense report', status: 'DONE' },
      { title: 'Water the plants', dueDate: at(1, 9), recurrenceRule: weekly([1, 4]) },
      { title: "Buy a birthday gift for Nora", dueDate: at(16, 18) },
      {
        title: 'Record the portfolio walkthrough', status: 'IN_PROGRESS',
        scheduledStart: at(0, 14), scheduledEnd: at(0, 16),
        description: 'Screen record calendar → lists → itinerary → polls.',
      },
    ],
  },
  {
    name: 'Reading List', group: null, icon: 'book', color: 'primary',
    tasks: [
      { title: 'The Overstory — Richard Powers', status: 'DONE' },
      { title: 'Piranesi — Susanna Clarke', status: 'IN_PROGRESS' },
      { title: 'Station Eleven — Emily St. John Mandel' },
      { title: 'A Psalm for the Wild-Built — Becky Chambers' },
      { title: 'The Design of Everyday Things', status: 'DONE' },
    ],
  },
  {
    name: 'Fitness', group: null, icon: 'fitness', color: 'blue',
    tasks: [
      { title: 'Long run — 10k', scheduledStart: nextWeekday(6, 8), scheduledEnd: nextWeekday(6, 9, 15), recurrenceRule: weekly([6]) },
      {
        title: 'Yoga class', scheduledStart: at(2, 18), scheduledEnd: at(2, 19),
        location: { label: 'Yoga Space, Toronto', lat: 43.6532, lng: -79.3832 },
      },
      { title: 'Meal prep for the week', status: 'DONE' },
    ],
  },
];

// --- Itineraries ---
export const itineraries = ({ friends }) => [
  {
    title: 'Tofino Long Weekend', group: friends, destination: 'Tofino, BC',
    description: 'Four days of surf, rain and very good food.',
    startDate: at(19, 0), endDate: at(22, 23, 59), colorLabel: 'teal', icon: 'vacation',
    content: doc(
      h(2, 'The plan'),
      p('Ferry out Friday morning, drive the 4h to Tofino, back Monday afternoon.'),
      h(3, 'Booked'),
      bullets(['Cabin at Cox Bay — 2 nights', 'Ferry: Horseshoe Bay → Departure Bay, 08:00', 'Surf lesson Saturday 9am']),
      h(3, 'Still deciding'),
      checks([['Hot Springs Cove boat tour', false], ['Dinner at Wolf in the Fog', true], ['Rainforest boardwalk hike', false]]),
      p('Budget: roughly $420 each including the ferry and cabin split.'),
    ),
    tasks: [
      { title: 'Book the cabin', status: 'DONE', assign: 'maya' },
      { title: 'Buy ferry tickets', status: 'DONE', assign: 'me' },
      {
        title: 'Rent surfboards + wetsuits', dueDate: at(15, 12),
        location: { label: 'Pacific Surf Co, Tofino', lat: 49.1530, lng: -125.9066 },
      },
      {
        title: 'Reserve Wolf in the Fog', assign: 'jordan', dueDate: at(12, 12),
        location: { label: 'Wolf in the Fog, Tofino', lat: 49.1533, lng: -125.9083 },
      },
      {
        title: 'Book the Hot Springs Cove tour', assign: 'me', dueDate: at(14, 12),
        location: { label: 'Hot Springs Cove', lat: 49.3667, lng: -126.2667 },
      },
      { title: 'Pack rain gear — it will rain', subtasks: [sub('Rain shell'), sub('Boots'), sub('Dry bag')] },
    ],
    events: [
      { title: 'Ferry to Nanaimo', startAt: at(19, 8), endAt: at(19, 10, 30), colorLabel: 'teal' },
      { title: 'Drive to Tofino', startAt: at(19, 11), endAt: at(19, 15), colorLabel: 'teal' },
      { title: 'Surf lesson at Cox Bay', startAt: at(20, 9), endAt: at(20, 12), colorLabel: 'teal' },
      { title: 'Hot Springs Cove tour', startAt: at(21, 8, 30), endAt: at(21, 16), colorLabel: 'teal' },
      { title: 'Dinner at Wolf in the Fog', startAt: at(21, 19), endAt: at(21, 21), colorLabel: 'teal' },
      { title: 'Drive back + evening ferry', startAt: at(22, 10), endAt: at(22, 17), colorLabel: 'teal' },
    ],
    polls: [
      { question: 'Which cabin should we book?', options: ['Cox Bay — ocean front', 'Chesterman Beach — cheaper', 'Downtown Tofino — walkable'], votes: { me: 0, maya: 0, jordan: 2, nora: 0 } },
      { question: 'Saturday dinner — where?', options: ['Wolf in the Fog', 'Shelter Restaurant', 'Tacofino truck'], votes: { me: 0, maya: 0, jordan: 1, nora: 2 } },
    ],
  },
  {
    title: 'Portland Weekend', group: friends, destination: 'Portland, OR',
    description: 'Books, coffee and far too many food carts.',
    startDate: at(-38, 0), endDate: at(-35, 23, 59), colorLabel: 'amber', icon: 'travel',
    completedAt: at(-34, 12),
    content: doc(
      h(2, 'Highlights'),
      bullets(['Powell’s City of Books — three hours disappeared', 'Food cart pod on SW 10th', 'Japanese Garden on the rainy morning']),
      p('Would go back. Next time book the Columbia Gorge day trip in advance.'),
    ),
    tasks: [
      { title: 'Book flights', status: 'DONE', assign: 'me' },
      { title: 'Hotel — Pearl District', status: 'DONE', assign: 'maya' },
      { title: 'Settle up the shared tab', status: 'DONE', assign: 'jordan' },
    ],
    events: [
      { title: 'Flight to PDX', startAt: at(-38, 7), endAt: at(-38, 12, 30), colorLabel: 'amber' },
      { title: "Powell's Books", startAt: at(-37, 13), endAt: at(-37, 16), colorLabel: 'amber' },
      { title: 'Flight home', startAt: at(-35, 17), endAt: at(-35, 23), colorLabel: 'amber' },
    ],
    polls: [],
  },
];

// --- Group polls ---
export const polls = ({ family, friends }) => [
  {
    question: "Where for Maya's birthday dinner?", group: friends, expiresAt: at(6, 20),
    options: ['Ramen at Kinton', 'Tacos on Ossington', 'That new Thai place', 'Cook at mine'],
    votes: { me: 1, maya: 2, jordan: 1, nora: 0 },
  },
  {
    question: 'Which weekend works for the cottage?', group: family, expiresAt: at(9, 20),
    options: ['Aug 8–10', 'Aug 15–17', 'Aug 22–24'],
    votes: { me: 1, daniel: 1, nora: 2 },
  },
  {
    question: 'Movie night pick?', group: friends, expiresAt: at(-3, 20),
    options: ['Past Lives', 'Everything Everywhere', 'Whatever is on'],
    votes: { me: 0, maya: 0, jordan: 1 },
  },
];

// --- Notes pages ---
export const pages = ({ family, friends }) => [
  {
    key: 'manual', title: 'House Manual', group: family, icon: 'home', position: 0,
    content: doc(
      h(2, 'House Manual'),
      p('Everything anyone staying here needs to know. Keep it current.'),
      h(3, 'The basics'),
      bullets(['Bins go out Tuesday night', 'Thermostat is in the hallway — 20°C day, 18°C night', 'Spare key with the neighbours at #42']),
      h(3, 'If something breaks'),
      p('Plumber: Rowan at 416-555-0142. Electrician: ask Daniel first, he usually knows.'),
    ),
    children: [
      {
        title: 'Wifi & Utilities', icon: 'laptop', position: 0,
        content: doc(
          h(2, 'Wifi & Utilities'),
          bullets(['Network: Hickey-5G', 'Router is in the front closet — hold reset 10s', 'Hydro and internet both auto-pay on the 3rd']),
        ),
      },
      {
        title: 'Recycling Schedule', icon: 'nature', position: 1,
        content: doc(
          h(2, 'Recycling Schedule'),
          p('Alternating weeks — check the sticker on the bin lid.'),
          checks([['Blue bin — this week', true], ['Green bin — every week', true], ['Yard waste — first Tuesday', false]]),
        ),
      },
    ],
  },
  {
    key: 'tofino', title: 'Tofino Trip Notes', group: friends, icon: 'vacation', position: 0,
    content: doc(
      h(2, 'Tofino Trip Notes'),
      h(3, 'Packing'),
      checks([['Wetsuit booties', true], ['Rain shell', true], ['Dry bag for the boat tour', false], ['Cash for the food trucks', false]]),
      h(3, 'Notes'),
      bullets(['Cell service drops after Port Alberni — download maps', 'Ferry sells out on long weekends, book ahead', 'Tide table matters for the surf lesson']),
    ),
    children: [],
  },
  {
    key: 'recipes', title: 'Recipes to Try', group: null, icon: 'food', position: 0,
    content: doc(
      h(2, 'Recipes to Try'),
      bullets(['Miso butter salmon', 'Shakshuka with feta', 'Sunday ragù — needs 4 hours', 'Lemon olive oil cake']),
      p('The ragù is the one worth doing for Sunday dinner.'),
    ),
    children: [],
  },
  {
    key: 'goals', title: '2026 Goals', group: null, icon: 'star', position: 1,
    content: doc(
      h(2, '2026 Goals'),
      checks([['Ship the portfolio site', false], ['Run a half marathon', false], ['Read 24 books', true], ['Two trips somewhere new', false]]),
    ),
    children: [
      {
        title: 'Q3 Focus', icon: 'work', position: 0,
        content: doc(
          h(2, 'Q3 Focus'),
          p('Narrow it down — three things, not ten.'),
          bullets(['Portfolio walkthrough recorded', 'Halifax trip booked', 'Back to 4 runs a week']),
        ),
      },
    ],
  },
];