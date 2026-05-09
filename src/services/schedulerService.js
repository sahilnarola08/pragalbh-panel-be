import cron from "node-cron";

/** Midnight tick — reserved for future jobs. Over-due kanban moves are disabled; Order Management highlights late work in-place. */
export const startSchedulers = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      console.log("[Scheduler] Midnight job (no automatic over_due status changes)");
    } catch (error) {
      console.error("[Scheduler] Error in midnight tick:", error);
    }
  });
};
