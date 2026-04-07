/**
 * Parse CSV / Excel buffers and fetch Google Sheets as CSV.
 * Column auto-mapping: name, email, phone, address (+ common aliases).
 */

import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

export const MAX_IMPORT_ROWS = 12000;

/** Normalize header cell for alias lookup */
function normalizeHeaderKey(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_-]+/g, " ");
}

/** Map normalized header → canonical field */
const HEADER_TO_FIELD = new Map([
  ["full name", "name"],
  ["customer name", "name"],
  ["client name", "name"],
  ["fullname", "name"],
  ["e mail", "email"],
  ["email address", "email"],
  ["mail", "email"],
  ["mobile", "phone"],
  ["contact", "phone"],
  ["contact number", "phone"],
  ["telephone", "phone"],
  ["tel", "phone"],
  ["phone number", "phone"],
  ["addr", "address"],
  ["location", "address"],
]);

function resolveFieldFromHeader(headerCell) {
  const key = normalizeHeaderKey(headerCell);
  if (!key) return null;
  if (["name", "email", "phone", "address"].includes(key)) return key;
  return HEADER_TO_FIELD.get(key) || null;
}

/**
 * Build column indices for name, email from first row (header).
 * @returns {{ map: Record<string, number>, missing: string[] }}
 */
export function buildColumnMap(headerRow) {
  const map = {};
  headerRow.forEach((cell, idx) => {
    const field = resolveFieldFromHeader(cell);
    if (field && map[field] === undefined) {
      map[field] = idx;
    }
  });
  const missing = [];
  // Only `name` is required as a column; email / phone / address are optional (including omitted columns).
  if (map.name === undefined) missing.push("name");
  return { map, missing };
}

function rowArraysToObjects(headerRow, dataRows, startLineOffset = 1) {
  const { map, missing } = buildColumnMap(headerRow);
  if (missing.length) {
    const err = new Error(
      `Missing required column(s): ${missing.join(", ")}. At minimum include a name column (e.g. name, full name). Optional: email, phone, address.`
    );
    err.status = 400;
    throw err;
  }

  const rows = [];
  for (let i = 0; i < dataRows.length; i++) {
    const lineNumber = startLineOffset + i + 2;
    const arr = dataRows[i];
    const name = map.name != null ? String(arr[map.name] ?? "").trim() : "";
    const email = map.email != null ? String(arr[map.email] ?? "").trim() : "";
    const phone = map.phone != null ? String(arr[map.phone] ?? "").trim() : "";
    const address = map.address != null ? String(arr[map.address] ?? "").trim() : "";
    if (!name && !email && !phone && !address) continue;
    rows.push({ lineNumber, name, email, phone, address });
  }
  return rows;
}

/**
 * Parse CSV buffer → [{ lineNumber, name, email, phone, address }]
 */
export function parseCsvBuffer(buffer) {
  let records;
  try {
    records = parse(buffer, {
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });
  } catch (e) {
    const err = new Error(`Invalid CSV: ${e.message}`);
    err.status = 400;
    throw err;
  }
  if (!records.length) {
    const err = new Error("CSV file is empty");
    err.status = 400;
    throw err;
  }
  if (records.length > MAX_IMPORT_ROWS + 1) {
    const err = new Error(`Too many rows (max ${MAX_IMPORT_ROWS} data rows)`);
    err.status = 400;
    throw err;
  }
  const headerRow = records[0].map((c) => String(c ?? ""));
  const dataRows = records.slice(1);
  return rowArraysToObjects(headerRow, dataRows, 0);
}

/**
 * First sheet only.
 */
export function parseXlsxBuffer(buffer) {
  let wb;
  try {
    wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  } catch (e) {
    const err = new Error(`Invalid Excel file: ${e.message}`);
    err.status = 400;
    throw err;
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    const err = new Error("Excel workbook has no sheets");
    err.status = 400;
    throw err;
  }
  const sheet = wb.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!records.length) {
    const err = new Error("Excel sheet is empty");
    err.status = 400;
    throw err;
  }
  if (records.length > MAX_IMPORT_ROWS + 1) {
    const err = new Error(`Too many rows (max ${MAX_IMPORT_ROWS} data rows)`);
    err.status = 400;
    throw err;
  }
  const headerRow = records[0].map((c) => String(c ?? ""));
  const dataRows = records.slice(1).map((r) => (Array.isArray(r) ? r : []));
  return rowArraysToObjects(headerRow, dataRows, 0);
}

/** Extract spreadsheet ID and optional gid from a Google Sheets URL */
export function parseGoogleSheetUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return { error: "Sheet URL is required" };
  }
  const trimmed = urlString.trim();
  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) {
    return { error: "Invalid Google Sheets URL (could not find spreadsheet id)" };
  }
  const sheetId = idMatch[1];
  let gid = null;
  const gidQ = trimmed.match(/[?&#]gid=(\d+)/);
  if (gidQ) gid = gidQ[1];
  return { sheetId, gid };
}

/**
 * Fetch public sheet as CSV (same approach as published export).
 */
export async function fetchGoogleSheetCsvBuffer(sheetUrl) {
  const parsed = parseGoogleSheetUrl(sheetUrl);
  if (parsed.error) {
    const err = new Error(parsed.error);
    err.status = 400;
    throw err;
  }
  const { sheetId, gid } = parsed;
  let exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  if (gid != null) exportUrl += `&gid=${gid}`;

  const res = await fetch(exportUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "CustomerImport/1.0",
    },
  });
  if (!res.ok) {
    const err = new Error(
      `Could not fetch Google Sheet (HTTP ${res.status}). Ensure the sheet is shared as "Anyone with the link can view".`
    );
    err.status = 400;
    throw err;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    const err = new Error("Google Sheet export returned empty content");
    err.status = 400;
    throw err;
  }
  // Google often returns HTTP 200 with an HTML login/walled page when the sheet is not public.
  const head = buf
    .slice(0, Math.min(800, buf.length))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (head.startsWith("<") && /<!DOCTYPE|<html|<meta/i.test(head)) {
    const err = new Error(
      "Google returned a web page instead of CSV. Open Share → set access to “Anyone with the link” as Viewer, then try again."
    );
    err.status = 400;
    throw err;
  }
  return buf;
}
