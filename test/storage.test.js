import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import storage from '../src/lib/storage.js';

const { saveFile, fileStream, deleteFile } = storage;
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// Spy on the real fs modules (same singletons the module requires) so no disk I/O happens
// and we can assert the pure path logic.
afterEach(() => vi.restoreAllMocks());

describe('saveFile', () => {
  it('writes under uploads/<userId>/<entityType>/<entityId>/ and returns a relative path', async () => {
    vi.spyOn(fsp, 'mkdir').mockResolvedValue(undefined);
    vi.spyOn(fsp, 'writeFile').mockResolvedValue(undefined);
    const buf = Buffer.from('hello');

    const rel = await saveFile(buf, {
      userId: 'u1', entityType: 'task', entityId: 't1', storedName: 'file.png',
    });

    expect(rel).toBe(path.join('u1', 'task', 't1', 'file.png'));
    expect(fsp.mkdir).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, 'u1', 'task', 't1'), { recursive: true });
    expect(fsp.writeFile).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, 'u1', 'task', 't1', 'file.png'), buf);
  });
});

describe('fileStream', () => {
  it('reads from uploads/<storedPath>', () => {
    const sentinel = { read: () => {} };
    vi.spyOn(fs, 'createReadStream').mockReturnValue(sentinel);

    const out = fileStream('u1/task/t1/file.png');

    expect(out).toBe(sentinel);
    expect(fs.createReadStream).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, 'u1/task/t1/file.png'));
  });
});

describe('deleteFile', () => {
  it('removes uploads/<storedPath> with force', async () => {
    vi.spyOn(fsp, 'rm').mockResolvedValue(undefined);

    await deleteFile('u1/task/t1/file.png');

    expect(fsp.rm).toHaveBeenCalledWith(path.join(UPLOAD_ROOT, 'u1/task/t1/file.png'), { force: true });
  });
});