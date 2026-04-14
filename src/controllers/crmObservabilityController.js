import { crmTelemetry } from "../services/crmTelemetryService.js";

const getCrmPilotMetrics = async (req, res) => {
  return res.status(200).json({
    success: true,
    status: 200,
    message: "CRM pilot telemetry",
    data: crmTelemetry.snapshot(),
  });
};

export default {
  getCrmPilotMetrics,
};
