import express from "express";
import { authenticateJWT } from "../middlewares/authenticateJWT.js";
import { resolveCrmScope } from "../middlewares/resolveCrmScope.js";
import {
  crmAuthContract,
  listCrmClients,
  getCrmClientById,
  updateCrmClient,
  listCrmFollowups,
  createCrmFollowup,
  updateCrmFollowup,
  listCrmTeams,
  createCrmTeam,
  updateCrmTeam,
  updateCrmTeamMembers,
  getCrmTeamMembers,
  listCrmLeads,
  createCrmLead,
  updateCrmLead,
  bulkUpdateCrmLeads,
  deleteCrmLead,
  convertCrmLead,
  createCrmLeadFollowup,
  getCrmWorkQueue,
  getCrmOverviewMetrics,
  listCrmAssignableUsers,
  listCrmPipelines,
  createCrmPipeline,
  updateCrmPipeline,
  deleteCrmPipeline,
} from "../controllers/crmController.js";

const router = express.Router();

router.use(authenticateJWT);
router.use(resolveCrmScope);

router.get("/auth/contract", crmAuthContract);

router.get("/clients", listCrmClients);
router.get("/clients/:id", getCrmClientById);
router.patch("/clients/:id", updateCrmClient);

router.get("/clients/:customerId/followups", listCrmFollowups);
router.post("/clients/:customerId/followups", createCrmFollowup);
router.patch("/followups/:id", updateCrmFollowup);

router.get("/leads", listCrmLeads);
router.get("/team-members", listCrmAssignableUsers);
router.get("/teams", listCrmTeams);
router.post("/teams", createCrmTeam);
router.patch("/teams/:id", updateCrmTeam);
router.patch("/teams/:id/members", updateCrmTeamMembers);
router.get("/teams/:id/members", getCrmTeamMembers);
router.post("/leads", createCrmLead);
router.post("/leads/bulk-update", bulkUpdateCrmLeads);
router.patch("/leads/:id", updateCrmLead);
router.delete("/leads/:id", deleteCrmLead);
router.post("/leads/:id/convert", convertCrmLead);
router.post("/leads/:id/followups", createCrmLeadFollowup);
router.get("/pipelines", listCrmPipelines);
router.post("/pipelines", createCrmPipeline);
router.patch("/pipelines/:id", updateCrmPipeline);
router.delete("/pipelines/:id", deleteCrmPipeline);

router.get("/work-queue", getCrmWorkQueue);
router.get("/reports/overview", getCrmOverviewMetrics);

export default router;

