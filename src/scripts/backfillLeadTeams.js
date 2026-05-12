import mongoose from "mongoose";
import dotenv from "dotenv";
import CrmLead from "../models/crmLead.js";
import CrmTeam from "../models/crmTeam.js";

dotenv.config({ quiet: true });

async function run() {
  const mongoUri =
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    process.env.DATABASE_URL;
  if (!mongoUri) {
    throw new Error("Mongo URI is required (MONGO_URL/MONGODB_URI/MONGO_URI/DATABASE_URL)");
  }

  await mongoose.connect(mongoUri);

  const teams = await CrmTeam.find({ isActive: true }).select("_id memberUserIds").lean();
  const ownerToTeam = new Map();
  for (const team of teams) {
    const members = Array.isArray(team?.memberUserIds) ? team.memberUserIds : [];
    for (const member of members) {
      const memberId = String(member || "");
      if (!memberId || ownerToTeam.has(memberId)) continue;
      ownerToTeam.set(memberId, team._id);
    }
  }

  const leads = await CrmLead.find({
    $or: [{ teamId: { $exists: false } }, { teamId: null }],
  })
    .select("_id ownerUserId")
    .lean();

  let updated = 0;
  for (const lead of leads) {
    const ownerId = String(lead?.ownerUserId || "");
    const mappedTeamId = ownerToTeam.get(ownerId);
    if (!mappedTeamId) continue;
    await CrmLead.updateOne({ _id: lead._id }, { $set: { teamId: mappedTeamId } });
    updated += 1;
  }

  console.log(`Backfill complete. Updated ${updated} leads out of ${leads.length} unassigned-team leads.`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Backfill failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
