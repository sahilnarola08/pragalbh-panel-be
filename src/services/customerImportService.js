/**
 * Orchestrates validation, deduplication, DB checks, and bulk insert for customer imports.
 */

import User from "../models/user.js";
import { normalizeRow, rowToUserDoc } from "./customerImportValidationService.js";
import { invalidateCache } from "../util/cacheHelper.js";

function buildResponseShape({
  dryRun,
  totalDataRows,
  inserted,
  pendingInsertCount,
  skippedEmpty,
  errors,
  previewRows,
  skippedFileDuplicateEmail,
  skippedExistingEmail,
  skippedExistingPhone,
  skippedInvalid,
}) {
  return {
    dryRun: !!dryRun,
    summary: {
      totalDataRows,
      inserted,
      ...(dryRun && pendingInsertCount != null ? { pendingInsert: pendingInsertCount } : {}),
      skippedEmpty,
      skippedFileDuplicateEmail,
      skippedExistingEmail,
      skippedExistingPhone,
      skippedInvalid,
      errorCount: errors.length,
    },
    errors,
    preview: previewRows,
  };
}

/**
 * @param {Array<{ lineNumber: number, name: string, email: string, phone: string, address: string }>} rawRows
 * @param {{ dryRun?: boolean }} options
 */
export async function runCustomerImport(rawRows, options = {}) {
  const dryRun = !!options.dryRun;
  const errors = [];
  const seenEmails = new Set();
  const seenPhones = new Set();
  const validDocs = [];
  const previewRows = [];

  let skippedEmpty = 0;
  let skippedFileDuplicateEmail = 0;
  let skippedInvalid = 0;

  for (const raw of rawRows) {
    const normalized = normalizeRow(raw);

    if (!normalized.name && !normalized.email && !normalized.phone && !normalized.address) {
      skippedEmpty++;
      continue;
    }

    const result = rowToUserDoc(normalized);
    if (result.error) {
      skippedInvalid++;
      errors.push({
        rowNumber: raw.lineNumber,
        reason: result.error,
        name: normalized.name,
        email: normalized.email,
      });
      continue;
    }

    const emailLower = normalized.email.toLowerCase();
    if (emailLower && seenEmails.has(emailLower)) {
      skippedFileDuplicateEmail++;
      errors.push({
        rowNumber: raw.lineNumber,
        reason: "Duplicate email within file",
        email: normalized.email,
        name: normalized.name,
      });
      continue;
    }
    if (emailLower) seenEmails.add(emailLower);

    const phoneDigits = normalized.phone.replace(/\s/g, "");
    if (phoneDigits) {
      if (seenPhones.has(phoneDigits)) {
        skippedInvalid++;
        errors.push({
          rowNumber: raw.lineNumber,
          reason: "Duplicate phone within file",
          phone: normalized.phone,
          name: normalized.name,
        });
        continue;
      }
      seenPhones.add(phoneDigits);
    }

    validDocs.push({ ...result.doc, _lineNumber: raw.lineNumber });
    if (previewRows.length < 10) {
      previewRows.push({
        name: normalized.name,
        email: normalized.email,
        phone: normalized.phone || "",
        address: normalized.address || "",
      });
    }
  }

  const emailsToCheck = [
    ...new Set(
      validDocs.map((d) => (d.email ? String(d.email).toLowerCase() : null)).filter(Boolean)
    ),
  ];
  const phonesToCheck = [
    ...new Set(validDocs.map((d) => d.contactNumber).filter(Boolean)),
  ];

  let existingEmailSet = new Set();
  let existingPhoneSet = new Set();

  if (emailsToCheck.length) {
    const existingByEmail = await User.find({
      isDeleted: false,
      $expr: { $in: [{ $toLower: "$email" }, emailsToCheck] },
    })
      .select("email")
      .lean();
    existingEmailSet = new Set(
      existingByEmail.map((u) => (u.email || "").toLowerCase()).filter(Boolean)
    );
  }

  if (phonesToCheck.length) {
    const existingByPhone = await User.find({
      isDeleted: false,
      contactNumber: { $in: phonesToCheck },
    })
      .select("contactNumber")
      .lean();
    existingPhoneSet = new Set(
      existingByPhone.map((u) => u.contactNumber).filter(Boolean)
    );
  }

  const docsToInsert = [];
  let skippedExistingEmail = 0;
  let skippedExistingPhone = 0;

  for (const d of validDocs) {
    const el = d.email ? String(d.email).toLowerCase() : "";
    if (el && existingEmailSet.has(el)) {
      skippedExistingEmail++;
      errors.push({
        rowNumber: d._lineNumber,
        reason: "Email already exists in database",
        email: d.email,
        name: `${d.firstName} ${d.lastName}`.trim(),
      });
      continue;
    }
    if (d.contactNumber && existingPhoneSet.has(d.contactNumber)) {
      skippedExistingPhone++;
      errors.push({
        rowNumber: d._lineNumber,
        reason: "Phone already exists in database",
        contactNumber: d.contactNumber,
        name: `${d.firstName} ${d.lastName}`.trim(),
      });
      continue;
    }
    const { _lineNumber, ...doc } = d;
    docsToInsert.push(doc);
  }

  let inserted = 0;

  // Plain insertMany (no transaction): multi-document transactions require a replica set and
  // fail with 500 on typical local/standalone MongoDB setups.
  if (!dryRun && docsToInsert.length > 0) {
    try {
      const created = await User.insertMany(docsToInsert, { ordered: true });
      inserted = created.length;
    } catch (e) {
      if (e && e.code === 11000) {
        const dup = new Error(
          "Duplicate email or phone: one or more rows match existing customers (or the database index still needs updating—restart the API after deploy)."
        );
        dup.status = 400;
        throw dup;
      }
      throw e;
    }
    invalidateCache("user");
    invalidateCache("dashboard");
  } else if (dryRun) {
    inserted = docsToInsert.length;
  }

  const totalDataRows = rawRows.length;

  return buildResponseShape({
    dryRun,
    totalDataRows,
    inserted: dryRun ? 0 : inserted,
    pendingInsertCount: docsToInsert.length,
    skippedEmpty,
    errors,
    previewRows,
    skippedFileDuplicateEmail,
    skippedExistingEmail,
    skippedExistingPhone,
    skippedInvalid,
  });
}
