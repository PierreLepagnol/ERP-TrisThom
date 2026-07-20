import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("lecture des demandes e-mail", { minutes: 10 }, internal.inboxPoller.pollInbox, {});

export default crons;
