type Operator = {
  operator_id: string;
  operator_name: string;
  hours: number;
  calls: number;
  calls_per_hour: number;
  reached: number;
  meetings: number;
  below_target: boolean;
};

export function OperatorsTable({
  operators,
}: {
  operators: Operator[];
  target: number;
}) {
  if (operators.length === 0) {
    return (
      <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl">
        <h2 className="text-lg font-semibold text-text">Oper\u00e1to\u0159i</h2>
        <p className="text-sm text-muted mt-4">Dnes \u017e\u00e1dn\u00e1 data.</p>
      </div>
    );
  }

  return (
    <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-text">Oper\u00e1to\u0159i</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-muted text-left">
              <th className="px-2 py-2.5 font-medium border-b border-line">
                Oper\u00e1tor
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Hodiny
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Hovory
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Za hodinu
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Dovol\u00e1no
              </th>
              <th className="px-2 py-2.5 font-medium border-b border-line text-right">
                Konzultace
              </th>
            </tr>
          </thead>
          <tbody>
            {operators.map((op, i) => (
              <tr key={op.operator_id}>
                <td
                  className={`px-2 py-3 font-medium text-text ${
                    i < operators.length - 1 ? "border-b border-bg" : ""
                  }`}
                >
                  {op.operator_name}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-bg" : ""
                  }`}
                >
                  {op.hours.toFixed(1).replace(".", ",")}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-bg" : ""
                  }`}
                >
                  {op.calls}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-bg" : ""
                  } ${op.below_target ? "text-urgent" : ""}`}
                >
                  {op.calls_per_hour}
                  {op.below_target && (
                    <span className="text-urgent"> pod c\u00edlem</span>
                  )}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-bg" : ""
                  }`}
                >
                  {op.reached}
                </td>
                <td
                  className={`px-2 py-3 text-right font-mono ${
                    i < operators.length - 1 ? "border-b border-bg" : ""
                  }`}
                >
                  {op.meetings}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
