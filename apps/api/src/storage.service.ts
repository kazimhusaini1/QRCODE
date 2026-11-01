import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const mimeExtensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

@Injectable()
export class StorageService {
  createProductUpload(merchantId: string, contentType: string, sizeBytes: number) {
    const extension = mimeExtensions[contentType];
    if (!extension) throw new BadRequestException('Only JPEG, PNG and WebP product images are supported');
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > 8 * 1024 * 1024) throw new BadRequestException('Product images must be 8 MB or smaller');
    const endpointValue = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION ?? 'auto';
    const accessKey = process.env.S3_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_ACCESS_KEY;
    const publicBase = process.env.S3_PUBLIC_BASE_URL;
    if (!endpointValue || !bucket || !accessKey || !secretKey || !publicBase) throw new ServiceUnavailableException('Product image storage is not configured');
    let endpoint: URL;
    try { endpoint = new URL(endpointValue); } catch { throw new ServiceUnavailableException('Product image storage is not configured correctly'); }
    if (process.env.NODE_ENV === 'production' && endpoint.protocol !== 'https:') throw new ServiceUnavailableException('Product image storage must use HTTPS');

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const date = amzDate.slice(0, 8);
    const key = `merchants/${merchantId}/products/${randomBytes(18).toString('hex')}.${extension}`;
    const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    const path = `${endpoint.pathname.replace(/\/$/, '')}/${encode(bucket)}/${key.split('/').map(encode).join('/')}`;
    const scope = `${date}/${region}/s3/aws4_request`;
    const credential = `${accessKey}/${scope}`;
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': '300',
      'X-Amz-SignedHeaders': 'content-type;host',
    };
    const canonicalQuery = Object.entries(query).sort(([a], [b]) => a.localeCompare(b)).map(([name, value]) => `${encode(name)}=${encode(value)}`).join('&');
    const canonicalHeaders = `content-type:${contentType}\nhost:${endpoint.host}\n`;
    const canonicalRequest = `PUT\n${path}\n${canonicalQuery}\n${canonicalHeaders}\ncontent-type;host\nUNSIGNED-PAYLOAD`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const dateKey = createHmac('sha256', `AWS4${secretKey}`).update(date).digest();
    const regionKey = createHmac('sha256', dateKey).update(region).digest();
    const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
    const signingKey = createHmac('sha256', serviceKey).update('aws4_request').digest();
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const uploadUrl = `${endpoint.origin}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
    const publicUrl = `${publicBase.replace(/\/$/, '')}/${key.split('/').map(encode).join('/')}`;
    return { uploadUrl, publicUrl, method: 'PUT', headers: { 'content-type': contentType }, expiresInSeconds: 300, maxBytes: 8 * 1024 * 1024 };
  }

  async verifyProductUpload(merchantId: string, publicUrl: string) {
    const publicBase = process.env.S3_PUBLIC_BASE_URL;
    const endpointValue = process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION ?? 'auto';
    const accessKey = process.env.S3_ACCESS_KEY_ID;
    const secretKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!publicBase || !endpointValue || !bucket || !accessKey || !secretKey) throw new ServiceUnavailableException('Product image storage is not configured');
    let asset: URL; let publicOrigin: URL; let endpoint: URL;
    try { asset = new URL(publicUrl); publicOrigin = new URL(publicBase); endpoint = new URL(endpointValue); }
    catch { throw new BadRequestException('Product image URL is invalid'); }
    if (asset.origin !== publicOrigin.origin || !asset.pathname.startsWith(`${publicOrigin.pathname.replace(/\/$/, '')}/merchants/${merchantId}/products/`)) throw new BadRequestException('Product image must be uploaded to this merchant’s storage area');
    const keyPath = asset.pathname.slice(publicOrigin.pathname.replace(/\/$/, '').length + 1);
    const keyParts = keyPath.split('/');
    if (keyParts.length !== 4 || keyParts[0] !== 'merchants' || keyParts[1] !== merchantId || keyParts[2] !== 'products' || !/^[a-f0-9]{36}\.(jpg|png|webp)$/.test(keyParts[3])) throw new BadRequestException('Product image key is invalid');
    const key = keyParts.join('/');
    const url = new URL(endpoint.origin);
    url.pathname = `${endpoint.pathname.replace(/\/$/, '')}/${encodeURIComponent(bucket)}/${key.split('/').map(part => encodeURIComponent(part)).join('/')}`;
    const now = new Date(); const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); const date = amzDate.slice(0, 8);
    const scope = `${date}/${region}/s3/aws4_request`;
    const sign = (method: string) => {
      const query: Record<string, string> = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKey}/${scope}`, 'X-Amz-Date': amzDate, 'X-Amz-Expires': '30', 'X-Amz-SignedHeaders': 'host' };
      const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      const canonicalQuery = Object.entries(query).sort(([a],[b])=>a.localeCompare(b)).map(([name,value])=>`${encode(name)}=${encode(value)}`).join('&');
      const canonicalRequest = `${method}\n${url.pathname}\n${canonicalQuery}\nhost:${url.host}\n\nhost\nUNSIGNED-PAYLOAD`;
      const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
      const dateKey = createHmac('sha256', `AWS4${secretKey}`).update(date).digest(); const regionKey = createHmac('sha256', dateKey).update(region).digest(); const serviceKey = createHmac('sha256', regionKey).update('s3').digest(); const signingKey = createHmac('sha256', serviceKey).update('aws4_request').digest();
      return `${url.origin}${url.pathname}?${canonicalQuery}&X-Amz-Signature=${createHmac('sha256', signingKey).update(stringToSign).digest('hex')}`;
    };
    const response = await fetch(sign('HEAD'), { method: 'HEAD', signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!response?.ok) throw new BadRequestException('Uploaded product image could not be verified');
    const size = Number(response.headers.get('content-length'));
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (!Number.isSafeInteger(size) || size < 1 || size > 8 * 1024 * 1024 || !mimeExtensions[type ?? '']) throw new BadRequestException('Uploaded product image must be JPEG, PNG or WebP and 8 MB or smaller');
    return true;
  }
}
