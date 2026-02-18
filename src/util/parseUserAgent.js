export function parseUserAgent(ua) {
  if (!ua || typeof ua !== "string") return { browser: "Unknown", deviceType: "Unknown", deviceName: "" };
  let browser = "Unknown";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/MSIE|Trident/.test(ua)) browser = "IE";
  let deviceType = "Desktop";
  if (/Mobile|Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) deviceType = "Mobile";
  else if (/Tablet|iPad/i.test(ua)) deviceType = "Tablet";
  const deviceName = deviceType === "Mobile" ? (ua.match(/Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i) || [])[0] || "Mobile" : (ua.match(/Windows|Mac OS|Linux/i) || [])[0] || "Desktop";
  return { browser, deviceType, deviceName };
}
