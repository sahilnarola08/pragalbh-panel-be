import { sendSuccessResponse, sendErrorResponse } from "../util/commonResponses.js";
import { deleteImageFile } from "../middlewares/upload.js";

const buildAbsoluteUrl = (relativePath, req = null) => {
  if (!relativePath) return null;
  
  // If already an absolute URL, return as is
  if (relativePath.startsWith("http://") || relativePath.startsWith("https://")) {
    return relativePath;
  }
  
  // Try to get base URL from request headers first (dynamic detection)
  let baseUrl = "";
  
  if (req) {
    // Get protocol - prioritize x-forwarded-proto for reverse proxies (nginx, load balancers)
    let protocol = 'http';
    
    // Check x-forwarded-proto header (most reliable for proxies)
    const forwardedProto = req.get('x-forwarded-proto');
    if (forwardedProto) {
      // Handle comma-separated values (e.g., "https, http")
      protocol = forwardedProto.split(',')[0].trim().toLowerCase();
    } 
    // Check if request is secure (works when not behind proxy)
    else if (req.secure || req.protocol === 'https') {
      protocol = 'https';
    }
    
    // Normalize protocol
    protocol = (protocol === 'https') ? 'https' : 'http';
    
    // Get host from request headers (priority: x-forwarded-host > host header > headers.host)
    let host = '';
    
    // x-forwarded-host is set by reverse proxies
    const forwardedHost = req.get('x-forwarded-host');
    if (forwardedHost) {
      // Handle comma-separated values and take the first one
      host = forwardedHost.split(',')[0].trim();
    } 
    // Use Express host header (includes port if present)
    else if (req.get('host')) {
      host = req.get('host');
    } 
    // Fallback to raw headers
    else if (req.headers && req.headers.host) {
      host = req.headers.host;
    }
    
    // Build base URL if host is available
    if (host) {
      baseUrl = `${protocol}://${host}`;
    }
  }
  
  // Fallback to environment variable if request-based detection fails
  // This handles cases where req is not available (background jobs, etc.)
  if (!baseUrl) {
    baseUrl = process.env.BASE_URL || "";
  }
  
  // Remove trailing slash if present
  const sanitizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  
  // Build final URL
  if (!sanitizedBase) {
    // If no base URL found, return relative path
    return relativePath;
  }
  
  // Ensure relativePath starts with / if it doesn't already
  const normalizedPath = relativePath.startsWith("/") ? relativePath : `/${relativePath}`;
  
  return `${sanitizedBase}${normalizedPath}`;
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
      url: buildAbsoluteUrl(image.imageUrl, req),
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

