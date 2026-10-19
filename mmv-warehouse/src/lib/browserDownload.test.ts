import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareExcelDownload, startExcelDownload, revokeExcelDownload, saveExcelDownload } from './browserDownload';

const link = { href: '', download: '', hidden: false, click: vi.fn(), remove: vi.fn() };
const appendChild = vi.fn();

beforeEach(() => {
  link.href=''; link.download=''; link.hidden=false;
  link.click.mockReset(); link.remove.mockReset(); appendChild.mockReset();
  vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { appendChild } });
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:prepared-xlsx');
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(() => {});
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Excel browser download and persistent direct-click fallback', () => {
  it('prepares identical bytes with the XLSX MIME and preserves a readable filename', async () => {
    const file=prepareExcelDownload(new Uint8Array([80,75,3,4]),'YEU_CAU_MAU_OUT_2_26-1234.xlsx');
    const blob=vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([80,75,3,4]);
    expect(file).toEqual({url:'blob:prepared-xlsx',filename:'YEU_CAU_MAU_OUT_2_26-1234.xlsx'});
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
  it('attaches the anchor before clicking, removes only the element and keeps the reusable URL alive', () => {
    link.click.mockImplementation(() => expect(appendChild).toHaveBeenCalledWith(link));
    const file=prepareExcelDownload(new Uint8Array([1]),'request.xlsx');
    startExcelDownload(file);
    expect(link.href).toBe(file.url); expect(link.download).toBe(file.filename);
    expect(link.click).toHaveBeenCalledTimes(1); expect(link.remove).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    revokeExcelDownload(file);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(file.url);
  });
  it('preserves the prepared URL for a visible fallback if the automatic click is blocked', () => {
    const file=prepareExcelDownload(new Uint8Array([1]),'request.xlsx');
    link.click.mockImplementation(() => { throw new Error('browser blocked automatic download'); });
    expect(() => startExcelDownload(file)).toThrow('browser blocked');
    expect(link.remove).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  });
  it('does not revoke a one-shot download after only one second', () => {
    vi.useFakeTimers(); saveExcelDownload(new Uint8Array([1]),'out.xlsx');
    vi.advanceTimersByTime(1000); expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59000); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared-xlsx');
  });
  it('releases a failed one-shot download instead of leaking its URL', () => {
    link.click.mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveExcelDownload(new Uint8Array([1]),'out.xlsx')).toThrow('blocked');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:prepared-xlsx');
  });
  it('rejects empty files, paths and non-XLSX names before allocating URLs', () => {
    expect(() => prepareExcelDownload(new Uint8Array(),'out.xlsx')).toThrow('rỗng');
    for(const name of ['out.csv','../out.xlsx','dir\\out.xlsx','bad\nname.xlsx'])
      expect(() => prepareExcelDownload(new Uint8Array([1]),name)).toThrow('Tên file');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
