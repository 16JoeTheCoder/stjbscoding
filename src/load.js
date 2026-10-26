// Loaders shared by several pages: everything the "This week" screens and
// dashboards need about one class, fetched only for the role that may read it.
import * as data from "./data.js";
import { classLevels, topicsInOrder } from "./curriculum.js";
import { endedSessions } from "./time.js";

// For a teacher (or admin) looking at one class.
export async function classForStaff(cls) {
  const [members, help, sessions, projects] = await Promise.all([
    data.listMembers(cls.id), data.listOpenHelp(cls.id), data.listSessions(cls.id), data.listProjects(cls.id),
  ]);
  const done = new Set(sessions.filter((s) => !s.deleted).map((s) => s.date));
  return {
    cls,
    members,
    approved: members.filter((m) => m.status === "approved").sort((a, b) => a.name.localeCompare(b.name)),
    pending: members.filter((m) => m.status === "pending"),
    help,
    sessions,
    missing: endedSessions(cls).filter((d) => !done.has(d)),   // attendance not yet submitted
    projects,
  };
}

// The curriculum as this class sees it, plus the pointer's position.
export async function classCurriculum(cls) {
  const { latest, versions } = await data.loadCurriculum(cls.pins);
  const levels = latest ? classLevels(cls.track, cls.pins, latest, versions) : [];
  const topics = topicsInOrder(levels);
  const at = cls.pointer ? topics.findIndex((t) => t.topic.id === cls.pointer.topicId) : -1;
  return { latest, versions, levels, topics, at, current: at >= 0 ? topics[at] : null };
}
