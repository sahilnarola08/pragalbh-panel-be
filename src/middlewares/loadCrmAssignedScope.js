import mongoose from "mongoose";
import CrmLead from "../models/crmLead.js";

/**
 * For team members (no wide lead access), loads customer IDs linked to leads they own.
 * Admins with canViewAllLeads skip this restriction.
 */
export async function loadCrmAssignedScope(req, res, next) {
  try {
    if (!req.crm || !req.user?._id) {
      return next();
    }
    if (req.crm.canViewAllLeads) {
      req.crm.assignedCustomerIds = null;
      return next();
    }

    const leads = await CrmLead.find({ ownerUserId: req.user._id })
      .select("convertedCustomerId")
      .lean();

    const ids = new Set();
    for (const lead of leads) {
      const cid = String(lead?.convertedCustomerId || "").trim();
      if (mongoose.Types.ObjectId.isValid(cid)) {
        ids.add(cid);
      }
    }
    req.crm.assignedCustomerIds = Array.from(ids);
    next();
  } catch (error) {
    next(error);
  }
}
