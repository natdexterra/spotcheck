// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { downloadJson } from './download';

test('downloads JSON through a temporary anchor and revokes its object URL a task later', () => {
  vi.useFakeTimers();
  const create = vi.fn((_blob: Blob) => 'blob:session'); const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('session.json'); expect(this.href).toBe('blob:session');
  });
  downloadJson('session.json', '{"steps":[]}');
  expect(create.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
  expect(click).toHaveBeenCalledOnce();
  expect(document.querySelector('a')).toBeNull();
  // Revoking in the same task as the click cancels the download in browsers
  // that start fetching the blob asynchronously; the URL survives the task.
  expect(revoke).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(revoke).toHaveBeenCalledWith('blob:session');
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
