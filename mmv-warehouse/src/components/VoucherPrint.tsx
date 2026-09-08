import type { Voucher, VoucherItem, Material } from '@/lib/types'
import { fmtDate, fmtQty } from '@/lib/format'

type Item = VoucherItem & { material?: Material }

/** Bản in phiếu đúng format ISSUE / RECEIVING VOUCHER (A4 dọc) */
export function VoucherPrint({ voucher, items }: { voucher: Voucher; items: Item[] }) {
  const isOut = voucher.type === 'OUT'
  const title = isOut ? 'ISSUE VOUCHER' : 'RECEIVING VOUCHER'

  return (
    <div className="print-area mx-auto max-w-[800px] bg-white p-8 text-black">
      <div className="text-center">
        <div className="text-lg font-bold" style={{ color: '#1F4E79' }}>
          MERMAID MARITIME VIETNAM
        </div>
        <div className="mb-4 mt-1 text-2xl font-extrabold tracking-wide" style={{ color: '#C00000' }}>
          {title} - No: {voucher.voucher_no}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-1 text-[15px]">
        <div>
          <b>Date:</b> {fmtDate(voucher.date)}
        </div>
        <div>
          <b>Job No.:</b> {voucher.job_code ?? ''}
        </div>
        <div>
          <b>Receiver:</b> {voucher.receiver ?? ''}
        </div>
        {isOut ? (
          <div>
            <b>Vessel:</b> {voucher.vessel ?? ''}
          </div>
        ) : (
          <div>
            <b>Supplier:</b> {voucher.supplier ?? ''}
          </div>
        )}
      </div>

      <table className="w-full border-collapse text-[14px]" style={{ border: '1px solid #333' }}>
        <thead>
          <tr style={{ background: '#1F4E79', color: 'white' }}>
            <th className="border border-gray-500 px-2 py-1">No</th>
            <th className="border border-gray-500 px-2 py-1">Code</th>
            <th className="border border-gray-500 px-2 py-1 text-left">Description</th>
            <th className="border border-gray-500 px-2 py-1">Unit</th>
            <th className="border border-gray-500 px-2 py-1">Qty</th>
            <th className="border border-gray-500 px-2 py-1 text-left">Remarks</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id ?? i}>
              <td className="border border-gray-400 px-2 py-1 text-center">{i + 1}</td>
              <td className="border border-gray-400 px-2 py-1">{it.material_code}</td>
              <td className="border border-gray-400 px-2 py-1">
                {it.material?.description ?? it.material?.description_vi ?? ''}
              </td>
              <td className="border border-gray-400 px-2 py-1 text-center">{it.unit ?? it.material?.unit}</td>
              <td className="border border-gray-400 px-2 py-1 text-right">
                {fmtQty(it.qty_actual ?? it.qty_theory ?? 0)}
              </td>
              <td className="border border-gray-400 px-2 py-1">{it.remarks ?? ''}</td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="border border-gray-400 px-2 py-4 text-center text-gray-500">
                (Chưa có dòng hàng)
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="mt-12 grid grid-cols-3 gap-4 text-center text-[14px] font-bold">
        <div>
          RECEIVED BY
          <div className="mt-16 border-t border-gray-500 pt-1 font-normal text-gray-500">Ký, ghi rõ họ tên</div>
        </div>
        <div>
          CHECKED BY
          <div className="mt-16 border-t border-gray-500 pt-1 font-normal text-gray-500">Ký, ghi rõ họ tên</div>
        </div>
        <div>
          STORE KEEPER
          <div className="mt-16 border-t border-gray-500 pt-1 font-normal text-gray-500">Ký, ghi rõ họ tên</div>
        </div>
      </div>
    </div>
  )
}
