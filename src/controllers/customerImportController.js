import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import {
  parseCsvBuffer,
  parseXlsxBuffer,
  fetchGoogleSheetCsvBuffer,
} from "../services/customerImportFileParserService.js";
import { runCustomerImport } from "../services/customerImportService.js";

function readDryRun(req) {
  const v = req.body?.dryRun;
  return v === true || v === "true" || v === "1";
}

const importCsv = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "CSV file is required (field name: file)",
      });
    }
    const rows = parseCsvBuffer(req.file.buffer);
    const data = await runCustomerImport(rows, { dryRun: readDryRun(req) });
    return sendSuccessResponse({
      res,
      data,
      message: data.dryRun ? "Import preview generated" : "Customers imported successfully",
      status: 200,
    });
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return sendErrorResponse({ status: e.status, res, message: e.message });
    }
    next(e);
  }
};

const importExcel = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return sendErrorResponse({
        status: 400,
        res,
        message: "Excel file is required (field name: file)",
      });
    }
    const rows = parseXlsxBuffer(req.file.buffer);
    const data = await runCustomerImport(rows, { dryRun: readDryRun(req) });
    return sendSuccessResponse({
      res,
      data,
      message: data.dryRun ? "Import preview generated" : "Customers imported successfully",
      status: 200,
    });
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return sendErrorResponse({ status: e.status, res, message: e.message });
    }
    next(e);
  }
};

const importGoogleSheet = async (req, res, next) => {
  try {
    const sheetUrl = req.body?.sheetUrl || req.body?.url;
    if (!sheetUrl || typeof sheetUrl !== "string") {
      return sendErrorResponse({
        status: 400,
        res,
        message: "sheetUrl is required",
      });
    }
    const buf = await fetchGoogleSheetCsvBuffer(sheetUrl.trim());
    const rows = parseCsvBuffer(buf);
    const data = await runCustomerImport(rows, { dryRun: readDryRun(req) });
    return sendSuccessResponse({
      res,
      data,
      message: data.dryRun ? "Import preview generated" : "Customers imported successfully",
      status: 200,
    });
  } catch (e) {
    if (e.status >= 400 && e.status < 500) {
      return sendErrorResponse({ status: e.status, res, message: e.message });
    }
    next(e);
  }
};

export default {
  importCsv,
  importExcel,
  importGoogleSheet,
};
