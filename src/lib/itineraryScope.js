// Re-scopes an itinerary's dependent rows inside an open transaction. Its list,
// events and polls all carry groupId, so they move with it or they go stale.
async function moveScopedChildren(tx, itineraryId, nextGroupId) {
  await tx.list.updateMany({ where: { itineraryId }, data: { groupId: nextGroupId } });
  await tx.event.updateMany({ where: { itineraryId }, data: { groupId: nextGroupId } });
  if (nextGroupId) await tx.poll.updateMany({ where: { itineraryId }, data: { groupId: nextGroupId } });
  await clearStrandedAssignees(tx, itineraryId, nextGroupId);
}

// Assignees outside the destination scope are dropped, matching how moving a
// task between lists drops an assignee the target list can't have.
async function clearStrandedAssignees(tx, itineraryId, nextGroupId) {
  const lists = await tx.list.findMany({ where: { itineraryId }, select: { id: true, ownerId: true } });
  if (!lists.length) return;
  const listIds = lists.map((l) => l.id);
  const allowed = nextGroupId
    ? (await tx.groupMember.findMany({ where: { groupId: nextGroupId }, select: { userId: true } })).map(
        (m) => m.userId,
      )
    : [...new Set(lists.map((l) => l.ownerId))];
  await tx.task.updateMany({
    where: { listId: { in: listIds }, assignedToId: { notIn: allowed } },
    data: { assignedToId: null },
  });
}

module.exports = { moveScopedChildren };