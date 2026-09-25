import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const driver = String(process.env.STORAGE_DRIVER || 'local').toLowerCase();
const bucket = process.env.S3_BUCKET || '';
const prefix = String(process.env.S3_PREFIX || 'documents').replace(/^\/+|\/+$/g, '');
const localDir = process.env.LOCAL_UPLOAD_DIR || '';

let client = null;
if (driver === 's3') {
  const endpoint = process.env.S3_ENDPOINT || undefined;
  const region = process.env.S3_REGION || 'eu-central-1';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY');
  }
  client = new S3Client({
    endpoint,
    region,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey }
  });
} else if (driver !== 'local') {
  throw new Error('Unsupported STORAGE_DRIVER. Use local or s3.');
}

function objectKey(storedName) {
  const safe = path.basename(String(storedName || ''));
  if (!safe) throw new Error('Invalid stored file name');
  return prefix ? `${prefix}/${safe}` : safe;
}

export function storageDriver() {
  return driver;
}

export async function persistUpload(tempPath, storedName, mimeType) {
  if (driver === 'local') return;
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey(storedName),
      Body: fs.createReadStream(tempPath),
      ContentType: mimeType || 'application/octet-stream',
      ServerSideEncryption: process.env.S3_SERVER_SIDE_ENCRYPTION || undefined
    }));
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
}

export async function removeStored(storedName, uploadDir = localDir) {
  if (driver === 'local') {
    const target = path.resolve(uploadDir, path.basename(String(storedName || '')));
    if (target.startsWith(path.resolve(uploadDir) + path.sep)) fs.rmSync(target, { force: true });
    return;
  }
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(storedName) }));
}

export async function streamStored(storedName, res, uploadDir = localDir) {
  if (driver === 'local') {
    const target = path.resolve(uploadDir, path.basename(String(storedName || '')));
    if (!target.startsWith(path.resolve(uploadDir) + path.sep) || !fs.existsSync(target)) return false;
    fs.createReadStream(target).pipe(res);
    return true;
  }
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(storedName) }));
    if (out.ContentType) res.type(out.ContentType);
    if (out.ContentLength != null) res.setHeader('Content-Length', String(out.ContentLength));
    out.Body.pipe(res);
    return true;
  } catch (error) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}
