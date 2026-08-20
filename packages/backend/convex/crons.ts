import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("lecture des demandes e-mail", { minutes: 1 }, internal.inboxPoller.pollInbox, {});
crons.interval("rattrapage des demandes Directus", { minutes: 5 }, internal.directusSync.syncRecentRequests, {});

export default crons;
