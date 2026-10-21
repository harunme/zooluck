function integer(name, fallback, minimum = 1) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid configuration: ${name}`);
  return value;
}

export const config = {
  writeQueue: integer('WRITE_QUEUE_LIMIT', 128),
  writeWait: integer('WRITE_QUEUE_WAIT_MS', 2000),
  readQueue: integer('READ_QUEUE_LIMIT', 128),
  readWait: integer('READ_QUEUE_WAIT_MS', 1000),
  sqliteWait: integer('SQLITE_BUSY_MS', 50),
  memberTimeout: integer('MEMBER_TIMEOUT_MS', 5000),
  memberConcurrency: integer('MEMBER_CONCURRENCY', 64),
  memberBytes: integer('MEMBER_RESPONSE_BYTES', 65536),
  memberRate: integer('MEMBER_PAIR_PER_MINUTE', 10),
  imageBytes: integer('IMAGE_CACHE_BYTES', 32 * 1024 * 1024),
  imageEntries: integer('IMAGE_CACHE_ENTRIES', 64),
  yearsTtl: integer('YEARS_CACHE_MS', 5000),
  passwordQueue: integer('PASSWORD_QUEUE_LIMIT', 20),
  passwordWait: integer('PASSWORD_QUEUE_WAIT_MS', 2000),
  gameRate: integer('GAME_IP_PER_MINUTE', 300),
  gameBurst: integer('GAME_IP_BURST', 100),
  loginRate: integer('LOGIN_IP_PER_MINUTE', 20),
  loginBurst: integer('LOGIN_IP_BURST', 10),
  adminRate: integer('ADMIN_WRITE_PER_MINUTE', 10),
  adminBurst: integer('ADMIN_WRITE_BURST', 5),
  bodyBytes: integer('BODY_LIMIT_BYTES', 16 * 1024),
  uploadBytes: integer('UPLOAD_BODY_LIMIT_BYTES', 8 * 1024 * 1024),
};
