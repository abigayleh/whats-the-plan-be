import serializers from '../src/lib/serializers.js';

const { publicUser, serializeAttachment } = serializers;

describe('publicUser', () => {
  const row = {
    id: 'u1', email: 'a@b.com', name: 'Ada', emailVerified: true,
    passwordHash: 'SECRET-HASH', createdAt: new Date(), refreshTokens: [],
  };

  it('maps only the public fields', () => {
    expect(publicUser(row)).toEqual({ id: 'u1', email: 'a@b.com', name: 'Ada', emailVerified: true });
  });

  it('never leaks passwordHash (nor any other extra field)', () => {
    const out = publicUser(row);
    expect(out).not.toHaveProperty('passwordHash');
    expect(out).not.toHaveProperty('createdAt');
    expect(Object.keys(out).sort()).toEqual(['email', 'emailVerified', 'id', 'name']);
  });

  it('passes through a null name and false emailVerified', () => {
    const out = publicUser({ id: 'u2', email: 'x@y.z', name: null, emailVerified: false });
    expect(out).toEqual({ id: 'u2', email: 'x@y.z', name: null, emailVerified: false });
  });
});

describe('serializeAttachment', () => {
  const att = {
    id: 'att1', filename: 'f.png', storedPath: 'u1/task/t1/f.png', mimeType: 'image/png',
    sizeBytes: 1234, uploadedBy: 'u1', taskId: 't1', messageId: null, createdAt: new Date(0),
  };

  it('maps the public fields', () => {
    expect(serializeAttachment(att)).toEqual({
      id: 'att1', filename: 'f.png', mimeType: 'image/png', sizeBytes: 1234,
      uploadedBy: 'u1', taskId: 't1', messageId: null, createdAt: new Date(0),
    });
  });

  it('never leaks storedPath', () => {
    expect(serializeAttachment(att)).not.toHaveProperty('storedPath');
  });

  it('passes through null taskId / messageId', () => {
    const out = serializeAttachment({ ...att, taskId: null, messageId: 'm1' });
    expect(out.taskId).toBeNull();
    expect(out.messageId).toBe('m1');
  });
});