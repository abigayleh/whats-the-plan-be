// Seeds realistic demo data onto a single account, for portfolio recordings.
//   node scripts/seed-demo.mjs --dry    build everything in a transaction, then roll back
//   node scripts/seed-demo.mjs          write it, recording every new id in the manifest
//   node scripts/seed-demo.mjs --undo   delete exactly what the manifest records
// Nothing outside the target account and its groups is ever touched.
import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEMO_USERS, MEMBERSHIPS, events, lists, itineraries, polls, pages } from './demoContent.mjs';

const TARGET_EMAIL = process.env.DEMO_TARGET_EMAIL || 'abigayle100@icloud.com';
const GROUP_NAMES = { family: 'Family Group', friends: 'Friends' };
const DEMO_PASSWORD = 'DemoPass123!';

// A separate target needs a separate manifest, or its undo would clobber the other's record.
const MANIFEST = join(dirname(fileURLToPath(import.meta.url)), process.env.DEMO_MANIFEST || 'seed-demo-manifest.json');
const prisma = new PrismaClient();
const mode = process.argv.includes('--undo') ? 'undo' : process.argv.includes('--dry') ? 'dry' : 'write';
const CREATE_GROUPS = process.env.DEMO_CREATE_GROUPS === '1';
// Seeding a second account needs its own demo people; the emails are unique per run.
const USER_SUFFIX = process.env.DEMO_USER_SUFFIX || '';
const demoEmail = (email) => (USER_SUFFIX ? email.replace('@', `.${USER_SUFFIX}@`) : email);

const empty = () => ({ users: [], groups: [], groupMembers: [], lists: [], tasks: [], events: [], itineraries: [], polls: [], pages: [], restore: [] });

async function resolveTarget(db, m) {
  const user = await db.user.findUnique({ where: { email: TARGET_EMAIL } });
  if (!user) throw new Error(`No account for ${TARGET_EMAIL}`);
  const memberships = await db.groupMember.findMany({ where: { userId: user.id }, include: { group: true } });
  const groups = {};
  for (const [key, name] of Object.entries(GROUP_NAMES)) {
    const found = memberships.find((member) => member.group.name === name);
    if (found) { groups[key] = found.groupId; continue; }
    // Default stays strict: the portfolio account's groups are real and must not be duplicated.
    if (!CREATE_GROUPS) throw new Error(`${TARGET_EMAIL} is not a member of a group named "${name}"`);
    const created = await db.group.create({
      data: { name, members: { create: { userId: user.id, role: 'ADMIN', color: 'primary' } } },
    });
    groups[key] = created.id;
    m.groups.push(created.id);
  }
  return { user, groups };
}

async function seed(db, { user, groups }, m) {
  const track = (bucket, row) => { m[bucket].push(row.id); return row; };
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Demo members, so assignees and poll tallies are not a cast of one.
  const people = { me: user.id };
  for (const person of DEMO_USERS) {
    const created = track('users', await db.user.create({
      data: { email: demoEmail(person.email), name: person.name, passwordHash, emailVerified: true },
    }));
    people[person.key] = created.id;
    track('lists', await db.list.create({ data: { name: 'My to dos', ownerId: created.id, groupId: null } }));
  }
  for (const link of MEMBERSHIPS) {
    await db.groupMember.create({
      data: { userId: people[link.user], groupId: groups[link.group], role: link.role, color: link.color },
    });
    m.groupMembers.push({ userId: people[link.user], groupId: groups[link.group] });
  }

  const taskData = (task, extra) => ({
    title: task.title,
    description: task.description ?? null,
    status: task.status ?? 'TODO',
    dueDate: task.dueDate ?? null,
    scheduledStart: task.scheduledStart ?? null,
    scheduledEnd: task.scheduledEnd ?? null,
    recurrenceRule: task.recurrenceRule ?? null,
    subtasks: task.subtasks ?? null,
    location: task.location ?? null,
    assignedToId: task.assign ? people[task.assign] : null,
    createdById: user.id,
    ...extra,
  });

  for (const list of lists(groups)) {
    let listId;
    if (list.existing) {
      const found = await db.list.findFirst({ where: { name: list.name, ownerId: user.id, groupId: null, itineraryId: null } });
      if (!found) throw new Error(`Expected an existing list named "${list.name}"`);
      listId = found.id;
      m.restore.push({ listId, isDefault: found.isDefault });
      await db.list.update({ where: { id: listId }, data: { isDefault: true } });
    } else {
      listId = track('lists', await db.list.create({
        data: {
          name: list.name, ownerId: user.id, groupId: list.group ?? null,
          icon: list.icon ?? null, color: list.color ?? null, isDefault: list.isDefault ?? false,
        },
      })).id;
    }
    for (const task of list.tasks) track('tasks', await db.task.create({ data: taskData(task, { listId }) }));
  }

  for (const event of events(groups)) {
    track('events', await db.event.create({
      data: {
        title: event.title, description: event.description ?? null,
        startAt: event.startAt, endAt: event.endAt, colorLabel: event.colorLabel ?? null,
        recurrenceRule: event.recurrenceRule ?? null, subtasks: event.subtasks ?? null,
        groupId: event.group ?? null, createdById: user.id,
      },
    }));
  }

  const createPoll = async (poll, groupId, itineraryId) => {
    const created = track('polls', await db.poll.create({
      data: {
        question: poll.question, groupId, itineraryId: itineraryId ?? null,
        createdById: user.id, expiresAt: poll.expiresAt ?? null,
        options: { create: poll.options.map((option) => ({ text: option })) },
      },
      include: { options: true },
    }));
    for (const [who, index] of Object.entries(poll.votes)) {
      await db.pollVote.create({
        data: { pollId: created.id, pollOptionId: created.options[index].id, userId: people[who] },
      });
    }
  };

  for (const itinerary of itineraries(groups)) {
    const created = track('itineraries', await db.itinerary.create({
      data: {
        title: itinerary.title, destination: itinerary.destination, description: itinerary.description,
        startDate: itinerary.startDate, endDate: itinerary.endDate,
        colorLabel: itinerary.colorLabel, icon: itinerary.icon, content: itinerary.content,
        completedAt: itinerary.completedAt ?? null, groupId: itinerary.group, createdById: user.id,
      },
    }));
    // Mirrors POST /api/itineraries: one auto-created list holds the trip's to-dos.
    const list = track('lists', await db.list.create({
      data: { name: itinerary.title, ownerId: user.id, groupId: itinerary.group, itineraryId: created.id },
    }));
    for (const task of itinerary.tasks) track('tasks', await db.task.create({ data: taskData(task, { listId: list.id }) }));
    for (const event of itinerary.events) {
      track('events', await db.event.create({
        data: {
          title: event.title, startAt: event.startAt, endAt: event.endAt, colorLabel: event.colorLabel ?? null,
          groupId: itinerary.group, itineraryId: created.id, createdById: user.id,
        },
      }));
    }
    for (const poll of itinerary.polls) await createPoll(poll, itinerary.group, created.id);
  }

  for (const poll of polls(groups)) await createPoll(poll, poll.group, null);

  for (const page of pages(groups)) {
    const parent = track('pages', await db.page.create({
      data: {
        title: page.title, icon: page.icon, content: page.content, position: page.position,
        ownerId: user.id, createdById: user.id, groupId: page.group ?? null,
      },
    }));
    for (const child of page.children) {
      track('pages', await db.page.create({
        data: {
          title: child.title, icon: child.icon, content: child.content, position: child.position,
          ownerId: user.id, createdById: user.id, groupId: page.group ?? null, parentId: parent.id,
        },
      }));
    }
  }
}

async function undo() {
  if (!existsSync(MANIFEST)) throw new Error('No manifest — nothing recorded to undo');
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const byId = (ids) => ({ where: { id: { in: ids } } });

  await prisma.task.deleteMany(byId(m.tasks));
  await prisma.poll.deleteMany(byId(m.polls));           // cascades options + votes
  await prisma.event.deleteMany(byId(m.events));
  await prisma.list.deleteMany(byId(m.lists));           // cascades any remaining tasks
  await prisma.itinerary.deleteMany(byId(m.itineraries));
  // Page parents are NoAction, so unwind children first — creation order was parent-then-child.
  for (const id of [...m.pages].reverse()) await prisma.page.deleteMany({ where: { id } });
  for (const { listId, isDefault } of m.restore) await prisma.list.update({ where: { id: listId }, data: { isDefault } });
  for (const key of m.groupMembers) await prisma.groupMember.deleteMany({ where: key });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: m.users } } });
  await prisma.user.deleteMany(byId(m.users));
  // Only groups this run created; a pre-existing group is never in the manifest.
  await prisma.group.deleteMany(byId(m.groups ?? []));

  writeFileSync(MANIFEST, JSON.stringify(empty(), null, 2));
  console.log('Undone. Manifest cleared.');
}

async function main() {
  if (mode === 'undo') return undo();

  const m = empty();
  const counts = () => Object.entries(m).map(([k, v]) => `${k}=${v.length}`).join(' ');

  if (mode === 'dry') {
    await prisma.$transaction(async (tx) => {
      await seed(tx, await resolveTarget(tx, m), m);
      console.log('Dry run OK —', counts());
      throw new Error('__rollback__');
    }, { maxWait: 15000, timeout: 180000 }).catch((err) => {
      if (err.message !== '__rollback__') throw err;
      console.log('Rolled back. Nothing was written.');
    });
    return;
  }

  if (existsSync(MANIFEST) && JSON.parse(readFileSync(MANIFEST, 'utf8')).users.length)
    throw new Error('Manifest still holds seeded ids — run --undo first');

  await prisma.$transaction(async (tx) => seed(tx, await resolveTarget(tx, m), m), { maxWait: 15000, timeout: 180000 });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  console.log('Seeded —', counts());
  console.log(`Demo members sign in with: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());