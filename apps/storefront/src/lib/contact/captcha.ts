import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const DIGITS_ONLY = /^\d+$/;

function getCaptchaSecret() {
  return process.env.PAYLOAD_SECRET || "dev-payload-secret-change-me";
}

function signPayload(payload: string) {
  return createHmac("sha256", getCaptchaSecret()).update(payload).digest("base64url");
}

function buildOperands() {
  const a = randomInt(2, 12);
  const b = randomInt(2, 12);
  return { a, b, answer: a + b };
}

export function createContactCaptchaChallenge() {
  const { a, b, answer } = buildOperands();
  const issuedAt = Date.now();
  const payload = JSON.stringify({ a, b, answer, issuedAt });
  const payloadEncoded = Buffer.from(payload).toString("base64url");
  const signature = signPayload(payloadEncoded);
  const token = `${payloadEncoded}.${signature}`;

  return {
    token,
    question: `${a} + ${b} = ?`,
  };
}

export function verifyContactCaptchaAnswer(token: string, answer: string) {
  const trimmed = answer.trim();
  if (!DIGITS_ONLY.test(trimmed)) {
    return false;
  }

  const [payloadEncoded, signature] = token.split(".");
  if (!(payloadEncoded && signature)) {
    return false;
  }

  const expectedSignature = signPayload(payloadEncoded);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length) {
    return false;
  }

  if (!timingSafeEqual(provided, expected)) {
    return false;
  }

  let parsed: { answer?: number; issuedAt?: number };
  try {
    parsed = JSON.parse(Buffer.from(payloadEncoded, "base64url").toString("utf8")) as {
      answer?: number;
      issuedAt?: number;
    };
  } catch {
    return false;
  }

  if (
    typeof parsed.answer !== "number" ||
    typeof parsed.issuedAt !== "number" ||
    Date.now() - parsed.issuedAt > TOKEN_TTL_MS
  ) {
    return false;
  }

  return parsed.answer === Number(trimmed);
}
