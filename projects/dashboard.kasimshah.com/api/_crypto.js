const crypto = require('crypto');

function getEncryptionKey() {
  const encoded = process.env.INTEGRATION_ENCRYPTION_KEY || '';
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    const error = new Error('Integration encryption is not configured');
    error.code = 'ENCRYPTION_NOT_CONFIGURED';
    throw error;
  }
  return key;
}

function encryptCredentials(credentials) {
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    throw new TypeError('Credentials must be an object');
  }
  const serialized = JSON.stringify(credentials);
  if (Buffer.byteLength(serialized) > 16384) throw new RangeError('Credentials exceed 16KB');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    keyVersion: 1,
  };
}

function decryptCredentials(record) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag || record.auth_tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  return JSON.parse(plaintext);
}

module.exports = { encryptCredentials, decryptCredentials };
