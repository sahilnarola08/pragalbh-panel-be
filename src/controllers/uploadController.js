import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { deleteImageFile } from "../middlewares/upload.js";

const buildAbsoluteUrl = (relativePath) => {
  if (!relativePath) return null;
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  const baseUrl = process.env.BASE_URL || "";
  const sanitizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return sanitizedBase ? `${sanitizedBase}${relativePath}` : relativePath;
};

export const uploadProductImages = async (req, res) => {
  try {
    const processed = req.processedImages || [];

    if (!processed.length) {
      return sendErrorResponse({
        res,
        message: "No files uploaded. Please upload between 1 and 5 images.",
        status: 400,
      });
    }

    const images = processed.map((image) => ({
      filename: image.filename,
      originalName: image.originalname,
      url: buildAbsoluteUrl(image.imageUrl),
      relativePath: image.imageUrl,
      mimetype: image.mimetype,
      size: image.size,
    }));

    return sendSuccessResponse({
      res,
      data: { images },
      message: "Images uploaded successfully!",
      status: 200,
    });
  } catch (error) {
    console.error("Error uploading images:", error);

    if (req.processedImages?.length) {
      req.processedImages.forEach((image) => deleteImageFile(image.filename));
    }

    return sendErrorResponse({
      res,
      message: "Failed to upload images",
      status: 500,
      error: error.message || error,
    });
  }
};

export const deleteUploadedImage = async (req, res) => {
  try {
    const { imageUrl } = req.body;

    if (!imageUrl) {
      return sendErrorResponse({
        res,
        message: "Image URL is required",
        status: 400,
      });
    }

    deleteImageFile(imageUrl);

    return sendSuccessResponse({
      res,
      data: { deletedUrl: imageUrl },
      message: "Image deleted successfully",
      status: 200,
    });
  } catch (error) {
    console.error("Error deleting image:", error);
    return sendErrorResponse({
      res,
      message: "Failed to delete image",
      status: 500,
      error: error.message || error,
    });
  }
};

