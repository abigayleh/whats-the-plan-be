import fsp from 'fs/promises';
import path from 'path';
import storage from '../src/lib/storage.js';

const { saveFile, readFile, deleteFile, isRemote } = storage;
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');
const REMOTE_ENV = {
  SUPABASE_URL: 'https://proj.supabase.co/',
  SUPABASE_SERVICE_KEY: 'service-key',
  SUPABASE_STORAGE_BUCKET: 'attachments',
};

const OWNER = { userId: 'u1', entityType: 'task', entityId: 't1', storedName: 'file.png' };
const KEY = path.join('u1', 'task', 't1', 'file.png');

// Spy on the real fs module (the same singleton the module requires) so no disk I/O happens.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const k of Object.keys(REMOTE_ENV)) delete process.env[k];
});

const useRemote = () => Object.assign(process.env, REMOTE_ENV);
const mockFetch = (response) => {
  const spy = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', spy);
  return spy;
};
const ok = (body = new ArrayBuffer(0)) => ({
  ok: true, status: 200, arrayBuffer: async () => body, text: async () => '',
});
const bad = (status) => ({ ok: false, status, text: async () => 'nope', arrayBuffer: async () => new ArrayBuffer(0) });

describe('without Supabase configured', () => {
  it('reports itself as local', () => {
    expect(isRemote()).toBe(false);
  });

  it('writes under uploads/<userId>/<entityType>/<entityId>/ and returns a relative path', async () => {
    vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);
    const buf = Buffer.from('hello');

    expect(await saveFile(buf, OWNER)).toBe(KEY);
    expect(fsp.mkdir).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, 'u1', 'task', 't1'), { recursive: true });
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, KEY), buf);
  });

  it('reads from uploads/<storedPath>', async () => {
    vi.spyOn(fsp, 'readFile').mockResolvedValue(Buffer.from('bytes'));

    expect(await readFile(KEY)).toEqual(Buffer.from('bytes'));
    expect(fsp.readFile).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, KEY));
  });

  it('removes uploads/<storedPath> with force', async () => {
    vi.spyOn(fsp, 'rm').mockResolvedValue(undefined);

    await deleteFile(KEY);
    expect(fsp.rm).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, KEY), { force: true });
  });
});

describe('with Supabase configured', () => {
  it('reports itself as remote', () => {
    useRemote();
    expect(isRemote()).toBe(true);
  });

  it('uploads to the bucket under the same key, and never touches the disk', async () => {
    useRemote();
    vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);
    const fetchSpy = mockFetch(ok());

    expect(await saveFile(Buffer.from('hi'), { ...OWNER, contentType: 'image/png' })).toBe(KEY);
    expect(fsp.writeFile).not.toHaveBeenCalled();

    const [url, init] = fetchSpy.mock.calls[0];
    // The trailing slash on SUPABASE_URL must not produce a double slash in the key.
    expect(url).toBe('https://proj.supabase.co/storage/v1/object/attachments/u1/task/t1/file.png');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer service-key');
    expect(init.headers.apikey).toBe('service-key');
    expect(init.headers['Content-Type']).toBe('image/png');
  });

  it('falls back to a generic content type when none is given', async () => {
    useRemote();
    const fetchSpy = mockFetch(ok());

    await saveFile(Buffer.from('hi'), OWNER);
    expect(fetchSpy.mock.calls[0][1].headers['Content-Type']).toBe('application/octet-stream');
  });

  it('downloads the object as a buffer', async () => {
    useRemote();
    const bytes = new TextEncoder().encode('remote bytes');
    mockFetch(ok(bytes.buffer));

    expect(await readFile(KEY)).toEqual(Buffer.from('remote bytes'));
  });

  it('rejects a missing object so the route can 404', async () => {
    useRemote();
    mockFetch(bad(404));

    await expect(readFile(KEY)).rejects.toThrow(/download failed \(404\)/);
  });

  it('surfaces a failed upload rather than returning a key to nothing', async () => {
    useRemote();
    mockFetch(bad(500));

    await expect(saveFile(Buffer.from('hi'), OWNER)).rejects.toThrow(/upload failed \(500\)/);
  });

  it('treats deleting a missing object as success, matching rm --force', async () => {
    useRemote();
    mockFetch(bad(404));

    await expect(deleteFile(KEY)).resolves.toBeUndefined();
  });

  it('surfaces any other delete failure', async () => {
    useRemote();
    mockFetch(bad(403));

    await expect(deleteFile(KEY)).rejects.toThrow(/delete failed \(403\)/);
  });
});

describe('error status', () => {
  it('carries the HTTP status so the route can tell missing from broken', async () => {
    useRemote();
    mockFetch(bad(503));

    await expect(readFile(KEY)).rejects.toMatchObject({ status: 503 });
  });
});
