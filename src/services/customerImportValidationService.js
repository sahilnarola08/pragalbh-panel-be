/**
 * Normalization and validation for customer import rows (name, email, phone, address).
 * Maps single "name" field to User model firstName + lastName.
 */

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

/** Optional phone: empty OK; if set, at least 5 digits (aligned with user registration rules). */
const PHONE_RE = /^[0-9]{5,20}$/;

/**
 * Split display name into firstName / lastName for User schema.
 * Single-word names use the same token for both (display: "John John"); acceptable for imports.
 */
export function nameToFirstLast(fullName) {
  const t = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!t) return null;
  const space = t.indexOf(" ");
  if (space === -1) {
    return { firstName: t, lastName: t };
  }
  const firstName = t.slice(0, space).trim();
  const lastName = t.slice(space + 1).trim() || firstName;
  return { firstName, lastName };
}

export function normalizeRow(raw) {
  const name = String(raw.name ?? "").trim();
  const email = String(raw.email ?? "").trim().toLowerCase();
  const phone = String(raw.phone ?? "").trim();
  const address = String(raw.address ?? "").trim();
  return { name, email, phone, address };
}

/** When empty, email is optional for import. When set, must be valid. */
export function validateEmailFormat(email) {
  if (!email) return null;
  if (email.length > 100) return "Email must not exceed 100 characters";
  if (!EMAIL_RE.test(email)) return "Invalid email format";
  return null;
}

export function validateName(name) {
  if (!name) return "Name is required";
  if (name.length > 150) return "Name is too long";
  return null;
}

export function validatePhone(phone) {
  if (!phone) return null;
  if (!PHONE_RE.test(phone.replace(/\s/g, ""))) {
    return "Phone must contain 5–20 digits only";
  }
  return null;
}

export function validateAddress(address) {
  if (!address) return null;
  if (address.length > 500) return "Address is too long";
  return null;
}

/**
 * Returns { error: string } or { doc: { firstName, lastName, email, contactNumber?, address? } }
 */
export function rowToUserDoc(normalized) {
  const { name, email, phone, address } = normalized;
  const nameErr = validateName(name);
  if (nameErr) return { error: nameErr };
  const emailErr = validateEmailFormat(email);
  if (emailErr) return { error: emailErr };
  const phoneErr = validatePhone(phone);
  if (phoneErr) return { error: phoneErr };
  const addrErr = validateAddress(address);
  if (addrErr) return { error: addrErr };

  const parts = nameToFirstLast(name);
  if (!parts) return { error: "Name is required" };

  const contactNumber = phone.replace(/\s/g, "") || undefined;

  const doc = {
    firstName: parts.firstName,
    lastName: parts.lastName,
    ...(email ? { email } : {}),
    ...(contactNumber ? { contactNumber } : {}),
    ...(address ? { address } : {}),
    isDeleted: false,
  };
  return { doc };
}
